/**
 * Host-neutral renderer for the Capability Map notation.
 * Mirrors `extension/src/capability-map-preview.ts`; emits a self-contained
 * HTML fragment for the JCEF host (Step 4 of ADR 0001).
 */
import type { CapabilityMapHeader, CapabilityNode } from '../capability-map/types.js';
import { escHtml } from './render-util.js';

const MATURITY_LABEL: Record<number, string> = {
  1: 'Initial',
  2: 'Managed',
  3: 'Defined',
  4: 'Quantitatively Managed',
  5: 'Optimising',
};

function maturityBadge(level: number, kind: 'current' | 'target'): string {
  const safe = Math.max(1, Math.min(5, level | 0));
  const label = kind === 'current' ? 'Current' : 'Target';
  return `<span class="maturity-pill maturity-${safe}" title="${label}: Level ${safe} — ${escHtml(MATURITY_LABEL[safe] ?? '')}">L${safe}</span>`;
}

function isHorizontal(id: string): boolean {
  return id.startsWith('H');
}

function renderCapabilityCard(node: CapabilityNode, depth: number): string {
  const cls = ['capability-card', `depth-${Math.min(depth, 3)}`];
  if (node.type) cls.push(`cap-type-${node.type}`);
  if (isHorizontal(node.id)) cls.push('cap-horizontal');

  const current = maturityBadge(node.current_maturity, 'current');
  const target = node.target_maturity !== undefined ? maturityBadge(node.target_maturity, 'target') : '';
  const arrow = target ? '<span class="maturity-arrow">→</span>' : '';

  const meta: string[] = [];
  if (node.type) meta.push(`<span class="cap-tag cap-tag-${escHtml(node.type)}">${escHtml(node.type)}</span>`);
  if (node.owner_role) meta.push(`<span class="cap-meta">Owner: ${escHtml(node.owner_role)}</span>`);
  if (node.business_process) meta.push(`<span class="cap-meta">Process: ${escHtml(node.business_process)}</span>`);
  if (node.target_date) meta.push(`<span class="cap-meta">By ${escHtml(node.target_date)}</span>`);

  const apps = node.applications && node.applications.length > 0
    ? `<div class="cap-apps"><span class="cap-apps-label">Apps:</span> ${node.applications.map((a) => `<code>${escHtml(a)}</code>`).join(' ')}</div>`
    : '';

  const childBlock = node.children && node.children.length > 0
    ? `<div class="cap-children">${node.children.map((c) => renderCapabilityCard(c, depth + 1)).join('')}</div>`
    : '';

  return `<div class="${cls.join(' ')}">
  <div class="capability-head">
    <div class="capability-maturity">${current}${arrow}${target}</div>
    <div class="capability-titles">
      <div class="capability-name">${escHtml(node.name)}</div>
      <div class="capability-id">${escHtml(node.id)}</div>
    </div>
  </div>
  ${meta.length > 0 ? `<div class="cap-meta-row">${meta.join('')}</div>` : ''}
  ${node.description ? `<div class="cap-desc">${escHtml(node.description)}</div>` : ''}
  ${apps}
  ${childBlock}
</div>`;
}

export function renderCapabilityMapHtml(map: CapabilityMapHeader): string {
  const header = `<header class="catalogue-header">
    <div class="catalogue-title">${escHtml(map.name)}</div>
    <div class="catalogue-meta">
      <span class="catalogue-id-tag">${escHtml(map.id)}</span>
      <span class="catalogue-updated">Assessed ${escHtml(map.assessment_date)}</span>
    </div>
    ${map.description ? `<div class="catalogue-subtitle">${escHtml(map.description)}</div>` : ''}
  </header>`;
  if (map.capabilities.length === 0) {
    return `<section class="tx-catalogue tx-capability-map">
${header}
<div class="empty-map">No capabilities defined.</div>
</section>`;
  }
  const verticals = map.capabilities.filter((c) => !isHorizontal(c.id));
  const horizontals = map.capabilities.filter((c) => isHorizontal(c.id));
  const vBlock = verticals.length > 0
    ? `<section class="cap-axis cap-axis-v">
  <h2 class="cap-axis-title">Vertical capabilities (domains)</h2>
  <div class="cap-axis-list">${verticals.map((c) => renderCapabilityCard(c, 0)).join('')}</div>
</section>`
    : '';
  const hBlock = horizontals.length > 0
    ? `<section class="cap-axis cap-axis-h">
  <h2 class="cap-axis-title">Horizontal capabilities (cross-cutting)</h2>
  <div class="cap-axis-list">${horizontals.map((c) => renderCapabilityCard(c, 0)).join('')}</div>
</section>`
    : '';
  return `<section class="tx-catalogue tx-capability-map">
${header}
${vBlock}${hBlock}
</section>`;
}
