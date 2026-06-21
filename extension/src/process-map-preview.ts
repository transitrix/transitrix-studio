import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, extractDiagramMeta, CATALOGUE_STYLES, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { validateProcessMap } from '../../packages/diagrams/src/process-map/validate.js';

// ── Types (used by render helpers) ───────────────────────────────────────────

type ProcessGroupType = 'operating' | 'supporting' | 'management';
type ProcessStatus = 'Draft' | 'Active' | 'Deprecated';

interface MapProcess {
  process_id: string;
  name: string;
  status: ProcessStatus;
  owner_role?: string;
  capability?: string;
  maturity?: number;
  bpmn_file?: string;
  description?: string;
}

interface ProcessGroup {
  id: string;
  name: string;
  type: ProcessGroupType;
  description?: string;
  processes?: MapProcess[];
}

interface ProcessMapHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  groups: ProcessGroup[];
}

// ── HTML render helpers ───────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STATUS_BADGE: Record<string, string> = {
  Active:     'badge-active',
  Draft:      'badge-draft',
  Deprecated: 'badge-deprecated',
};

const GROUP_LABEL: Record<ProcessGroupType, string> = {
  operating:  'Operating',
  supporting: 'Supporting',
  management: 'Management',
};

function maturityDots(m: number | undefined): string {
  if (m === undefined) return '<span class="maturity-none">—</span>';
  return `<span class="maturity-dots">${'●'.repeat(m)}${'○'.repeat(5 - m)}</span>`;
}

function buildProcessRow(p: MapProcess): string {
  return `<tr>
  <td class="col-name">
    <div class="process-name">${escHtml(p.name)}</div>
    <div class="process-id">${escHtml(p.process_id)}</div>
    ${p.description ? `<div class="process-desc">${escHtml(p.description)}</div>` : ''}
  </td>
  <td class="col-status"><span class="badge ${escHtml(STATUS_BADGE[p.status] ?? '')}">${escHtml(p.status)}</span></td>
  <td class="col-maturity">${maturityDots(p.maturity)}</td>
  <td class="col-owner">${p.owner_role ? escHtml(p.owner_role) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-capability">${p.capability ? `<span class="cap-tag">${escHtml(p.capability)}</span>` : '<span class="cell-empty">—</span>'}</td>
  <td class="col-bpmn">${p.bpmn_file ? `<span class="bpmn-link" title="${escHtml(p.bpmn_file)}">📄 BPMN</span>` : '<span class="cell-empty">—</span>'}</td>
</tr>`;
}

function buildGroupSection(g: ProcessGroup): string {
  const processes = g.processes ?? [];
  const rows = processes.length === 0
    ? `<tr><td colspan="6" class="empty-group">No processes in this group.</td></tr>`
    : processes.map(buildProcessRow).join('\n');

  return `<section class="group-section group-${escHtml(g.type)}">
  <header class="group-header">
    <div class="group-meta">
      <span class="group-tag group-tag-${escHtml(g.type)}">${escHtml(GROUP_LABEL[g.type])}</span>
      <span class="group-id">${escHtml(g.id)}</span>
    </div>
    <h2 class="group-title">${escHtml(g.name)}</h2>
    ${g.description ? `<p class="group-desc">${escHtml(g.description)}</p>` : ''}
  </header>
  <table class="processes-table">
    <thead>
      <tr>
        <th>Process</th>
        <th>Status</th>
        <th>Maturity</th>
        <th>Owner</th>
        <th>Capability</th>
        <th>BPMN</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>`;
}

function buildProcessMapBody(map: ProcessMapHeader): string {
  if (map.groups.length === 0) {
    return '<div class="empty-map">No groups defined.</div>';
  }
  return map.groups.map(buildGroupSection).join('\n');
}

// ── ProcessMapPreview webview class ───────────────────────────────────────────

export class ProcessMapPreview {
  readonly panelTitle = 'Process Map Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();
    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'processMapPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.changeTheme'] },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.pushDocument(doc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName));
  }

  private buildHtml(yamlText: string, filename: string): string {
    let bodyContent = '';
    let errorMsg = '';
    let title: string | undefined;
    let subtitle: string | undefined;
    let version: string | undefined;
    let date: string | undefined;

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);

      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>;
        ({ title, subtitle, date, version } = extractDiagramMeta(raw));
      }

      const v = validateProcessMap(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const map = raw['process_map'] as ProcessMapHeader;
        bodyContent = buildProcessMapBody(map);
        if (!title) title = map.name;
        if (!subtitle && map.description) subtitle = map.description;
        if (!version && map.version) version = map.version;
        if (!date) date = map.updated_at;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const cfg = vscode.workspace.getConfiguration('transitrix');
    const themeId = cfg.get<ThemeId>('theme', 'transitrix');
    const colW = cfg.get<string>('report.columnWidth', 'normal');
    const colWPx = colW === 'narrow' ? 80 : colW === 'wide' ? 200 : 120;

    return buildDiagramFrame({
      filename,
      notation: 'Process Map',
      bodyContent,
      errorMsg,
      themeId,
      title,
      subtitle,
      version,
      date,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n` + CATALOGUE_STYLES + PROCESS_MAP_STYLES,
      themeCommand: OPEN_THEME_COMMAND,
    });
  }
}

const PROCESS_MAP_STYLES = `
  .group-section {
    margin-bottom: 24px;
    border: 1px solid var(--ts-divider, #cbd5e1);
    border-radius: 8px;
    overflow: hidden;
    background: var(--ts-bg, #ffffff);
  }
  .group-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
  }
  .group-section.group-operating .group-header  { background: var(--ts-status-info-bg, #e0f2fe); }
  .group-section.group-supporting .group-header { background: var(--ts-bg-elevated, #f1f5f9); }
  .group-section.group-management .group-header { background: var(--ts-status-warning-bg, #fef9c3); }
  .group-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .group-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    white-space: nowrap;
    color: #fff;
  }
  .group-tag-operating  { background: var(--ts-brand-primary, #004d67); }
  .group-tag-supporting { background: var(--ts-text-muted, #64748b); }
  .group-tag-management { background: var(--ts-status-warning-fg, #854d0e); }
  .group-id {
    font-family: monospace;
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
  }
  .group-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--ts-text, #0f172a);
  }
  .group-desc {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
  }
  .processes-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--ts-text, #0f172a);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
  }
  .processes-table th {
    text-align: left;
    padding: 8px 12px;
    background: var(--ts-bg-elevated, #f1f5f9);
    color: var(--ts-text-muted, #64748b);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
  }
  .processes-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
    vertical-align: top;
  }
  .processes-table tr:last-child td {
    border-bottom: none;
  }
  .processes-table tr:hover td {
    background: var(--ts-bg-elevated, #f1f5f9);
  }
  .process-name { font-weight: 600; }
  .process-id {
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
    font-family: monospace;
    margin-top: 2px;
  }
  .process-desc {
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
    margin-top: 4px;
  }
  .cap-tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--ts-bg-elevated, #f1f5f9);
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
    font-family: monospace;
  }
  .bpmn-link {
    font-size: 12px;
    color: var(--ts-brand-primary, #004d67);
  }
  .col-name      { min-width: var(--ts-col-w, 220px); }
  .col-status, .col-maturity, .col-owner, .col-capability, .col-bpmn { white-space: nowrap; }
  .empty-group, .empty-map {
    text-align: center;
    color: var(--ts-text-muted, #64748b);
  }
  .empty-group { padding: 18px; }
  .empty-map   { padding: 48px; }
`;
