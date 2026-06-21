import * as path from 'node:path';
import { escHtml } from '../../packages/diagrams/src/webview/render-util.js';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, extractDiagramMeta, CATALOGUE_STYLES, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { validateApplicationsCatalogue } from '../../packages/diagrams/src/applications/validate.js';

// ── Types (used by render helpers) ───────────────────────────────────────────

type ApplicationType = 'application' | 'integration' | 'platform' | 'data_store';
type ApplicationStatus = 'Draft' | 'Active' | 'Deprecated' | 'Decommissioning';
type IntegrationDirection = 'inbound' | 'outbound' | 'bidirectional';

interface ApplicationIntegration {
  target?: string;
  direction?: IntegrationDirection;
  protocol?: string;
  description?: string;
}

interface Application {
  app_id: string;
  name: string;
  type: ApplicationType;
  status: ApplicationStatus;
  domain?: string;
  owner_role?: string;
  vendor?: string;
  maturity?: number;
  description?: string;
  capabilities?: string[];
  products?: string[];
  integrations?: ApplicationIntegration[];
  source?: string;
  target?: string;
  protocol?: string;
}

interface ApplicationsCatalogueHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  applications: Application[];
}

// ── HTML table render helpers ─────────────────────────────────────────────────

const BADGE_CLASS: Record<string, string> = {
  Active:          'badge-active',
  Draft:           'badge-draft',
  Deprecated:      'badge-deprecated',
  Decommissioning: 'badge-decommissioning',
};

const TYPE_LABEL: Record<string, string> = {
  application: 'Application',
  integration: 'Integration',
  platform:    'Platform',
  data_store:  'Data Store',
};

function maturityDots(m: number | undefined): string {
  if (m === undefined) return '<span class="maturity-none">—</span>';
  return `<span class="maturity-dots">${'●'.repeat(m)}${'○'.repeat(5 - m)}</span>`;
}

function disclosureList(label: string, items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  const lis = items.map(i => `<li>${escHtml(i)}</li>`).join('');
  return `<details><summary>${label} (${items.length})</summary><ul>${lis}</ul></details>`;
}

function renderIntegrations(integrations: ApplicationIntegration[] | undefined): string {
  if (!integrations || integrations.length === 0) return '';
  const items = integrations.map(intg => {
    const parts = [
      intg.target ? escHtml(intg.target) : '?',
      intg.direction ? `<span class="intg-dir">${escHtml(intg.direction)}</span>` : '',
      intg.protocol ? `<span class="intg-proto">${escHtml(intg.protocol)}</span>` : '',
    ].filter(Boolean).join(' ');
    const desc = intg.description ? `<span class="intg-desc">${escHtml(intg.description)}</span>` : '';
    return `<li>${parts}${desc ? ' — ' + desc : ''}</li>`;
  }).join('');
  return `<details><summary>Integrations (${integrations.length})</summary><ul>${items}</ul></details>`;
}

function buildApplicationsTable(catalogue: ApplicationsCatalogueHeader): string {
  const rows = catalogue.applications.map(a => {
    const extras = [
      renderIntegrations(a.integrations),
      disclosureList('Capabilities', a.capabilities),
      disclosureList('Products', a.products),
    ].filter(Boolean).join('');

    const vendorCell = a.vendor
      ? `<span class="${a.vendor === 'Internal' ? 'vendor-internal' : 'vendor-external'}">${escHtml(a.vendor)}</span>`
      : '<span class="cell-empty">—</span>';

    return `<tr>
  <td class="col-name">
    <div class="app-name">${escHtml(a.name)}</div>
    <div class="app-id">${escHtml(a.app_id)}</div>
    ${a.description ? `<div class="app-desc">${escHtml(a.description)}</div>` : ''}
    ${extras}
  </td>
  <td class="col-type"><span class="type-tag">${escHtml(TYPE_LABEL[a.type] ?? a.type)}</span></td>
  <td class="col-status"><span class="badge ${escHtml(BADGE_CLASS[a.status] ?? '')}">${escHtml(a.status)}</span></td>
  <td class="col-maturity">${maturityDots(a.maturity)}</td>
  <td class="col-domain">${a.domain ? escHtml(a.domain) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-vendor">${vendorCell}</td>
  <td class="col-owner">${a.owner_role ? escHtml(a.owner_role) : '<span class="cell-empty">—</span>'}</td>
</tr>`;
  }).join('\n');

  const emptyRow = catalogue.applications.length === 0
    ? `<tr><td colspan="7" class="empty-catalogue">No applications defined.</td></tr>`
    : '';

  return `<table class="applications-table">
  <thead>
    <tr>
      <th>Name / ID</th>
      <th>Type</th>
      <th>Status</th>
      <th>Maturity</th>
      <th>Domain</th>
      <th>Vendor</th>
      <th>Owner Role</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    ${emptyRow}
  </tbody>
</table>`;
}

// ── ApplicationsPreview webview class ────────────────────────────────────────

export class ApplicationsPreview {
  readonly panelTitle = 'Applications Preview';
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
        'applicationsPreview',
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

      const v = validateApplicationsCatalogue(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const catalogue = raw['applications_catalogue'] as ApplicationsCatalogueHeader;
        bodyContent = buildApplicationsTable(catalogue);
        if (!title) title = catalogue.name;
        if (!subtitle && catalogue.description) subtitle = catalogue.description;
        if (!version && catalogue.version) version = catalogue.version;
        if (!date) date = catalogue.updated_at;
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
      notation: 'Applications',
      bodyContent,
      errorMsg,
      themeId,
      title,
      subtitle,
      version,
      date,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n` + CATALOGUE_STYLES + APPLICATIONS_STYLES,
      themeCommand: OPEN_THEME_COMMAND,
    });
  }
}

const APPLICATIONS_STYLES = `
  .applications-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--ts-text, #0f172a);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
  }
  .applications-table th {
    text-align: left;
    padding: 8px 12px;
    background: var(--ts-brand-primary, #004d67);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .applications-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
    vertical-align: top;
  }
  .applications-table tr:last-child td { border-bottom: none; }
  .applications-table tr:hover td { background: var(--ts-bg-elevated, #f1f5f9); }
  .app-name { font-weight: 600; }
  .app-id {
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
    font-family: monospace;
    margin-top: 2px;
  }
  .app-desc {
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
    margin-top: 4px;
  }
  .intg-dir {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--ts-bg-elevated, #f1f5f9);
    font-size: 10px;
    color: var(--ts-text-muted, #64748b);
  }
  .intg-proto {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--ts-bg-elevated, #f1f5f9);
    font-size: 10px;
    font-family: monospace;
    color: var(--ts-text-muted, #64748b);
  }
  .intg-desc {
    color: var(--ts-text-muted, #64748b);
    font-size: 11px;
  }
  .type-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    background: var(--ts-bg-elevated, #f1f5f9);
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
    white-space: nowrap;
  }
  .vendor-internal { color: var(--ts-text-muted, #64748b); }
  .vendor-external { color: var(--ts-text, #0f172a); }
  .col-name { min-width: var(--ts-col-w, 200px); }
  .col-type, .col-status, .col-maturity, .col-domain, .col-vendor, .col-owner { white-space: nowrap; }
`;
