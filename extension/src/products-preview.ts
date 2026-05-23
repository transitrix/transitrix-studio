import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, CATALOGUE_STYLES, type ThemeId } from './diagram-frame.js';

// ── Inline types (mirror packages/diagrams/src/products/types.ts) ─────────────

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

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation (mirrors packages/diagrams/src/products/validate.ts) ────

const VALID_TYPES = new Set<string>(['digital_product', 'service', 'platform', 'bundle']);
const VALID_STATUSES = new Set<string>(['Draft', 'Active', 'Deprecated']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateProductsCatalogue(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'PROD-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'PROD-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'products') {
    errors.push({ code: 'PROD-001', message: `notation must be "products", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const cat = (raw['products_catalogue'] ?? {}) as Record<string, unknown>;
  if (!raw['products_catalogue'] || typeof raw['products_catalogue'] !== 'object') {
    errors.push({ code: 'PROD-002', message: 'Missing required field: products_catalogue' });
    return { valid: false, errors, warnings };
  }
  if (!cat['id'] || typeof cat['id'] !== 'string' || !(cat['id'] as string).trim())
    errors.push({ code: 'PROD-002', message: 'products_catalogue.id is required' });
  if (!cat['name'] || typeof cat['name'] !== 'string' || !(cat['name'] as string).trim())
    errors.push({ code: 'PROD-002', message: 'products_catalogue.name is required' });
  if (!cat['updated_at'] || typeof cat['updated_at'] !== 'string')
    errors.push({ code: 'PROD-002', message: 'products_catalogue.updated_at is required' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(cat['updated_at'] as string))
    errors.push({ code: 'PROD-007', message: `products_catalogue.updated_at must be YYYY-MM-DD, got "${cat['updated_at']}"` });

  const products = cat['products'];
  if (!Array.isArray(products)) {
    errors.push({ code: 'PROD-002', message: 'products_catalogue.products must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  for (let i = 0; i < products.length; i++) {
    const p = products[i] as Record<string, unknown>;
    const idx = `products[${i}]`;
    if (!p['product_id'] || typeof p['product_id'] !== 'string' || !(p['product_id'] as string).trim()) {
      errors.push({ code: 'PROD-003', message: `${idx}: product_id is required` });
    } else {
      const pid = p['product_id'] as string;
      if (seenIds.has(pid)) errors.push({ code: 'PROD-008', message: `Duplicate product_id: "${pid}"` });
      seenIds.add(pid);
    }
    if (!p['name'] || typeof p['name'] !== 'string' || !(p['name'] as string).trim())
      errors.push({ code: 'PROD-003', message: `${idx}: name is required` });
    if (!p['type']) errors.push({ code: 'PROD-003', message: `${idx}: type is required` });
    if (!p['status']) errors.push({ code: 'PROD-003', message: `${idx}: status is required` });
    if (p['type'] && !VALID_TYPES.has(p['type'] as string))
      errors.push({ code: 'PROD-004', message: `${idx}: type "${p['type']}" must be one of: digital_product, service, platform, bundle` });
    if (p['status'] && !VALID_STATUSES.has(p['status'] as string))
      errors.push({ code: 'PROD-005', message: `${idx}: status "${p['status']}" must be one of: Draft, Active, Deprecated` });
    if (p['maturity'] !== undefined) {
      const m = p['maturity'];
      if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 5)
        errors.push({ code: 'PROD-006', message: `${idx}: maturity must be an integer 1–5, got "${m}"` });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
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

      const v = validateProductsCatalogue(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const catalogue = raw['products_catalogue'] as ProductsCatalogueHeader;
        bodyContent = buildProductsTable(catalogue);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

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
      extraStyles: CATALOGUE_STYLES + PRODUCTS_STYLES,
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
  .col-name { min-width: 200px; }
  .col-type, .col-status, .col-maturity, .col-domain, .col-owner { white-space: nowrap; }
`;
