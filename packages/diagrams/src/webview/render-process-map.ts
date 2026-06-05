/**
 * Host-neutral renderer for the Process Map notation.
 * Mirrors `extension/src/process-map-preview.ts`; emits a self-contained HTML
 * fragment for the JCEF host (Step 4 of ADR 0001).
 */
import type { MapProcess, ProcessGroup, ProcessMapHeader } from '../process-map/types.js';
import { escHtml } from './render-util.js';

const STATUS_BADGE: Record<string, string> = {
  Active: 'badge-active',
  Draft: 'badge-draft',
  Deprecated: 'badge-deprecated',
};

const GROUP_LABEL: Record<string, string> = {
  operating: 'Operating',
  supporting: 'Supporting',
  management: 'Management',
};

function maturityDots(m: number | undefined): string {
  if (m === undefined) return '<span class="cell-empty">—</span>';
  const filled = '●'.repeat(Math.max(0, Math.min(5, m)));
  const empty = '○'.repeat(5 - Math.max(0, Math.min(5, m)));
  return `<span class="maturity-dots">${filled}${empty}</span>`;
}

function renderProcessRow(p: MapProcess): string {
  return `<tr>
  <td class="col-name">
    <div class="catalogue-name">${escHtml(p.name)}</div>
    <div class="catalogue-id">${escHtml(p.process_id)}</div>
    ${p.description ? `<div class="catalogue-desc">${escHtml(p.description)}</div>` : ''}
  </td>
  <td class="col-status"><span class="tx-badge ${escHtml(STATUS_BADGE[p.status] ?? '')}">${escHtml(p.status)}</span></td>
  <td class="col-maturity">${maturityDots(p.maturity)}</td>
  <td class="col-owner">${p.owner_role ? escHtml(p.owner_role) : '<span class="cell-empty">—</span>'}</td>
  <td class="col-capability">${p.capability ? `<span class="cap-tag">${escHtml(p.capability)}</span>` : '<span class="cell-empty">—</span>'}</td>
  <td class="col-bpmn">${p.bpmn_file ? `<span class="bpmn-link" title="${escHtml(p.bpmn_file)}">📄 BPMN</span>` : '<span class="cell-empty">—</span>'}</td>
</tr>`;
}

function renderGroup(g: ProcessGroup): string {
  const processes = g.processes ?? [];
  const rows = processes.length === 0
    ? `<tr><td colspan="6" class="empty-group">No processes in this group.</td></tr>`
    : processes.map(renderProcessRow).join('\n');
  const typeKey = String(g.type ?? '');
  return `<section class="group-section group-${escHtml(typeKey)}">
  <header class="group-header">
    <div class="group-meta">
      <span class="group-tag group-tag-${escHtml(typeKey)}">${escHtml(GROUP_LABEL[typeKey] ?? typeKey)}</span>
      <span class="group-id">${escHtml(g.id)}</span>
    </div>
    <h2 class="group-title">${escHtml(g.name)}</h2>
    ${g.description ? `<p class="group-desc">${escHtml(g.description)}</p>` : ''}
  </header>
  <table class="catalogue-table">
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

export function renderProcessMapHtml(map: ProcessMapHeader): string {
  const header = `<header class="catalogue-header">
    <div class="catalogue-title">${escHtml(map.name)}</div>
    <div class="catalogue-meta">
      <span class="catalogue-id-tag">${escHtml(map.id)}</span>
      <span class="catalogue-updated">Updated ${escHtml(map.updated_at)}</span>
      ${map.version ? `<span class="catalogue-version">v${escHtml(map.version)}</span>` : ''}
    </div>
    ${map.description ? `<div class="catalogue-subtitle">${escHtml(map.description)}</div>` : ''}
  </header>`;
  const body = map.groups.length === 0
    ? '<div class="empty-map">No groups defined.</div>'
    : map.groups.map(renderGroup).join('\n');
  return `<section class="tx-catalogue tx-process-map">
${header}
${body}
</section>`;
}
