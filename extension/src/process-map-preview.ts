import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, type ThemeId } from './diagram-frame.js';

// ── Inline types (mirror packages/diagrams/src/process-map/types.ts) ──────────

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

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation (mirrors packages/diagrams/src/process-map/validate.ts) ─

const VALID_GROUP_TYPES = new Set<string>(['operating', 'supporting', 'management']);
const VALID_STATUSES = new Set<string>(['Draft', 'Active', 'Deprecated']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateProcessMap(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'PMAP-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'PMAP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'process-map') {
    errors.push({ code: 'PMAP-001', message: `notation must be "process-map", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const map = raw['process_map'];
  if (!map || typeof map !== 'object') {
    errors.push({ code: 'PMAP-002', message: 'Missing required field: process_map' });
    return { valid: false, errors, warnings };
  }
  const m = map as Record<string, unknown>;

  if (!m['id'] || typeof m['id'] !== 'string' || !(m['id'] as string).trim())
    errors.push({ code: 'PMAP-002', message: 'process_map.id is required' });
  if (!m['name'] || typeof m['name'] !== 'string' || !(m['name'] as string).trim())
    errors.push({ code: 'PMAP-002', message: 'process_map.name is required' });
  if (!m['updated_at'] || typeof m['updated_at'] !== 'string')
    errors.push({ code: 'PMAP-002', message: 'process_map.updated_at is required' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(m['updated_at'] as string))
    errors.push({ code: 'PMAP-008', message: `process_map.updated_at must be YYYY-MM-DD, got "${m['updated_at']}"` });

  const groups = m['groups'];
  if (!Array.isArray(groups)) {
    errors.push({ code: 'PMAP-002', message: 'process_map.groups must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenGroupIds = new Set<string>();
  const seenProcessIds = new Set<string>();
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi] as Record<string, unknown>;
    const gIdx = `groups[${gi}]`;
    if (!g['id'] || typeof g['id'] !== 'string' || !(g['id'] as string).trim()) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: id is required` });
    } else {
      const gid = g['id'] as string;
      if (seenGroupIds.has(gid)) errors.push({ code: 'PMAP-010', message: `Duplicate group id: "${gid}"` });
      seenGroupIds.add(gid);
    }
    if (!g['name'] || typeof g['name'] !== 'string' || !(g['name'] as string).trim())
      errors.push({ code: 'PMAP-003', message: `${gIdx}: name is required` });
    if (!g['type']) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: type is required` });
    } else if (!VALID_GROUP_TYPES.has(g['type'] as string)) {
      errors.push({ code: 'PMAP-004', message: `${gIdx}: type "${g['type']}" must be one of: operating, supporting, management` });
    }

    const processes = g['processes'];
    if (processes !== undefined && !Array.isArray(processes)) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: processes must be an array` });
      continue;
    }
    const list = (processes ?? []) as unknown[];
    for (let pi = 0; pi < list.length; pi++) {
      const p = list[pi] as Record<string, unknown>;
      const pIdx = `${gIdx}.processes[${pi}]`;
      if (!p['process_id'] || typeof p['process_id'] !== 'string' || !(p['process_id'] as string).trim()) {
        errors.push({ code: 'PMAP-005', message: `${pIdx}: process_id is required` });
      } else {
        const pid = p['process_id'] as string;
        if (seenProcessIds.has(pid)) errors.push({ code: 'PMAP-009', message: `Duplicate process_id: "${pid}"` });
        seenProcessIds.add(pid);
      }
      if (!p['name'] || typeof p['name'] !== 'string' || !(p['name'] as string).trim())
        errors.push({ code: 'PMAP-005', message: `${pIdx}: name is required` });
      if (!p['status']) {
        errors.push({ code: 'PMAP-005', message: `${pIdx}: status is required` });
      } else if (!VALID_STATUSES.has(p['status'] as string)) {
        errors.push({ code: 'PMAP-006', message: `${pIdx}: status "${p['status']}" must be one of: Draft, Active, Deprecated` });
      }
      if (p['maturity'] !== undefined) {
        const mat = p['maturity'];
        if (typeof mat !== 'number' || !Number.isInteger(mat) || mat < 1 || mat > 5)
          errors.push({ code: 'PMAP-007', message: `${pIdx}: maturity must be an integer 1–5, got "${mat}"` });
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
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
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
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
      const parsed = yaml.load(yamlText) as unknown;

      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>;
        if (typeof raw['title'] === 'string') title = raw['title'];
        if (typeof raw['description'] === 'string') subtitle = raw['description'];
        if (typeof raw['version'] === 'string') version = String(raw['version']);
        if (typeof raw['date'] === 'string') date = raw['date'];
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

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

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
      extraStyles: PROCESS_MAP_STYLES,
    });
  }
}

const PROCESS_MAP_STYLES = `
  #canvas {
    padding: 0 20px 16px;
  }
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
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-active     { background: var(--ts-status-success-bg, #d1fae5); color: var(--ts-status-success-fg, #065f46); }
  .badge-draft      { background: var(--ts-status-info-bg, #e0f2fe);   color: var(--ts-status-info-fg, #0c4a6e); }
  .badge-deprecated { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
  .maturity-dots {
    font-size: 14px;
    letter-spacing: 1px;
    color: var(--ts-brand-primary, #004d67);
  }
  .maturity-none { color: var(--ts-text-muted, #64748b); }
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
  .cell-empty { color: var(--ts-text-muted, #94a3b8); }
  .col-name      { min-width: 220px; }
  .col-status, .col-maturity, .col-owner, .col-capability, .col-bpmn { white-space: nowrap; }
  .empty-group {
    text-align: center;
    color: var(--ts-text-muted, #64748b);
    padding: 18px;
    font-style: italic;
  }
  .empty-map {
    text-align: center;
    color: var(--ts-text-muted, #64748b);
    padding: 48px;
    font-style: italic;
  }
`;
