import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';
import {
  validateActivities,
  layoutActivities,
  computeCpm,
  computeGanttLayout,
  isGanttUnavailable,
  type ActivityDoc,
  type ActivitiesLayout,
  type GanttLayout,
  type GanttResult,
} from '../../packages/diagrams/src/activities/index.js';

// ── Shared helpers ───────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

// ── Network (PSND) SVG renderer ──────────────────────────────────────────────
//
// Consumes layoutActivities + computeCpm from @transitrix/diagrams. Studio
// supplies the SVG presentation layer only.

const N_NODE_W = 200;
const N_NODE_H = 80;
const N_PAD = 24;

function networkSvg(doc: ActivityDoc, heading?: string, filename?: string, date?: string): string {
  const layout: ActivitiesLayout = layoutActivities(doc);
  if (layout.nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text class="text-primary" x="10" y="40">No activities</text></svg>';
  }

  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const cpm = computeCpm(doc.activities ?? []);
  const W = layout.bounds.width + N_PAD * 2;
  const H = layout.bounds.height + N_PAD * 2 + titleH;
  const ox = -layout.bounds.x + N_PAD;
  const oy = -layout.bounds.y + N_PAD + titleH;

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  // SVG paints later siblings over earlier ones. Sort non-critical first so
  // the bright orange critical-path edges land on top — a gray edge crossing
  // an orange one shouldn't bury the critical signal.
  const orderedEdges = [...layout.edges].sort(
    (a, b) => Number(Boolean(a.isCritical)) - Number(Boolean(b.isCritical)),
  );
  const edgeSvg = orderedEdges.map(e => {
    const s = nodeMap.get(e.sourceId);
    const t = nodeMap.get(e.targetId);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    const mx = (sx + tx) / 2;
    const cls = e.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
    return `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}" class="${cls}" marker-end="url(#${e.isCritical ? 'arrow-crit' : 'arrow'})"/>`;
  }).join('\n');

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const isCritical = cpm.get(n.id)?.isCritical ?? false;
    const isMilestone = (n.data.duration ?? -1) === 0;
    const cls = `diagram-node act-node ${isCritical ? 'critical-node' : ''} ${isMilestone ? 'milestone-node' : ''}`.trim();
    const idLabel = escXml(n.id);
    const nameLabel = escXml(truncate(n.data.name, 24));
    const durLabel = n.data.duration !== undefined ? `${n.data.duration}d` : '—';
    return [
      `<rect class="${cls}" x="${x}" y="${y}" width="${N_NODE_W}" height="${N_NODE_H}" rx="6"/>`,
      `<text class="text-id" x="${x + 8}" y="${y + 18}">${idLabel}</text>`,
      `<text class="text-primary" x="${x + N_NODE_W / 2}" y="${y + N_NODE_H / 2}" text-anchor="middle" dominant-baseline="central">${nameLabel}</text>`,
      `<text class="text-secondary" x="${x + N_NODE_W - 8}" y="${y + N_NODE_H - 10}" text-anchor="end">${durLabel}</text>`,
    ].join('\n');
  }).join('\n');

  const titleSvg = showTitle ? titleBlockSvg(heading!, filename!, date!, N_PAD, N_PAD) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
  <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>
${titleSvg}
${edgeSvg}
${nodeSvg}
</svg>`;
}

// ── Gantt SVG renderer ───────────────────────────────────────────────────────

const G_DAY_W = 24;       // px per calendar day on the timeline axis
const G_ROW_H = 40;       // row height — taller than the bar so links have inter-row breathing room
const G_LABEL_COL_W = 220;
const G_HEADER_H = 36;
const G_PAD = 24;
const G_BAR_INSET_Y = 8;  // top/bottom inset of bars inside the row band (sets inter-row gap = 2*INSET = 16px)

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function daysBetween(startISO: string, endISO: string): number {
  const ms = parseISO(endISO).getTime() - parseISO(startISO).getTime();
  return Math.round(ms / 86_400_000);
}

function ganttSvg(layout: GanttLayout, heading?: string, filename?: string, date?: string): string {
  // Sort bars by start date then id for stable display order.
  const bars = [...layout.bars].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const totalDays = daysBetween(layout.timelineStart, layout.timelineEnd) + 1;
  const timelineWidth = totalDays * G_DAY_W;
  const W = G_LABEL_COL_W + timelineWidth + G_PAD * 2;
  const H = G_HEADER_H + bars.length * G_ROW_H + G_PAD * 2 + titleH;

  const ox = G_PAD;
  const oy = G_PAD + titleH;

  // Date header strip: month labels above, day ticks below.
  const headerParts: string[] = [];
  headerParts.push(
    `<rect class="diagram-node gantt-header" x="${ox}" y="${oy}" width="${G_LABEL_COL_W + timelineWidth}" height="${G_HEADER_H}"/>`,
  );
  headerParts.push(
    `<text class="text-secondary" x="${ox + 12}" y="${oy + G_HEADER_H / 2}" dominant-baseline="central">Activity</text>`,
  );
  // Month band: walk days, group by yyyy-mm.
  const months: Array<{ label: string; startCol: number; endCol: number }> = [];
  for (let i = 0; i < totalDays; i++) {
    const d = parseISO(layout.timelineStart);
    d.setUTCDate(d.getUTCDate() + i);
    const label = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const last = months[months.length - 1];
    if (last && last.label === label) last.endCol = i;
    else months.push({ label, startCol: i, endCol: i });
  }
  for (const m of months) {
    const x = ox + G_LABEL_COL_W + m.startCol * G_DAY_W;
    const w = (m.endCol - m.startCol + 1) * G_DAY_W;
    headerParts.push(
      `<text class="text-secondary" x="${x + w / 2}" y="${oy + 14}" text-anchor="middle" dominant-baseline="central">${escXml(m.label)}</text>`,
    );
  }
  // Day grid: thin vertical lines every 7 days.
  for (let i = 0; i <= totalDays; i += 7) {
    const x = ox + G_LABEL_COL_W + i * G_DAY_W;
    headerParts.push(
      `<line class="gantt-grid" x1="${x}" y1="${oy + G_HEADER_H}" x2="${x}" y2="${oy + G_HEADER_H + bars.length * G_ROW_H}"/>`,
    );
  }

  // Rows
  const rowParts: string[] = [];
  const yByBarId = new Map<string, number>();
  for (let r = 0; r < bars.length; r++) {
    const bar = bars[r];
    const rowY = oy + G_HEADER_H + r * G_ROW_H;
    yByBarId.set(bar.id, rowY + G_ROW_H / 2);

    // Alternating row band for readability.
    if (r % 2 === 1) {
      rowParts.push(
        `<rect class="gantt-row-alt" x="${ox}" y="${rowY}" width="${G_LABEL_COL_W + timelineWidth}" height="${G_ROW_H}"/>`,
      );
    }
    // Label column
    rowParts.push(
      `<text class="text-id" x="${ox + 8}" y="${rowY + G_ROW_H / 2}" dominant-baseline="central">${escXml(bar.id)}</text>`,
    );
    rowParts.push(
      `<text class="text-secondary" x="${ox + 56}" y="${rowY + G_ROW_H / 2}" dominant-baseline="central">${escXml(truncate(bar.name, 22))}</text>`,
    );

    // Bar geometry
    const startOffset = daysBetween(layout.timelineStart, bar.startDate);
    const endOffset = daysBetween(layout.timelineStart, bar.endDate);
    const barX = ox + G_LABEL_COL_W + startOffset * G_DAY_W;
    const barY = rowY + G_BAR_INSET_Y;
    const barH = G_ROW_H - G_BAR_INSET_Y * 2;

    if (bar.kind === 'milestone') {
      // Diamond marker
      const cx = barX + G_DAY_W / 2;
      const cy = rowY + G_ROW_H / 2;
      const s = barH / 2;
      const cls = `gantt-milestone ${bar.isCritical ? 'critical-bar' : ''}`.trim();
      rowParts.push(
        `<polygon class="${cls}" points="${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}"/>`,
      );
    } else {
      const widthDays = endOffset - startOffset + 1;
      const barWidth = widthDays * G_DAY_W;
      const cls = bar.kind === 'phase'
        ? 'gantt-phase'
        : `gantt-bar ${bar.isCritical ? 'critical-bar' : ''}`.trim();
      rowParts.push(
        `<rect class="${cls}" x="${barX}" y="${barY}" width="${barWidth}" height="${barH}" rx="3"/>`,
      );
    }
  }

  // Link lines — Finish-to-Start.
  //
  // Routing strategy is **trunk + branches per source**:
  //
  // - Outgoing links from the same source share ONE trunk (the Z-shape that
  //   exits source's right edge, drops to the inter-row band immediately
  //   below source, steps back to the LEFT of the source-end column, and
  //   descends to the deepest target). Each link contributes a horizontal
  //   BRANCH off the trunk at its target's row, ending with an arrowhead
  //   inside the target bar's left edge.
  //
  // This solves three problems with per-link routing:
  //
  // 1. **Layering**: per-link rendering drew identical right-stubs and
  //    short verticals four times (once per outgoing link from A-002 in
  //    platform-launch), with the last-drawn gray covering the orange
  //    critical link's overlapping segments. The trunk is drawn once.
  //
  // 2. **midY landing on a bar row**: per-link midY = (sy + ty)/2 lands on
  //    an intermediate row's CENTER when target is an even number of rows
  //    below source (e.g., A-002 → A-005 lands midY on A-003's bar row,
  //    pulling the back-step horizontal through A-003's bar). The trunk's
  //    midY is fixed to the inter-row band immediately below source, so the
  //    back-step is always in safe empty space.
  //
  // 3. **Visual consistency**: the trunk colour is critical (orange) if
  //    ANY outgoing link from this source is on the critical path, so the
  //    critical-path lineage is visible from source down to the critical
  //    target. Branches are coloured per link, so non-critical successors
  //    show in gray with their own arrows.
  //
  // Backward links (tx < sx — pinned-mode overlap where target.start_date
  // precedes source.end_date, or targets sorted above source in the row
  // order) use the existing detour-below routing.
  // Two buckets so critical paths render on top of gray ones — SVG paints
  // later siblings over earlier ones, and a gray edge crossing an orange one
  // shouldn't bury the critical signal.
  const linkPartsGray: string[] = [];
  const linkPartsCrit: string[] = [];
  function pushLinkPath(html: string, isCritical: boolean): void {
    (isCritical ? linkPartsCrit : linkPartsGray).push(html);
  }
  const LINK_GAP = 4;
  const LINK_MIN_STUB = 6;
  const STUB_OUT = 8;       // right-stub past source before turning down
  const BACK_OFFSET = 8;    // back-step distance to the LEFT of sx for the long vertical
  const ENTER_DEPTH = 4;    // how far inside target the arrow path lands (marker tip ~1px further)

  // Group links by source so all outgoing links share one trunk.
  const linksBySource = new Map<string, typeof layout.links>();
  for (const link of layout.links) {
    let list = linksBySource.get(link.sourceId);
    if (!list) {
      list = [];
      linksBySource.set(link.sourceId, list);
    }
    list.push(link);
  }

  for (const [sourceId, outgoing] of linksBySource) {
    const sourceBar = bars.find(b => b.id === sourceId);
    if (!sourceBar) continue;
    const sourceEndOffset = daysBetween(layout.timelineStart, sourceBar.endDate);
    const sx = ox + G_LABEL_COL_W + (sourceEndOffset + 1) * G_DAY_W;
    const sy = yByBarId.get(sourceId) ?? 0;

    type Target = { link: typeof outgoing[number]; tx: number; ty: number };
    const forward: Target[] = [];
    const backward: Target[] = [];
    for (const link of outgoing) {
      const targetBar = bars.find(b => b.id === link.targetId);
      if (!targetBar) continue;
      const targetStartOffset = daysBetween(layout.timelineStart, targetBar.startDate);
      const tx = ox + G_LABEL_COL_W + targetStartOffset * G_DAY_W;
      const ty = yByBarId.get(link.targetId) ?? 0;
      // "Forward" here means below source on the timeline (ty > sy). Pinned
      // mode can place a successor above its predecessor or to the left of
      // its end date — both go through the backward branch.
      if (ty > sy && tx >= sx) forward.push({ link, tx, ty });
      else backward.push({ link, tx, ty });
    }

    if (forward.length > 0) {
      const midY = sy + G_ROW_H / 2;
      const stubX = sx + STUB_OUT;
      const backX = sx - BACK_OFFSET;

      // Top of the trunk (right stub + short vertical at stubX + back-step at
      // midY). All outgoing routes traverse this segment, so it's coloured by
      // "any outgoing critical" — orange if at least one successor is on the
      // critical path, gray otherwise.
      const anyCritical = forward.some(t => t.link.isCritical);
      const topCls = anyCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
      const topD = `M${sx},${sy} L${stubX},${sy} L${stubX},${midY} L${backX},${midY}`;
      pushLinkPath(`<path d="${topD}" class="${topCls}" fill="none"/>`, anyCritical);

      // Long vertical at x = backX, split at each target's row. Each segment
      // is coloured by whether any route still served by it (= targets at or
      // below the segment's bottom) is on the critical path. This way the
      // orange line stops at the deepest critical target's row — the part of
      // the trunk that purely carries non-critical routes shows in gray.
      const sortedForward = [...forward].sort((a, b) => a.ty - b.ty);
      let segTop = midY;
      for (let i = 0; i < sortedForward.length; i++) {
        const segBottom = sortedForward[i].ty;
        const segCritical = sortedForward.slice(i).some(t => t.link.isCritical);
        const segCls = segCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
        const segD = `M${backX},${segTop} L${backX},${segBottom}`;
        pushLinkPath(`<path d="${segD}" class="${segCls}" fill="none"/>`, segCritical);
        segTop = segBottom;
      }

      // Branches: short horizontals at each target's row, from the trunk's
      // x = backX into the target's left edge. The arrowhead lives a few px
      // inside the target bar.
      for (const t of forward) {
        const cls = t.link.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
        const marker = t.link.isCritical ? 'gantt-arrow-crit' : 'gantt-arrow';
        const enterX = t.tx + ENTER_DEPTH;
        const branchD = `M${backX},${t.ty} L${enterX},${t.ty}`;
        pushLinkPath(`<path d="${branchD}" class="${cls}" fill="none" marker-end="url(#${marker})"/>`, t.link.isCritical);
      }
    }

    for (const t of backward) {
      const cls = t.link.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
      const marker = t.link.isCritical ? 'gantt-arrow-crit' : 'gantt-arrow';
      const hookY = Math.max(sy, t.ty) + G_ROW_H / 2 + 6;
      const sxOut = sx + LINK_GAP;
      const txIn = t.tx + LINK_MIN_STUB;
      const d = `M${sxOut},${sy} L${sxOut},${hookY} L${txIn},${hookY} L${txIn},${t.ty}`;
      pushLinkPath(`<path d="${d}" class="${cls}" fill="none" marker-end="url(#${marker})"/>`, t.link.isCritical);
    }
  }

  const titleSvg = showTitle ? titleBlockSvg(heading!, filename!, date!, G_PAD, G_PAD) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,6 L6,3 z" class="arrow-fill"/>
  </marker>
  <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,6 L6,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>
${titleSvg}
${headerParts.join('\n')}
${rowParts.join('\n')}
${[...linkPartsGray, ...linkPartsCrit].join('\n')}
</svg>`;
}

// ── Stacked canvas content (network + gantt) ─────────────────────────────────

function buildCanvasContent(doc: ActivityDoc, filename: string, date: string): string {
  const networkHeading = 'Network view — Project Schedule Network Diagram (PSND)';
  const network = networkSvg(doc, networkHeading, filename, date);
  const gantt: GanttResult = computeGanttLayout(doc);

  let ganttBody: string;
  if (isGanttUnavailable(gantt)) {
    // No SVG to embed the title into — fall back to an HTML title block plus
    // the notice so the unavailable path still shows the same paragraph.
    ganttBody = `<div class="diagram-title-block diagram-title-block-html">
  <div class="text-header">Gantt view — unavailable</div>
  <div class="text-secondary">${escXml(filename)}</div>
  <div class="text-secondary">${escXml(date)}</div>
</div>
<div class="section-notice">${escXml(gantt.reason)}</div>`;
  } else {
    const modeLabel = gantt.mode === 'computed'
      ? `computed mode (project ${gantt.timelineStart} → ${gantt.timelineEnd})`
      : `pinned mode (${gantt.timelineStart} → ${gantt.timelineEnd})`;
    const ganttHeading = `Gantt view — ${modeLabel}`;
    ganttBody = ganttSvg(gantt, ganttHeading, filename, date);
  }

  // Pure-CSS tab switcher: hidden radio inputs at the top, labels styled as
  // tabs, panels shown via `:checked ~ section[data-view=…]`. Works under the
  // webview's `enableScripts: false` + script-less CSP because no JS is
  // involved — the browser handles `:checked` natively.
  return `<input type="radio" id="view-network" name="view-tabs" class="view-radio" checked>
<input type="radio" id="view-gantt" name="view-tabs" class="view-radio">
<nav class="view-tabs" role="tablist">
  <label for="view-network" class="view-tab" data-tab="network">Network</label>
  <label for="view-gantt" class="view-tab" data-tab="gantt">Gantt</label>
</nav>
<section class="diagram-section" data-view="network">
  ${network}
</section>
<section class="diagram-section" data-view="gantt">
  ${ganttBody}
</section>`;
}

// ── Extra CSS injected into the diagram frame ───────────────────────────────
//
// Split into two pieces so the exported .svg file carries only the rules that
// shape the diagram itself. Webview-shell rules (view switcher, section
// notice) are useless — and confusing — when the SVG is opened in Chrome.

/** Diagram-class CSS used both in the webview and in saved .svg exports. */
const ACTIVITIES_DIAGRAM_CSS = `
  .act-node { fill: var(--ts-bg-surface, #f8fafc); stroke: var(--ts-border, #94a3b8); stroke-width: 1.5; }
  .critical-node { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2.5; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }

  .gantt-header { fill: var(--ts-bg-subtle, #f1f5f9); stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }
  .gantt-grid { stroke: var(--ts-border, #cbd5e1); stroke-width: 1; opacity: 0.5; }
  .gantt-row-alt { fill: var(--ts-bg-subtle, #f8fafc); opacity: 0.5; }
  .gantt-bar { fill: var(--ts-bg-surface, #dbeafe); stroke: var(--ts-border, #60a5fa); stroke-width: 1; }
  .gantt-bar.critical-bar { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1.5; }
  .gantt-phase { fill: var(--ts-text-muted, #475569); opacity: 0.85; }
  .gantt-milestone { fill: var(--ts-text, #0f172a); }
  .gantt-milestone.critical-bar { fill: var(--ts-brand-orange, #ff4d00); }
`;

/** Webview-only chrome (tab switcher, section notice). Not exported. */
const ACTIVITIES_WEBVIEW_CSS = `
  /* ── View switcher (CSS-only, no JS) ────────────────────────────────── */
  /* Move the radios fully off-screen rather than just hiding via opacity —
     keeps them keyboard-focusable while not taking layout space, and stops
     the webview default styles from showing a 13px input box. */
  .view-radio { position: absolute; left: -9999px; width: 1px; height: 1px; }
  .view-tabs { display: flex; gap: 4px; padding: 12px 16px 0; border-bottom: 1px solid var(--ts-border, #cbd5e1); margin-bottom: 8px; }
  .view-tab {
    padding: 6px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ts-text-muted, #64748b);
    background: transparent;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    cursor: pointer;
    user-select: none;
    margin-bottom: -1px;
  }
  .view-tab:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-subtle, #f1f5f9); }
  /* Default state: both panels hidden until a radio activates one. */
  .diagram-section[data-view] { display: none; }
  /* Network tab/panel active. */
  .view-radio#view-network:checked ~ .view-tabs .view-tab[data-tab="network"] {
    color: var(--ts-text, #0f172a);
    background: var(--ts-bg-surface, #ffffff);
    border-color: var(--ts-border, #cbd5e1);
  }
  .view-radio#view-network:checked ~ section[data-view="network"] { display: block; }
  /* Gantt tab/panel active. */
  .view-radio#view-gantt:checked ~ .view-tabs .view-tab[data-tab="gantt"] {
    color: var(--ts-text, #0f172a);
    background: var(--ts-bg-surface, #ffffff);
    border-color: var(--ts-border, #cbd5e1);
  }
  .view-radio#view-gantt:checked ~ section[data-view="gantt"] { display: block; }

  .diagram-section { margin: 8px 0 16px; }
  .section-notice { margin: 0 16px; padding: 10px 14px; border-left: 3px solid var(--ts-text-muted, #94a3b8); background: var(--ts-bg-subtle, #f8fafc); color: var(--ts-text-muted, #64748b); font-size: 12px; }
`;

const ACTIVITIES_STYLES = ACTIVITIES_WEBVIEW_CSS + ACTIVITIES_DIAGRAM_CSS;

// ── ActivitiesPreview webview class ───────────────────────────────────────────

export class ActivitiesPreview {
  readonly panelTitle = 'Activities Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';

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
        'activitiesPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveActivitiesAsSvg'] },
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
    let warnings: string[] = [];
    const today = todayIso();

    try {
      const parsed = yaml.load(yamlText) as unknown;
      const v = validateActivities(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        bodyContent = buildCanvasContent(parsed as ActivityDoc, filename, today);
        // Save-as-SVG exports only the network view today; the Gantt is a
        // companion section in the webview. (Reconsider when the Gantt becomes
        // a primary view.) The exported SVG keeps the title block — it lives
        // in the SVG, so opening the file outside VS Code shows the same
        // heading + filename + date the user saw in the preview.
        this.lastSvg = networkSvg(
          parsed as ActivityDoc,
          'Network view — Project Schedule Network Diagram (PSND)',
          filename,
          today,
        );
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    if (!bodyContent) this.lastSvg = '';

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Activities (PSND + Gantt)',
      bodyContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: ACTIVITIES_STYLES,
      saveSvgCommand: 'transitrixStudio.saveActivitiesAsSvg',
    });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.activities.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.activities\.transitrix\.yaml$/, '')
      : 'diagram';
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), `${stem}.svg`))
      : vscode.Uri.file(`${stem}.svg`);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'SVG Image': ['svg'] } });
    if (!target) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const svg = prepareSvgForExport(this.lastSvg, themeId, ACTIVITIES_DIAGRAM_CSS);
    await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }
}
