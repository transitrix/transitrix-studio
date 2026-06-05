/**
 * Host-neutral renderer for the Products catalogue notation.
 * Mirrors `extension/src/products-preview.ts`; emits a self-contained HTML
 * fragment for the JCEF host (Step 4 of ADR 0001).
 */
import type { Product, ProductsCatalogueHeader } from '../products/types.js';
import { escHtml } from './render-util.js';

const TYPE_LABEL: Record<string, string> = {
  digital_product: 'Digital Product',
  service: 'Service',
  platform: 'Platform',
  bundle: 'Bundle',
};

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-active',
  Draft: 'badge-draft',
  Deprecated: 'badge-deprecated',
};

function maturityDots(m: number | undefined): string {
  if (m === undefined) return '<span class="cell-empty">—</span>';
  const filled = '●'.repeat(Math.max(0, Math.min(5, m)));
  const empty = '○'.repeat(5 - Math.max(0, Math.min(5, m)));
  return `<span class="maturity-dots">${filled}${empty}</span>`;
}

function disclosureList(label: string, items: string[] | undefined): string {
  if (!items || items.length === 0) return '';
  const lis = items.map((i) => `<li>${escHtml(i)}</li>`).join('');
  return `<details><summary>${escHtml(label)} (${items.length})</summary><ul>${lis}</ul></details>`;
}

function renderRow(p: Product): string {
  const extras = [
    disclosureList('Capabilities', p.capabilities),
    disclosureList('Processes', p.processes),
    disclosureList('Apps', p.supporting_apps),
  ]
    .filter(Boolean)
    .join('');
  return `<tr>
  <td class="col-name">
    <div class="catalogue-name">${escHtml(p.name)}</div>
    <div class="catalogue-id">${escHtml(p.product_id)}</div>
    ${p.description ? `<div class="catalogue-desc">${escHtml(p.description)}</div>` : ''}
    ${extras}
  </td>
  <td class="col-type"><span class="type-tag">${escHtml(TYPE_LABEL[p.type] ?? p.type)}</span></td>
  <td class="col-status"><span class="tx-badge ${escHtml(STATUS_BADGE[p.status] ?? '')}">${escHtml(p.status)}</span></td>
  <td class="col-maturity">${maturityDots(p.maturity)}</td>
  <td class="col-domain">${p.domain ? escHtml(p.domain) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-owner">${p.owner_role ? escHtml(p.owner_role) : '<span class="cell-empty">—</span>'}</td>
</tr>`;
}

export function renderProductsHtml(catalogue: ProductsCatalogueHeader): string {
  const rows = catalogue.products.map(renderRow).join('\n');
  const emptyRow = catalogue.products.length === 0
    ? `<tr><td colspan="6" class="empty-catalogue">No products defined.</td></tr>`
    : '';
  const header = `<header class="catalogue-header">
    <div class="catalogue-title">${escHtml(catalogue.name)}</div>
    <div class="catalogue-meta">
      <span class="catalogue-id-tag">${escHtml(catalogue.id)}</span>
      <span class="catalogue-updated">Updated ${escHtml(catalogue.updated_at)}</span>
      ${catalogue.version ? `<span class="catalogue-version">v${escHtml(catalogue.version)}</span>` : ''}
    </div>
    ${catalogue.description ? `<div class="catalogue-subtitle">${escHtml(catalogue.description)}</div>` : ''}
  </header>`;
  return `<section class="tx-catalogue tx-products">
${header}
<table class="catalogue-table">
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
</table>
</section>`;
}
