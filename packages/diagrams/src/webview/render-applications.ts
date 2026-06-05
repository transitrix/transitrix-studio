/**
 * Host-neutral renderer for the Applications catalogue notation.
 *
 * Mirrors the VS Code preview (`extension/src/applications-preview.ts`) but
 * strips the VS Code-specific concerns (theme lookup, command URIs, fix-prompt
 * scaffolding). The output is a self-contained HTML fragment — a `<section>`
 * carrying its own `<style>` block — that the JCEF host can drop into
 * `#transitrix-root` exactly the way it drops the goals SVG (Step 3 contract).
 */
import type {
  Application,
  ApplicationIntegration,
  ApplicationsCatalogueHeader,
} from '../applications/types.js';
import { escHtml } from './render-util.js';

const TYPE_LABEL: Record<string, string> = {
  application: 'Application',
  integration: 'Integration',
  platform: 'Platform',
  data_store: 'Data Store',
};

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-active',
  Draft: 'badge-draft',
  Deprecated: 'badge-deprecated',
  Decommissioning: 'badge-decommissioning',
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

function renderIntegrations(integrations: ApplicationIntegration[] | undefined): string {
  if (!integrations || integrations.length === 0) return '';
  const items = integrations
    .map((intg) => {
      const parts = [
        intg.target ? escHtml(intg.target) : '?',
        intg.direction ? `<span class="intg-dir">${escHtml(intg.direction)}</span>` : '',
        intg.protocol ? `<span class="intg-proto">${escHtml(intg.protocol)}</span>` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const desc = intg.description ? `<span class="intg-desc">${escHtml(intg.description)}</span>` : '';
      return `<li>${parts}${desc ? ' — ' + desc : ''}</li>`;
    })
    .join('');
  return `<details><summary>Integrations (${integrations.length})</summary><ul>${items}</ul></details>`;
}

function renderRow(a: Application): string {
  const extras = [
    renderIntegrations(a.integrations),
    disclosureList('Capabilities', a.capabilities),
    disclosureList('Products', a.products),
  ]
    .filter(Boolean)
    .join('');
  const vendorCell = a.vendor
    ? `<span class="${a.vendor === 'Internal' ? 'vendor-internal' : 'vendor-external'}">${escHtml(a.vendor)}</span>`
    : '<span class="cell-empty">—</span>';
  return `<tr>
  <td class="col-name">
    <div class="catalogue-name">${escHtml(a.name)}</div>
    <div class="catalogue-id">${escHtml(a.app_id)}</div>
    ${a.description ? `<div class="catalogue-desc">${escHtml(a.description)}</div>` : ''}
    ${extras}
  </td>
  <td class="col-type"><span class="type-tag">${escHtml(TYPE_LABEL[a.type] ?? a.type)}</span></td>
  <td class="col-status"><span class="tx-badge ${escHtml(STATUS_BADGE[a.status] ?? '')}">${escHtml(a.status)}</span></td>
  <td class="col-maturity">${maturityDots(a.maturity)}</td>
  <td class="col-domain">${a.domain ? escHtml(a.domain) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-vendor">${vendorCell}</td>
  <td class="col-owner">${a.owner_role ? escHtml(a.owner_role) : '<span class="cell-empty">—</span>'}</td>
</tr>`;
}

export function renderApplicationsHtml(catalogue: ApplicationsCatalogueHeader): string {
  const rows = catalogue.applications.map(renderRow).join('\n');
  const emptyRow = catalogue.applications.length === 0
    ? `<tr><td colspan="7" class="empty-catalogue">No applications defined.</td></tr>`
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
  return `<section class="tx-catalogue tx-applications">
${header}
<table class="catalogue-table">
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
</table>
</section>`;
}
