import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, CATALOGUE_STYLES, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';
import { validateProductsCatalogue } from '../../packages/diagrams/src/products/validate.js';

// ── Types (used by render helpers) ───────────────────────────────────────────

type ProductType = 'digital_product' | 'service' | 'platform' | 'bundle';
type ProductStatus = 'Draft' | 'Active' | 'Deprecated';

interface Product {
  product_id: string;
  name: string;
  type: ProductType;
  status: ProductStatus;
  domain?: string;
  owner_role?: string;
  maturity?: number;
  description?: string;
  capabilities?: string[];
  processes?: string[];
  supporting_apps?: string[];
}

interface ProductsCatalogueHeader {
  id: string;
  name: string;
  description?: string;
  version?: string;
  updated_at: string;
  products: Product[];
}

// ── HTML table render helpers ─────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const BADGE_CLASS: Record<string, string> = {
  Active:     'badge-active',
  Draft:      'badge-draft',
  Deprecated: 'badge-deprecated',
};

const TYPE_LABEL: Record<string, string> = {
  digital_product: 'Digital Product',
  service:         'Service',
  platform:        'Platform',
  bundle:          'Bundle',
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

function buildProductsTable(catalogue: ProductsCatalogueHeader): string {
  const rows = catalogue.products.map(p => {
    const extras = [
      disclosureList('Capabilities', p.capabilities),
      disclosureList('Processes', p.processes),
      disclosureList('Apps', p.supporting_apps),
    ].filter(Boolean).join('');

    return `<tr>
  <td class="col-name">
    <div class="product-name">${escHtml(p.name)}</div>
    <div class="product-id">${escHtml(p.product_id)}</div>
    ${p.description ? `<div class="product-desc">${escHtml(p.description)}</div>` : ''}
    ${extras}
  </td>
  <td class="col-type"><span class="type-tag">${escHtml(TYPE_LABEL[p.type] ?? p.type)}</span></td>
  <td class="col-status"><span class="badge ${escHtml(BADGE_CLASS[p.status] ?? '')}">${escHtml(p.status)}</span></td>
  <td class="col-maturity">${maturityDots(p.maturity)}</td>
  <td class="col-domain">${p.domain ? escHtml(p.domain) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-owner">${p.owner_role ? escHtml(p.owner_role) : '<span class="cell-empty">—</span>'}</td>
</tr>`;
  }).join('\n');

  const emptyRow = catalogue.products.length === 0
    ? `<tr><td colspan="6" class="empty-catalogue">No products defined.</td></tr>`
    : '';

  return `<table class="products-table">
  <thead>
    <tr>
      <th>Name / ID</th>
      <th>Type</th>
      <th>Status</th>
      <th>Maturity</th>
      <th>Domain</th>
      <th>Owner Role</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    ${emptyRow}
  </tbody>
</table>`;
}

// ── ProductsPreview webview class ─────────────────────────────────────────────

export class ProductsPreview {
  readonly panelTitle = 'Products Preview';
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
        'productsPreview',
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
        if (typeof raw['title'] === 'string') title = raw['title'];
        if (typeof raw['description'] === 'string') subtitle = raw['description'];
        if (typeof raw['version'] === 'string') version = String(raw['version']);
        if (typeof raw['date'] === 'string') date = raw['date'];
      }

      const v = validateProductsCatalogue(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const catalogue = raw['products_catalogue'] as ProductsCatalogueHeader;
        bodyContent = buildProductsTable(catalogue);
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
      notation: 'Products',
      bodyContent,
      errorMsg,
      themeId,
      title,
      subtitle,
      version,
      date,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n` + CATALOGUE_STYLES + PRODUCTS_STYLES,
      themeCommand: OPEN_THEME_COMMAND,
    });
  }
}

const PRODUCTS_STYLES = `
  .products-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    color: var(--ts-text, #0f172a);
    font-family: var(--vscode-font-family, system-ui, sans-serif);
  }
  .products-table th {
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
  .products-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--ts-divider, #cbd5e1);
    vertical-align: top;
  }
  .products-table tr:last-child td { border-bottom: none; }
  .products-table tr:hover td { background: var(--ts-bg-elevated, #f1f5f9); }
  .product-name { font-weight: 600; }
  .product-id {
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
    font-family: monospace;
    margin-top: 2px;
  }
  .product-desc {
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
    margin-top: 4px;
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
  .col-name { min-width: var(--ts-col-w, 200px); }
  .col-type, .col-status, .col-maturity, .col-domain, .col-owner { white-space: nowrap; }
`;
