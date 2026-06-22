/**
 * Host-neutral renderer for the Scenarios notation.
 * Mirrors `extension/src/scenarios-preview.ts`; emits a self-contained HTML
 * fragment for the JCEF host (Step 4 of ADR 0001).
 */
import type { DriverView, ScenarioHeader } from '../scenarios/types.js';
import { escHtml } from './render-util.js';

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-active',
  Draft: 'badge-draft',
  Archived: 'badge-archived',
};

const RELEVANCE_BADGE: Record<string, string> = {
  High: 'badge-high',
  Medium: 'badge-medium',
  Low: 'badge-low',
};

function buildDriversTable(factors: DriverView[] | undefined): string {
  if (!factors || factors.length === 0) return '';
  const rows = factors
    .map(
      (f) => `<tr>
  <td class="col-factor-id">${escHtml(f.factor_id)}</td>
  <td class="col-relevance">${
    f.relevance
      ? `<span class="tx-badge ${escHtml(RELEVANCE_BADGE[f.relevance] ?? '')}">${escHtml(f.relevance)}</span>`
      : '<span class="cell-empty">—</span>'
  }</td>
  <td class="col-impact">${f.impact ? escHtml(f.impact) : '<span class="cell-empty">—</span>'}</td>
</tr>`,
    )
    .join('\n');
  return `<section class="scn-section">
  <h2 class="scn-section-title">Factors view <span class="scn-count">${factors.length}</span></h2>
  <table class="catalogue-table">
    <thead><tr><th>Factor ID</th><th>Relevance</th><th>Impact</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>`;
}

function buildRefSection(label: string, items: string[]): string {
  if (items.length === 0) return '';
  const lis = items.map((id) => `<li><code>${escHtml(id)}</code></li>`).join('');
  return `<section class="scn-section">
  <h2 class="scn-section-title">${escHtml(label)} <span class="scn-count">${items.length}</span></h2>
  <ul class="scn-ref-list">${lis}</ul>
</section>`;
}

function extractIds(list: readonly unknown[] | undefined, key: string): string[] {
  return (list ?? []).map((x) => String((x as Record<string, unknown>)[key] ?? ''));
}

export function renderScenarioHtml(scn: ScenarioHeader): string {
  const blocks: string[] = [];
  if (scn.vision) {
    blocks.push(`<section class="scn-section scn-vision">
  <h2 class="scn-section-title">Vision</h2>
  <p class="scn-vision-text">${escHtml(scn.vision)}</p>
</section>`);
  }
  blocks.push(buildDriversTable(scn.factors_view));
  blocks.push(buildRefSection('Goals', extractIds(scn.goals, 'goal_id')));
  blocks.push(buildRefSection('Capabilities', extractIds(scn.capabilities, 'capability_id')));
  blocks.push(buildRefSection('Activities', extractIds(scn.activities, 'activity_id')));
  blocks.push(buildRefSection('Products', extractIds(scn.products, 'product_id')));
  blocks.push(buildRefSection('Processes', extractIds(scn.processes, 'process_id')));
  blocks.push(buildRefSection('Applications', extractIds(scn.applications, 'app_id')));
  const content = blocks.filter(Boolean).join('\n');

  const statusBadge = `<span class="tx-badge ${escHtml(STATUS_BADGE[scn.status] ?? '')}">${escHtml(scn.status)}</span>`;
  const header = `<header class="catalogue-header">
    <div class="catalogue-title">${escHtml(scn.name)}</div>
    <div class="catalogue-meta">
      ${statusBadge}
      <span class="catalogue-id-tag">${escHtml(scn.id)}</span>
      ${scn.created_at ? `<span class="catalogue-updated">Created ${escHtml(scn.created_at)}</span>` : ''}
    </div>
    ${scn.description ? `<div class="catalogue-subtitle">${escHtml(scn.description)}</div>` : ''}
  </header>`;
  const body = content || '<div class="empty-scenario">Scenario has no content yet (no vision, factors, or references).</div>';
  return `<section class="tx-catalogue tx-scenarios">
${header}
${body}
</section>`;
}
