import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, CATALOGUE_STYLES, type ThemeId } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';

// ── Inline types (mirror packages/diagrams/src/applications/types.ts) ─────────

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

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation (mirrors packages/diagrams/src/applications/validate.ts) ─

const VALID_TYPES = new Set<string>(['application', 'integration', 'platform', 'data_store']);
const VALID_STATUSES = new Set<string>(['Draft', 'Active', 'Deprecated', 'Decommissioning']);
const VALID_DIRECTIONS = new Set<string>(['inbound', 'outbound', 'bidirectional']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateApplicationsCatalogue(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'APP-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'APP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'applications') {
    errors.push({ code: 'APP-001', message: `notation must be "applications", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!raw['applications_catalogue'] || typeof raw['applications_catalogue'] !== 'object') {
    errors.push({ code: 'APP-002', message: 'Missing required field: applications_catalogue' });
    return { valid: false, errors, warnings };
  }
  const cat = raw['applications_catalogue'] as Record<string, unknown>;

  if (!cat['id'] || typeof cat['id'] !== 'string' || !(cat['id'] as string).trim())
    errors.push({ code: 'APP-002', message: 'applications_catalogue.id is required' });
  if (!cat['name'] || typeof cat['name'] !== 'string' || !(cat['name'] as string).trim())
    errors.push({ code: 'APP-002', message: 'applications_catalogue.name is required' });
  if (!cat['updated_at'] || typeof cat['updated_at'] !== 'string')
    errors.push({ code: 'APP-002', message: 'applications_catalogue.updated_at is required' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(cat['updated_at'] as string))
    errors.push({ code: 'APP-007', message: `applications_catalogue.updated_at must be YYYY-MM-DD, got "${cat['updated_at']}"` });

  const applications = cat['applications'];
  if (!Array.isArray(applications)) {
    errors.push({ code: 'APP-002', message: 'applications_catalogue.applications must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < applications.length; i++) {
    const a = applications[i] as Record<string, unknown>;
    const idx = `applications[${i}]`;

    if (!a['app_id'] || typeof a['app_id'] !== 'string' || !(a['app_id'] as string).trim()) {
      errors.push({ code: 'APP-003', message: `${idx}: app_id is required` });
    } else {
      const aid = a['app_id'] as string;
      if (seenIds.has(aid)) errors.push({ code: 'APP-008', message: `Duplicate app_id: "${aid}"` });
      seenIds.add(aid);
    }
    if (!a['name'] || typeof a['name'] !== 'string' || !(a['name'] as string).trim())
      errors.push({ code: 'APP-003', message: `${idx}: name is required` });
    if (!a['type']) errors.push({ code: 'APP-003', message: `${idx}: type is required` });
    if (!a['status']) errors.push({ code: 'APP-003', message: `${idx}: status is required` });
    if (a['type'] && !VALID_TYPES.has(a['type'] as string))
      errors.push({ code: 'APP-004', message: `${idx}: type "${a['type']}" must be one of: application, integration, platform, data_store` });
    if (a['status'] && !VALID_STATUSES.has(a['status'] as string))
      errors.push({ code: 'APP-005', message: `${idx}: status "${a['status']}" must be one of: Draft, Active, Deprecated, Decommissioning` });
    if (a['maturity'] !== undefined) {
      const m = a['maturity'];
      if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 5)
        errors.push({ code: 'APP-006', message: `${idx}: maturity must be an integer 1–5, got "${m}"` });
    }
    if (Array.isArray(a['integrations'])) {
      const intgs = a['integrations'] as Record<string, unknown>[];
      for (let j = 0; j < intgs.length; j++) {
        const intg = intgs[j];
        if (intg['direction'] !== undefined && !VALID_DIRECTIONS.has(intg['direction'] as string))
          errors.push({ code: 'APP-009', message: `${idx}.integrations[${j}]: direction "${intg['direction']}" must be one of: inbound, outbound, bidirectional` });
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

// ── HTML table render helpers ─────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
        if (raw['version'] !== undefined) version = String(raw['version']);
        if (typeof raw['date'] === 'string') date = raw['date'];
      }

      const v = validateApplicationsCatalogue(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const catalogue = raw['applications_catalogue'] as ApplicationsCatalogueHeader;
        bodyContent = buildApplicationsTable(catalogue);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

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
      extraStyles: CATALOGUE_STYLES + APPLICATIONS_STYLES,
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
    font-style: italic;
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
  .vendor-internal { font-style: italic; color: var(--ts-text-muted, #64748b); }
  .vendor-external { color: var(--ts-text, #0f172a); }
  .col-name { min-width: 200px; }
  .col-type, .col-status, .col-maturity, .col-domain, .col-vendor, .col-owner { white-space: nowrap; }
`;
