import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, CATALOGUE_STYLES, type ThemeId } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { validateScenario } from '../../packages/diagrams/src/scenarios/validate.js';

// ── Types (used by render helpers) ───────────────────────────────────────────

type ScenarioStatus = 'Draft' | 'Active' | 'Archived';
type FactorRelevance = 'High' | 'Medium' | 'Low';

interface FactorView { factor_id: string; relevance?: FactorRelevance; impact?: string }

interface ScenarioHeader {
  id: string;
  name: string;
  description?: string;
  status: ScenarioStatus;
  created_at?: string;
  vision?: string;
  factors_view?: FactorView[];
  goals?: Array<{ goal_id: string }>;
  capabilities?: Array<{ capability_id: string }>;
  activities?: Array<{ activity_id: string }>;
  products?: Array<{ product_id: string }>;
  processes?: Array<{ process_id: string }>;
  applications?: Array<{ app_id: string }>;
}

// ── HTML render helpers ───────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const STATUS_BADGE: Record<string, string> = {
  Active:   'badge-active',
  Draft:    'badge-draft',
  Archived: 'badge-archived',
};

const RELEVANCE_BADGE: Record<string, string> = {
  High:   'badge-high',
  Medium: 'badge-medium',
  Low:    'badge-low',
};

function buildFactorsTable(factors: FactorView[] | undefined): string {
  if (!factors || factors.length === 0) return '';
  const rows = factors.map(f => `<tr>
  <td class="col-factor-id">${escHtml(f.factor_id)}</td>
  <td class="col-relevance">${f.relevance ? `<span class="badge ${escHtml(RELEVANCE_BADGE[f.relevance] ?? '')}">${escHtml(f.relevance)}</span>` : '<span class="cell-empty">—</span>'}</td>
  <td class="col-impact">${f.impact ? escHtml(f.impact) : '<span class="cell-empty">—</span>'}</td>
</tr>`).join('\n');

  return `<section class="scn-section">
  <h2 class="scn-section-title">Factors view <span class="scn-count">${factors.length}</span></h2>
  <table class="scn-table">
    <thead>
      <tr><th>Factor ID</th><th>Relevance</th><th>Impact</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildRefSection(label: string, items: string[]): string {
  if (items.length === 0) return '';
  const lis = items.map(id => `<li><code>${escHtml(id)}</code></li>`).join('');
  return `<section class="scn-section">
  <h2 class="scn-section-title">${escHtml(label)} <span class="scn-count">${items.length}</span></h2>
  <ul class="scn-ref-list">${lis}</ul>
</section>`;
}

function extractIds<T extends Record<string, unknown>>(list: T[] | undefined, key: string): string[] {
  return (list ?? []).map(x => String(x[key] ?? ''));
}

function buildScenarioBody(scn: ScenarioHeader): string {
  const blocks: string[] = [];

  if (scn.vision) {
    blocks.push(`<section class="scn-section scn-vision">
  <h2 class="scn-section-title">Vision</h2>
  <p class="scn-vision-text">${escHtml(scn.vision)}</p>
</section>`);
  }

  blocks.push(buildFactorsTable(scn.factors_view));
  blocks.push(buildRefSection('Goals',        extractIds(scn.goals, 'goal_id')));
  blocks.push(buildRefSection('Capabilities', extractIds(scn.capabilities, 'capability_id')));
  blocks.push(buildRefSection('Activities',   extractIds(scn.activities, 'activity_id')));
  blocks.push(buildRefSection('Products',     extractIds(scn.products, 'product_id')));
  blocks.push(buildRefSection('Processes',    extractIds(scn.processes, 'process_id')));
  blocks.push(buildRefSection('Applications', extractIds(scn.applications, 'app_id')));

  const content = blocks.filter(Boolean).join('\n');
  if (!content) {
    return '<div class="empty-scenario">Scenario has no content yet (no vision, factors, or references).</div>';
  }

  const statusBadge = `<span class="badge ${escHtml(STATUS_BADGE[scn.status] ?? '')}">${escHtml(scn.status)}</span>`;
  const header = `<section class="scn-header-section">
  <div class="scn-meta-row">
    ${statusBadge}
    <span class="scn-meta-id">${escHtml(scn.id)}</span>
  </div>
  ${scn.description ? `<p class="scn-description">${escHtml(scn.description)}</p>` : ''}
</section>`;

  return header + '\n' + content;
}

// ── ScenariosPreview webview class ────────────────────────────────────────────

export class ScenariosPreview {
  readonly panelTitle = 'Scenario Preview';
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
        'scenariosPreview',
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
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>;
        if (typeof raw['title'] === 'string') title = raw['title'];
        if (typeof raw['description'] === 'string') subtitle = raw['description'];
        if (typeof raw['version'] === 'string') version = String(raw['version']);
        if (typeof raw['date'] === 'string') date = raw['date'];
      }

      const v = validateScenario(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const scn = raw['scenario'] as ScenarioHeader;
        bodyContent = buildScenarioBody(scn);
        if (!title) title = scn.name;
        if (!subtitle && scn.description) subtitle = scn.description;
        if (!date && scn.created_at) date = scn.created_at;
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
      notation: 'Scenario',
      bodyContent,
      errorMsg,
      themeId,
      title,
      subtitle,
      version,
      date,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n` + CATALOGUE_STYLES + SCENARIOS_STYLES,
    });
  }
}

const SCENARIOS_STYLES = `
  .scn-header-section {
    margin-bottom: 16px;
  }
  .scn-meta-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;
  }
  .scn-meta-id {
    font-family: monospace;
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
  }
  .scn-description {
    font-size: 13px;
    color: var(--ts-text-muted, #64748b);
    margin: 0;
  }
  .scn-section {
    margin-bottom: 20px;
    border: 1px solid var(--ts-divider, #cbd5e1);
    border-radius: 8px;
    padding: 14px 16px;
    background: var(--ts-bg, #ffffff);
  }
  .scn-vision {
    background: var(--ts-status-info-bg, #e0f2fe);
  }
  .scn-vision-text {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--ts-text, #0f172a);
    white-space: pre-wrap;
  }
  .scn-section-title {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--ts-text, #0f172a);
    letter-spacing: 0.02em;
  }
  .scn-count {
    display: inline-block;
    margin-left: 6px;
    padding: 1px 7px;
    border-radius: 10px;
    background: var(--ts-bg-elevated, #f1f5f9);
    color: var(--ts-text-muted, #64748b);
    font-size: 11px;
    font-weight: 600;
    vertical-align: 2px;
  }
  .scn-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--ts-text, #0f172a);
  }
  .scn-table th {
    text-align: left;
    padding: 6px 10px;
    background: var(--ts-bg-elevated, #f1f5f9);
    color: var(--ts-text-muted, #64748b);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
  }
  .scn-table td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
    vertical-align: top;
  }
  .scn-table tr:last-child td { border-bottom: none; }
  .col-factor-id { font-family: monospace; white-space: nowrap; min-width: var(--ts-col-w, 120px); }
  .col-relevance { white-space: nowrap; }
  .scn-ref-list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .scn-ref-list li {
    padding: 0;
  }
  .scn-ref-list code {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--ts-bg-elevated, #f1f5f9);
    color: var(--ts-text, #0f172a);
    font-family: monospace;
    font-size: 12px;
    border: 1px solid var(--ts-divider, #cbd5e1);
  }
  /* Scenarios uses "archived" as muted (dormant), not warning — overrides catalogue default. */
  .badge-archived { background: var(--ts-bg-elevated, #f1f5f9); color: var(--ts-text-muted, #64748b); }
  /* Relevance ladder — scenarios-specific. */
  .badge-high   { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
  .badge-medium { background: var(--ts-status-info-bg, #e0f2fe);    color: var(--ts-status-info-fg, #0c4a6e); }
  .badge-low    { background: var(--ts-bg-elevated, #f1f5f9);       color: var(--ts-text-muted, #64748b); }
  .empty-scenario {
    text-align: center;
    color: var(--ts-text-muted, #64748b);
    padding: 48px;
  }
`;
