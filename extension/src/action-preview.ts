import * as path from 'node:path';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { TITLE_BLOCK_H, todayIso } from './svg-title-block.js';
import {
  validateActivities,
  layoutActivities,
  computeCpm,
  computeGanttLayout,
  isGanttUnavailable,
  type Activity,
  type ActivityDoc,
  type ActivitiesLayout,
  type ActivitiesLayoutOptions,
  type GanttLayout,
  type GanttResult,
} from '@transitrix/diagrams/activities';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { DEFAULT_EDGE_CURVATURE } from '@transitrix/diagrams/edge-path.js';
import { renderActivitiesNetworkBody, ACTIVITIES_NETWORK_DEFS } from '@transitrix/diagrams/webview/render-activities.js';
import { savePngFromSvg, copyPngFromSvg } from './png-export.js';
import { readSpacing, readCurvature, readEntryCurvature, applyControlMessage, OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND } from './spacing-config.js';
import { readActionNodeSize, readNodeSizePreset } from './node-size-config.js';
import { genNonce, buildControlsPanel, buildControlsScript } from './preview-controls.js';

// Default network (PSND) gaps — must match the layoutActivities defaults
// (H_GAP / V_GAP) so an unconfigured preview is visually unchanged.
const ACTIVITIES_DEFAULT_H_GAP = 80;
const ACTIVITIES_DEFAULT_V_GAP = 24;

const EXPORT_TREE_MARKDOWN_COMMAND = 'transitrixStudio.exportActionTreeAsMarkdown';

// ── Shared helpers ───────────────────────────────────────────────────────────

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

// ── Network (PSND) SVG renderer ──────────────────────────────────────────────
//
// Consumes layoutActivities + computeCpm from @transitrix/diagrams. Studio
// supplies the SVG presentation layer only.

const N_PAD = 24;
// Extra SVG title-block line height for the optional action-name line.
const ACTIVITY_ACTION_NAME_H = 16;

/**
 * SVG title block for activity views — extends the shared 3-line block with an
 * optional 4th line for the document's Action name (doc.title). When present,
 * the action name appears immediately after the heading as its own text element,
 * pushing filename and date down by ACTIVITY_ACTION_NAME_H px.
 */
function activityTitleBlockSvg(heading: string, filename: string, date: string, x: number, top: number, actionName?: string): string {
  const dateLine = `Generated: ${date}`;
  let y = top + 14;
  const lines: string[] = [
    `<text class="text-header" x="${x}" y="${y}">${escXml(heading)}</text>`,
  ];
  y += 16;
  if (actionName) {
    lines.push(`<text class="text-secondary" x="${x}" y="${y}">${escXml(actionName)}</text>`);
    y += 16;
  }
  lines.push(`<text class="text-secondary" x="${x}" y="${y}">${escXml(filename)}</text>`);
  y += 16;
  lines.push(`<text class="text-secondary" x="${x}" y="${y}">${escXml(dateLine)}</text>`);
  return `<g class="diagram-title-block">\n  ${lines.join('\n  ')}\n</g>`;
}

function networkSvg(doc: ActivityDoc, gaps: ActivitiesLayoutOptions = {}, curvature: number = DEFAULT_EDGE_CURVATURE, entryCurvature?: number, heading?: string, filename?: string, date?: string, version?: string, actionName?: string): string {
  const layout: ActivitiesLayout = layoutActivities(doc, gaps);
  if (layout.nodes.length === 0) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text class="text-primary" x="10" y="40">No activities</text></svg>';
  }

  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? (TITLE_BLOCK_H + (actionName ? ACTIVITY_ACTION_NAME_H : 0)) : 0;
  const cpm = computeCpm(doc.activities ?? []);
  const W = layout.bounds.width + N_PAD * 2;
  const H = layout.bounds.height + N_PAD * 2 + titleH;
  const ox = -layout.bounds.x + N_PAD;
  const oy = -layout.bounds.y + N_PAD + titleH;

  const body = renderActivitiesNetworkBody(layout, cpm, ox, oy, curvature, entryCurvature);

  const titleSvg = showTitle ? activityTitleBlockSvg(heading!, filename!, date!, N_PAD, N_PAD, actionName) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
${ACTIVITIES_NETWORK_DEFS}
${titleSvg}
${body}
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

function ganttSvg(layout: GanttLayout, heading?: string, filename?: string, date?: string, version?: string, actionName?: string): string {
  // Sort bars by start date then id for stable display order.
  const bars = [...layout.bars].sort((a, b) => {
    if (a.startDate !== b.startDate) return a.startDate < b.startDate ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? (TITLE_BLOCK_H + (actionName ? ACTIVITY_ACTION_NAME_H : 0)) : 0;
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
    `<text class="text-secondary" x="${ox + 12}" y="${oy + G_HEADER_H / 2}" dominant-baseline="central">Actions</text>`,
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
    // Label column — name on top (primary), id below in smaller grey text.
    // Stacked rather than side-by-side: a single row width isn't enough to
    // show both without overlap once the id gets past a handful of characters.
    rowParts.push(
      `<text class="text-primary" x="${ox + 8}" y="${rowY + 15}" dominant-baseline="central">${escXml(truncate(bar.name, 28))}</text>`,
    );
    rowParts.push(
      `<text class="text-id" x="${ox + 8}" y="${rowY + 29}" dominant-baseline="central">${escXml(truncate(bar.id, 30))}</text>`,
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
  const ENTER_DEPTH = 0;    // path ends exactly at target.left so marker tip lands on the bar's edge, not inside it

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

    // Forward routes: when *every* outgoing target has enough horizontal room
    // for its own elbow, skip the trunk and emit per-target right-down-right
    // L-elbows. The trunk+branches design exists to gather multiple outgoing
    // routes safely and to keep the back-step vertical clear of intermediate
    // bars — both concerns vanish when each target sits far enough past the
    // source's end column to host its own vertical with STUB_OUT clearance
    // from both edges. Hand-test feedback: the back-step LEFT of source read
    // as a pointless kink even when the source had multiple outgoing links,
    // as long as all of them had room.
    if (forward.length > 0 && forward.every(t => (t.tx - sx) >= 2 * STUB_OUT)) {
      for (const t of forward) {
        const cls = t.link.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
        const marker = t.link.isCritical ? 'gantt-arrow-crit' : 'gantt-arrow';
        const enterX = t.tx + ENTER_DEPTH;
        // Vertical at the midpoint between source.end and target.start, clamped
        // to STUB_OUT away from either bar edge (the all-have-room check above
        // already guarantees the clamp window is non-empty).
        const midX = (sx + t.tx) / 2;
        const vx = Math.max(sx + STUB_OUT, Math.min(t.tx - STUB_OUT, midX));
        const d = `M${sx},${sy} L${vx},${sy} L${vx},${t.ty} L${enterX},${t.ty}`;
        pushLinkPath(`<path d="${d}" class="${cls}" fill="none" marker-end="url(#${marker})"/>`, t.link.isCritical);
      }
    } else if (forward.length > 0) {
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

  const titleSvg = showTitle ? activityTitleBlockSvg(heading!, filename!, date!, G_PAD, G_PAD, actionName) : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="gantt-arrow" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
    <path d="M0,0 L0,6 L6,3 z" class="arrow-fill"/>
  </marker>
  <marker id="gantt-arrow-crit" markerWidth="6" markerHeight="6" refX="6" refY="3" orient="auto" markerUnits="userSpaceOnUse">
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

interface ActivityViews {
  /** Network (PSND) SVG. Always present when activities validated. */
  networkSvg: string;
  /** Body content of the Gantt section: either the Gantt SVG or the
   *  "unavailable" notice block. Always non-empty. */
  ganttBody: string;
  /** Gantt SVG string when computed mode/pinned mode produced one; empty
   *  string when Gantt is unavailable. Used by Save-as-SVG. */
  ganttSvg: string;
  /** HTML tree view body. Always non-empty when activities validated. */
  treeHtml: string;
  /** Nested-list Markdown rendering of the same hierarchy as treeHtml. Used by "Export tree as .md". */
  treeMarkdown: string;
}

// ── Tree view renderer ───────────────────────────────────────────────────────

const ACTIVITY_TYPE_LEVEL: Record<string, number> = {
  initiative: 1, 'strategic initiative': 1,
  programme: 2, program: 2,
  project: 3,
  task: 4,
};

function activityTypeLevel(type: string | undefined): number {
  return type ? (ACTIVITY_TYPE_LEVEL[type.toLowerCase()] ?? 99) : 99;
}

function activityTypeBadgeClass(type: string | undefined): string {
  if (!type) return '';
  return `tree-badge tree-badge-${type.toLowerCase().replace(/\s+/g, '-')}`;
}

function buildTreeHtml(doc: ActivityDoc, filename: string, date: string, version?: string, actionName?: string): string {
  // Unlike Network and Gantt, the Tree view keeps project-type container
  // nodes visible — it's the WBS/hierarchy view, so the root of the tree is
  // exactly where the project scope belongs (#337). Network/Gantt suppress it
  // because those diagrams have no natural place for a durationless container.
  const activities = doc.activities ?? [];
  if (activities.length === 0) {
    return '<div class="section-notice">No activities to display.</div>';
  }

  const childrenOf = new Map<string | undefined, Activity[]>();
  for (const act of activities) {
    const key = act.parent ?? undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(act);
  }

  const sortFn = (a: Activity, b: Activity): number => {
    const diff = activityTypeLevel(a.activity_type) - activityTypeLevel(b.activity_type);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };
  for (const [, kids] of childrenOf) kids.sort(sortFn);

  function renderNode(act: Activity): string {
    const kids = childrenOf.get(act.id) ?? [];
    const badgeClass = activityTypeBadgeClass(act.activity_type);
    const badge = act.activity_type
      ? `<span class="${badgeClass}">${escXml(act.activity_type)}</span>`
      : '';
    const metaParts: string[] = [];
    if (act.owner) metaParts.push(escXml(act.owner));
    if (act.start_date && act.end_date) metaParts.push(`${escXml(act.start_date)} → ${escXml(act.end_date)}`);
    else if (act.start_date) metaParts.push(`from ${escXml(act.start_date)}`);
    const meta = metaParts.length
      ? `<span class="tree-node-meta">${metaParts.join(' · ')}</span>`
      : '';
    const label = `<div class="tree-node-label"><span class="tree-node-name">${escXml(act.name)}</span><span class="tree-node-id">${escXml(act.id)}</span></div>`;

    if (kids.length === 0) {
      return `<div class="tree-node tree-leaf"><div class="tree-node-row">${label}${badge}${meta}</div></div>`;
    }
    const openAttr = activityTypeLevel(act.activity_type) <= 3 ? ' open' : '';
    const kidsHtml = `<div class="tree-children">${kids.map((k) => renderNode(k)).join('')}</div>`;
    return `<details class="tree-node"${openAttr}><summary class="tree-node-row">${label}${badge}${meta}</summary>${kidsHtml}</details>`;
  }

  const allIds = new Set(activities.map((a) => a.id));
  const orphans = activities.filter((a) => a.parent && !allIds.has(a.parent));
  const roots = [...(childrenOf.get(undefined) ?? []), ...orphans].sort(sortFn);

  if (roots.length === 0) {
    return '<div class="section-notice">No root activities found — check parent references.</div>';
  }

  const versionPart = version ? ` · v${escXml(version)}` : '';
  const actionNameLine = actionName
    ? `\n  <div class="text-secondary">${escXml(actionName)}</div>`
    : '';
  const titleHtml = `<div class="diagram-title-block diagram-title-block-html">
  <div class="text-header">Tree view — Initiative → Programme → Project → Task</div>${actionNameLine}
  <div class="text-secondary">${escXml(filename)}</div>
  <div class="text-secondary">${escXml(date)}${versionPart}</div>
</div>`;

  // The tree's actual root is the Action document itself (the Action name
  // shown in the title block above) — not a forest of independent top-level
  // activities. Wrapping `roots` under one synthetic node makes that
  // structure visible: every activity nests under the plan it belongs to,
  // matching the "virtual root" convention (elements/24-action.md §1) scaled
  // down to this single document instead of the whole portfolio.
  const docRootLabel = actionName ?? filename;
  const docRootHtml = `<details class="tree-node tree-node-doc-root" open><summary class="tree-node-row tree-node-doc-root-row"><div class="tree-node-label"><span class="tree-node-name">${escXml(docRootLabel)}</span></div></summary><div class="tree-children">${roots.map((r) => renderNode(r)).join('')}</div></details>`;

  return `${titleHtml}<div class="tree-view">${docRootHtml}</div>`;
}

/** Nested-list Markdown rendering of the same hierarchy as {@link buildTreeHtml}. */
function buildTreeMarkdown(doc: ActivityDoc, actionName?: string): string {
  const activities = doc.activities ?? [];
  const heading = actionName ? `# ${actionName} — action decomposition` : '# Action decomposition';
  if (activities.length === 0) {
    return `${heading}\n\nNo activities to display.\n`;
  }

  const childrenOf = new Map<string | undefined, Activity[]>();
  for (const act of activities) {
    const key = act.parent ?? undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(act);
  }
  const sortFn = (a: Activity, b: Activity): number => {
    const diff = activityTypeLevel(a.activity_type) - activityTypeLevel(b.activity_type);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };
  for (const [, kids] of childrenOf) kids.sort(sortFn);

  const lines: string[] = [];
  function renderNode(act: Activity, depth: number): void {
    const metaParts: string[] = [];
    if (act.activity_type) metaParts.push(act.activity_type);
    if (act.owner) metaParts.push(act.owner);
    if (act.start_date && act.end_date) metaParts.push(`${act.start_date} → ${act.end_date}`);
    else if (act.start_date) metaParts.push(`from ${act.start_date}`);
    const meta = metaParts.length ? ` — ${metaParts.join(' · ')}` : '';
    lines.push(`${'  '.repeat(depth)}- ${act.name} (\`${act.id}\`)${meta}`);
    for (const kid of childrenOf.get(act.id) ?? []) renderNode(kid, depth + 1);
  }

  const allIds = new Set(activities.map((a) => a.id));
  const orphans = activities.filter((a) => a.parent && !allIds.has(a.parent));
  const roots = [...(childrenOf.get(undefined) ?? []), ...orphans].sort(sortFn);

  if (roots.length === 0) {
    return `${heading}\n\nNo root activities found — check parent references.\n`;
  }

  // Mirror buildTreeHtml's synthetic doc-root: one top-level bullet for the
  // Action document itself, with every parentless/orphan activity nested
  // under it — not a flat list of independent top-level bullets.
  const docRootLabel = actionName ?? 'Action';
  lines.push(`- ${docRootLabel}`);
  for (const root of roots) renderNode(root, 1);
  return `${heading}\n\n${lines.join('\n')}\n`;
}

/**
 * Renderer/view convention (follow-up to #421, corrected by #341's Tree
 * regression):
 *
 * Project-type container nodes (activity_type === 'project') are suppressed
 * from the Network and Gantt views — those diagrams have no natural place for
 * a durationless container, and rendering it as a node/bar adds visual noise.
 * The Tree view is the WBS/hierarchy view and keeps the project node visible
 * as the root — that's exactly where a reader expects to see the project
 * scope. The doc.title (Action name) is additionally shown in each view's
 * header as its own line. Canonical parent linkage is preserved in the raw
 * doc; only the Network/Gantt rendered node lists are narrowed.
 * doc.project.start_date (used by the Gantt for computed mode) is on the
 * project block, not on any activity — filtering activities does not affect
 * Gantt date computation.
 */
function buildActivityViews(doc: ActivityDoc, gaps: ActivitiesLayoutOptions, curvature: number, entryCurvature: number | undefined, filename: string, date: string, version?: string): ActivityViews {
  // Suppress project-type container nodes from all views. A shallow copy is
  // sufficient — only the activities array is replaced; all other doc fields
  // (project block, title, dates, etc.) are shared by reference and not mutated.
  const filteredActivities = (doc.activities ?? []).filter(
    (a) => a.activity_type?.toLowerCase() !== 'project',
  );
  const filteredDoc: ActivityDoc = { ...doc, activities: filteredActivities };
  const actionName = doc.title ?? undefined;

  const networkHeading = 'Network view — Project Schedule Network Diagram (PSND)';
  const networkSvgStr = networkSvg(filteredDoc, gaps, curvature, entryCurvature, networkHeading, filename, date, version, actionName);
  const gantt: GanttResult = computeGanttLayout(filteredDoc);
  const treeMarkdownStr = buildTreeMarkdown(doc, actionName);

  const dateLine = date;

  if (isGanttUnavailable(gantt)) {
    // No SVG to embed the title into — fall back to an HTML title block plus
    // the notice so the unavailable path still shows the same paragraph.
    const actionNameLine = actionName
      ? `\n  <div class="text-secondary">${escXml(actionName)}</div>`
      : '';
    const ganttBody = `<div class="diagram-title-block diagram-title-block-html">
  <div class="text-header">Gantt view — unavailable</div>${actionNameLine}
  <div class="text-secondary">${escXml(filename)}</div>
  <div class="text-secondary">${escXml(dateLine)}</div>
</div>
<div class="section-notice">${escXml(gantt.reason)}</div>`;
    const treeHtmlStr = buildTreeHtml(doc, filename, date, version, actionName);
    return { networkSvg: networkSvgStr, ganttBody, ganttSvg: '', treeHtml: treeHtmlStr, treeMarkdown: treeMarkdownStr };
  }

  const modeLabel = gantt.mode === 'computed'
    ? `computed mode (project ${gantt.timelineStart} → ${gantt.timelineEnd})`
    : `pinned mode (${gantt.timelineStart} → ${gantt.timelineEnd})`;
  const ganttHeading = `Gantt view — ${modeLabel}`;
  const ganttSvgStr = ganttSvg(gantt, ganttHeading, filename, date, version, actionName);
  const treeHtmlStr = buildTreeHtml(doc, filename, date, version, actionName);
  return { networkSvg: networkSvgStr, ganttBody: ganttSvgStr, ganttSvg: ganttSvgStr, treeHtml: treeHtmlStr, treeMarkdown: treeMarkdownStr };
}

function buildCanvasContent(views: ActivityViews): string {
  // Pure-CSS tab switcher: hidden radio inputs at the top, labels styled as
  // tabs, panels shown via `:checked ~ section[data-view=…]`. Works under the
  // webview's `enableScripts: false` + script-less CSP because no JS is
  // involved — the browser handles `:checked` natively.
  return `<input type="radio" id="view-network" name="view-tabs" class="view-radio" checked>
<input type="radio" id="view-gantt" name="view-tabs" class="view-radio">
<input type="radio" id="view-tree" name="view-tabs" class="view-radio">
<nav class="view-tabs" role="tablist">
  <label for="view-network" class="view-tab" data-tab="network">Network</label>
  <label for="view-gantt" class="view-tab" data-tab="gantt">Gantt</label>
  <label for="view-tree" class="view-tab" data-tab="tree">Tree</label>
</nav>
<section class="diagram-section" data-view="network">
  ${views.networkSvg}
</section>
<section class="diagram-section" data-view="gantt">
  ${views.ganttBody}
</section>
<section class="diagram-section" data-view="tree">
  ${views.treeHtml}
</section>`;
}

// ── Extra CSS injected into the diagram frame ───────────────────────────────
//
// Split into two pieces so the exported .svg file carries only the rules that
// shape the diagram itself. Webview-shell rules (view switcher, section
// notice) are useless — and confusing — when the SVG is opened in Chrome.

/** Diagram-class CSS used both in the webview and in saved .svg exports. */
const ACTIVITIES_DIAGRAM_CSS = `
  .act-node { fill: var(--ts-layer-activity, #d4edda); stroke: var(--ts-node-stroke, #004d67); stroke-width: 1; }
  .critical-node { fill: var(--ts-brand-orange-tint, #ffeee5); stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1.5; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }

  .gantt-header { fill: var(--ts-bg-subtle, #f1f5f9); stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }
  .gantt-grid { stroke: var(--ts-border, #cbd5e1); stroke-width: 1; opacity: 0.5; }
  .gantt-row-alt { fill: var(--ts-bg-subtle, #f8fafc); opacity: 0.5; }
  .gantt-bar { fill: var(--ts-bg-surface, #dbeafe); stroke: var(--ts-border, #60a5fa); stroke-width: 1; }
  .gantt-bar.critical-bar { fill: var(--ts-brand-orange-tint, #ffeee5); stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1; }
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
  #canvas { padding-top: 0; }
  .view-tabs { display: flex; gap: 4px; padding: 8px 0 0; border-bottom: 1px solid var(--ts-border, #cbd5e1); margin-bottom: 8px; }
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
  /* Tree tab/panel active. */
  .view-radio#view-tree:checked ~ .view-tabs .view-tab[data-tab="tree"] {
    color: var(--ts-text, #0f172a);
    background: var(--ts-bg-surface, #ffffff);
    border-color: var(--ts-border, #cbd5e1);
  }
  .view-radio#view-tree:checked ~ section[data-view="tree"] { display: block; }

  .diagram-section { margin: 8px 0 16px; }
  .section-notice { margin: 0 16px; padding: 10px 14px; border-left: 3px solid var(--ts-text-muted, #94a3b8); background: var(--ts-bg-subtle, #f8fafc); color: var(--ts-text-muted, #64748b); font-size: 12px; }

  /* ── Tree view ───────────────────────────────────────────────────────── */
  .tree-view { padding: 4px 8px 16px; }
  .tree-node { margin: 3px 0; }
  .tree-node-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--ts-border, #e2e8f0);
    background: var(--ts-bg-surface, #ffffff);
    list-style: none;
  }
  .tree-node-row:hover { background: var(--ts-bg-subtle, #f8fafc); }
  /* Expandable nodes */
  details.tree-node > summary.tree-node-row { cursor: pointer; }
  details.tree-node > summary.tree-node-row::-webkit-details-marker { display: none; }
  details.tree-node > summary.tree-node-row::before {
    content: '▶';
    font-size: 9px;
    color: var(--ts-text-muted, #94a3b8);
    flex-shrink: 0;
    display: inline-block;
  }
  details[open].tree-node > summary.tree-node-row::before { transform: rotate(90deg); }
  /* Leaf nodes get the same left padding as nodes with the arrow */
  .tree-leaf > .tree-node-row { padding-left: 27px; }
  /* Children group — indent + left branch line */
  .tree-children {
    margin-left: 20px;
    padding-left: 16px;
    padding-top: 2px;
    padding-bottom: 2px;
    border-left: 1.5px solid var(--ts-border, #cbd5e1);
  }
  .tree-node-label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .tree-node-name { font-size: 13px; color: var(--ts-text, #0f172a); }
  .tree-node-id { font-size: 11px; color: var(--ts-text-muted, #64748b); font-family: var(--vscode-editor-font-family, monospace); }
  .tree-node-meta { font-size: 11px; color: var(--ts-text-muted, #64748b); white-space: nowrap; }
  .tree-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; }
  .tree-badge-initiative,
  .tree-badge-strategic-initiative { background: var(--ts-brand-orange-tint, #ffeee5); color: var(--ts-brand-orange, #ff4d00); border: 1px solid var(--ts-brand-orange, #ff4d00); }
  .tree-badge-programme { background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; }
  .tree-badge-project { background: var(--ts-layer-activity, #d4edda); color: #166534; border: 1px solid #86efac; }
  .tree-badge-task { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); border: 1px solid var(--ts-border, #cbd5e1); }
  /* Doc-root row — the Action document itself, distinct from its activities. */
  .tree-node-doc-root-row { border-color: var(--ts-brand-orange, #ff4d00); background: var(--ts-bg-subtle, #f8fafc); }
  .tree-node-doc-root-row .tree-node-name { font-weight: 700; font-size: 14px; }
  .tree-node-doc-root > .tree-children { margin-left: 8px; }
`;

const ACTIVITIES_STYLES = ACTIVITIES_WEBVIEW_CSS + ACTIVITIES_DIAGRAM_CSS;

// ── ActionPreview webview class ───────────────────────────────────────────────

export class ActionPreview {
  readonly panelTitle = 'Action Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  // Saved separately so Save .svg can offer whichever view the user wants —
  // the webview's CSS-only Network/Gantt switcher doesn't surface its state
  // back to the extension, so the only way to honour "save current view" is
  // to ask the user when both views are available.
  private lastNetworkSvg = '';
  private lastGanttSvg = '';
  private lastTreeMarkdown = '';

  constructor(private readonly extensionUri: vscode.Uri) {}

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
        'actionPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          // Scripts enabled for the in-preview spacing/curvature controls under
          // the strict nonce CSP (#75/#76 PR2). The CSS-only Network/Gantt tab
          // switcher and zoom control continue to work unchanged. Activities
          // has no scope control (#77 excludes it).
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: ['transitrixStudio.saveActivitiesAsSvg', 'transitrixStudio.saveActivitiesAsPng', 'transitrixStudio.copyActivitiesAsPng', EXPORT_TREE_MARKDOWN_COMMAND, OPEN_SPACING_SETTINGS_COMMAND, OPEN_CURVATURE_SETTINGS_COMMAND, OPEN_THEME_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void applyControlMessage('action', m); });
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  /** Re-render the tracked document — used when a spacing/theme setting changes. */
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
    let warnings: string[] = [];

    const spacingDefaults = { horizontalGap: ACTIVITIES_DEFAULT_H_GAP, verticalGap: ACTIVITIES_DEFAULT_V_GAP };
    const spacing = readSpacing('action', spacingDefaults);
    const curvature = readCurvature('action');
    const entryCurvature = readEntryCurvature('action');

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      // Document version/date for the title block. `version` is optional;
      // `date` falls back to today when the document has no date field —
      // a frozen version paired with a floating render date would be
      // incoherent, so the doc's own date wins when present.
      const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
      const docVersion = typeof raw['version'] === 'string' ? raw['version'] : undefined;
      const docDate = (typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined)
        ?? (typeof raw['date'] === 'string' ? raw['date'] : undefined)
        ?? todayIso();
      const v = validateActivities(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const nodeSize = readActionNodeSize();
        const views = buildActivityViews(parsed as ActivityDoc, { horizontalGap: spacing.horizontalGap, verticalGap: spacing.verticalGap, nodeWidth: nodeSize.width, nodeHeight: nodeSize.height }, curvature, entryCurvature, filename, docDate, docVersion);
        bodyContent = buildCanvasContent(views);
        this.lastNetworkSvg = views.networkSvg;
        this.lastGanttSvg = views.ganttSvg;
        this.lastTreeMarkdown = views.treeMarkdown;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    if (!bodyContent) {
      this.lastNetworkSvg = '';
      this.lastGanttSvg = '';
      this.lastTreeMarkdown = '';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    const nonce = genNonce();
    // Activities has spacing + curvature controls but no scope filter (#77
    // excludes it — its multi-row CPM layout isn't a uniform tree).
    const nodeSizePreset = readNodeSizePreset('action');
    const controlsPanel = buildControlsPanel({
      spacing: { ...spacing, defaults: spacingDefaults },
      curvature: { value: curvature, default: 1 },
      nodeSize: { value: nodeSizePreset, default: 'normal' },
    });

    return buildDiagramFrame({
      filename,
      notation: 'Actions (PSND + Gantt)',
      bodyContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: ACTIVITIES_STYLES,
      saveSvgCommand: 'transitrixStudio.saveActivitiesAsSvg',
      savePngCommand: 'transitrixStudio.saveActivitiesAsPng',
      copyPngCommand: 'transitrixStudio.copyActivitiesAsPng',
      spacingCommand: OPEN_SPACING_SETTINGS_COMMAND,
      curvatureCommand: OPEN_CURVATURE_SETTINGS_COMMAND,
      themeCommand: OPEN_THEME_COMMAND,
      extraButtons: [{ command: EXPORT_TREE_MARKDOWN_COMMAND, label: 'Export tree as .md', title: 'Save the Tree view decomposition as a nested Markdown list' }],
      interactive: { nonce, controlsPanel, controlsScript: buildControlsScript(nonce) },
    });
  }

  /** Save the Tree view's current hierarchy as a nested Markdown list. */
  async exportTreeAsMarkdown(): Promise<void> {
    if (!this.lastTreeMarkdown) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.action.transitrix.yaml or *.dgca.transitrix.yaml (with notation: action) file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.(action|dgca)\.transitrix\.yaml$/, '')
      : 'action-tree';
    const suffixed = `${stem}-tree.md`;
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), suffixed))
      : vscode.Uri.file(suffixed);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'Markdown': ['md'] } });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(this.lastTreeMarkdown, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  /**
   * Resolve which of the two views (network / Gantt) to export. The CSS-only
   * switcher state is invisible to the extension, so when both are present we
   * ask; when only one rendered (Gantt-unavailable mode) we skip the prompt.
   * Returns undefined when nothing is rendered or the user cancels.
   */
  private async pickExportView(): Promise<'network' | 'gantt' | undefined> {
    const hasNetwork = Boolean(this.lastNetworkSvg);
    const hasGantt = Boolean(this.lastGanttSvg);
    if (!hasNetwork && !hasGantt) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.activities.transitrix.yaml or *.dgca.transitrix.yaml (with notation: activities) file first.');
      return undefined;
    }
    if (hasNetwork && hasGantt) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Network view', description: 'Project Schedule Network Diagram (PSND)', view: 'network' as const },
          { label: 'Gantt view',   description: 'Timeline',                                  view: 'gantt'   as const },
        ],
        { placeHolder: 'Which view do you want to export?' },
      );
      return choice?.view;
    }
    return hasNetwork ? 'network' : 'gantt';
  }

  async saveAsPng(): Promise<void> {
    const view = await this.pickExportView();
    if (!view) return;
    const rawSvg = view === 'network' ? this.lastNetworkSvg : this.lastGanttSvg;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    await savePngFromSvg({
      rawSvg: rawSvg || undefined,
      themeId,
      notationCss: ACTIVITIES_DIAGRAM_CSS,
      sourceUri,
      stripExt: /\.activities\.transitrix\.yaml$/,
      viewSuffix: `-${view}`,
      emptyMessage: 'No diagram rendered yet. Open a *.activities.transitrix.yaml or *.dgca.transitrix.yaml (with notation: activities) file first.',
    });
  }

  async copyAsPng(): Promise<void> {
    const view = await this.pickExportView();
    if (!view) return;
    const rawSvg = view === 'network' ? this.lastNetworkSvg : this.lastGanttSvg;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    await copyPngFromSvg({
      rawSvg: rawSvg || undefined,
      themeId,
      notationCss: ACTIVITIES_DIAGRAM_CSS,
      emptyMessage: 'No diagram rendered yet. Open a *.activities.transitrix.yaml or *.dgca.transitrix.yaml (with notation: activities) file first.',
    });
  }

  async saveAsSvg(): Promise<void> {
    const hasNetwork = Boolean(this.lastNetworkSvg);
    const hasGantt = Boolean(this.lastGanttSvg);
    if (!hasNetwork && !hasGantt) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.activities.transitrix.yaml or *.dgca.transitrix.yaml (with notation: activities) file first.');
      return;
    }

    // Pick the view to save. CSS-only switcher state is invisible to the
    // extension, so when both exist we ask explicitly. When only one is
    // available (Gantt unavailable mode), skip the prompt.
    let view: 'network' | 'gantt';
    if (hasNetwork && hasGantt) {
      const choice = await vscode.window.showQuickPick(
        [
          { label: 'Network view', description: 'Project Schedule Network Diagram (PSND)', view: 'network' as const },
          { label: 'Gantt view',   description: 'Timeline',                                  view: 'gantt'   as const },
        ],
        { placeHolder: 'Which view do you want to save?' },
      );
      if (!choice) return;
      view = choice.view;
    } else {
      view = hasNetwork ? 'network' : 'gantt';
    }

    const svgSource = view === 'network' ? this.lastNetworkSvg : this.lastGanttSvg;
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.activities\.transitrix\.yaml$/, '')
      : 'diagram';
    const suffixed = `${stem}-${view}.svg`;
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), suffixed))
      : vscode.Uri.file(suffixed);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'SVG Image': ['svg'] } });
    if (!target) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const svg = prepareSvgForExport(svgSource, themeId, ACTIVITIES_DIAGRAM_CSS);
    await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }
}
