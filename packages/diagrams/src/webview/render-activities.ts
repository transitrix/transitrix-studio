/**
 * Browser-safe SVG renderer for the Activities notation (network / PSND view).
 *
 * Step 4 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated ActivityDoc into renderable SVG so JCEF can drop it into the
 * preview panel. The VS Code path lives in `extension/src/activities-preview.ts`
 * and pulls in VS Code-specific concerns (themes, title block, Gantt tab
 * switcher, save dialogs); this module is the host-neutral subset — pure
 * layout → SVG with no VS Code APIs, no `node:fs`, no `node:path`.
 *
 * Only the DEFAULT network view (Project Schedule Network Diagram) is ported.
 * The Gantt view, the CSS-only tab switcher and the interactive spacing /
 * curvature controls stay in the VS Code preview.
 *
 * Single-emitter unification (review C): the canonical network body lives here
 * in `renderActivitiesNetworkBody` and is shared verbatim with the VS Code
 * preview's `networkSvg`.
 */
import { layoutActivities } from '../activities/layout.js';
import { computeCpm } from '../activities/cpm.js';
import type {
  ActivityDoc,
  ActivitiesLayout,
  ActivitiesLayoutOptions,
} from '../activities/types.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

const N_NODE_W = 200;
const N_NODE_H = 80;
const N_PAD = 24;

/**
 * Network-view diagram CSS (critical path, milestones, edge colours) — the
 * canonical rules shared with the VS Code preview's `ACTIVITIES_DIAGRAM_CSS`
 * network subset. Embedded alongside the shared theme CSS so the SVG is
 * self-contained for the JCEF host.
 */
export const ACTIVITIES_NETWORK_CSS = `
  .act-node { fill: var(--ts-layer-activity, #d4edda); stroke: var(--ts-node-stroke, #94a3b8); stroke-width: 1; }
  .critical-node { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2.5; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }
`;

/** Arrowhead marker defs shared by both hosts for the network view. */
export const ACTIVITIES_NETWORK_DEFS = `<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
  <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>`;

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

/**
 * Canonical Network (PSND) body — the node rects and edge paths that go inside
 * the `<svg>`, shared verbatim by the VS Code preview and the host-neutral
 * wrapper below. Excludes the host-specific title block and the (identical)
 * marker defs (`ACTIVITIES_NETWORK_DEFS`).
 *
 * `ox`/`oy` are the canvas offsets (the caller folds in padding + any title
 * height); `curvature`/`entryCurvature` scale the exit/entry edge handles.
 */
export function renderActivitiesNetworkBody(
  layout: ActivitiesLayout,
  cpm: ReturnType<typeof computeCpm>,
  ox: number,
  oy: number,
  curvature: number,
  entryCurvature: number | undefined,
): string {
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  // SVG paints later siblings over earlier ones. Sort non-critical first so the
  // bright orange critical-path edges land on top — a gray edge crossing an
  // orange one shouldn't bury the critical signal.
  const orderedEdges = [...layout.edges].sort(
    (a, b) => Number(Boolean(a.isCritical)) - Number(Boolean(b.isCritical)),
  );

  const edgeSvg = orderedEdges
    .map((e) => {
      const s = nodeMap.get(e.sourceId);
      const t = nodeMap.get(e.targetId);
      if (!s || !t) return '';
      const sx = s.x + ox + s.width;
      const sy = s.y + oy + s.height / 2;
      const tx = t.x + ox;
      const ty = t.y + oy + t.height / 2;
      const cls = e.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
      const marker = `url(#${e.isCritical ? 'arrow-crit' : 'arrow'})`;
      return `<path d="${horizontalCubicEdgePath(sx, sy, tx, ty, curvature, entryCurvature)}" class="${cls}" marker-end="${marker}"/>`;
    })
    .join('\n');

  const nodeSvg = layout.nodes
    .map((n) => {
      const x = n.x + ox;
      const y = n.y + oy;
      const isCritical = cpm.get(n.id)?.isCritical ?? false;
      const durVal = n.data.duration;
      const isMilestone = (durVal ?? -1) === 0;
      const cls = `diagram-node act-node ${isCritical ? 'critical-node' : ''} ${isMilestone ? 'milestone-node' : ''}`.trim();
      const idLabel = escXml(n.id);
      const words = n.data.name.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 24) line1 = (line1 + ' ' + w).trim();
        else if ((line2 + ' ' + w).trim().length <= 24) line2 = (line2 + ' ' + w).trim();
        else if (!line2) { line2 = w.slice(0, 22) + '…'; break; }
      }
      const twoLines = line2.length > 0;
      const nameY1 = twoLines ? y + 18 : y + 28;
      const nameY2 = y + 34;
      const idY = twoLines ? y + 54 : y + 50;
      const durLabel = (durVal !== undefined && durVal > 0) ? `${durVal}d` : '';
      return [
        `<rect class="${cls}" x="${x}" y="${y}" width="${N_NODE_W}" height="${N_NODE_H}" rx="8"/>`,
        `<text class="text-primary" x="${x + N_NODE_W / 2}" y="${nameY1}" text-anchor="middle" dominant-baseline="central">${escXml(line1)}</text>`,
        twoLines ? `<text class="text-primary" x="${x + N_NODE_W / 2}" y="${nameY2}" text-anchor="middle" dominant-baseline="central">${escXml(line2)}</text>` : '',
        `<text class="text-id" x="${x + N_NODE_W / 2}" y="${idY}" text-anchor="middle" dominant-baseline="central">${idLabel}</text>`,
        durLabel ? `<text class="text-secondary" x="${x + N_NODE_W - 8}" y="${y + N_NODE_H - 8}" text-anchor="end">${durLabel}</text>` : '',
      ].filter(Boolean).join('\n');
    })
    .join('\n');

  return `${nodeSvg}\n${edgeSvg}`;
}

export interface RenderActivitiesOptions {
  /** Optional heading rendered as a `text-header` above the diagram. */
  title?: string;
  /** Network column / row gaps. Defaults match `layoutActivities`. */
  gaps?: ActivitiesLayoutOptions;
  /** Exit edge curvature; 1 = default, 0 = straight, higher = stronger arc. */
  curvature?: number;
  /** Entry curvature at the target node; defaults to `curvature` when omitted. */
  entryCurvature?: number;
  /**
   * When true (the default), activities with `activity_type === 'project'` are
   * excluded from the network layout. Project container nodes add visual noise
   * in the PSND view because the diagram itself already represents the project
   * scope; suppressing them declutters the network without altering canonical
   * data. Set to false to render all activities regardless of type.
   *
   * Convention: Network/diagram views suppress project nodes by default.
   * Text/document views (Tree) keep them visible and compensate with the
   * Action name in the view header.
   */
  suppressProjectNodes?: boolean;
}

/**
 * Render the network (PSND) view of an already-validated ActivityDoc to a
 * self-contained SVG string.
 *
 * The caller passes a doc cast from the yaml-parsed `unknown` after
 * `validateActivities` returns valid (the activities module has no parsed
 * field, so the dispatcher does `doc as ActivityDoc`).
 *
 * Cyclic graphs degrade gracefully: `layoutActivities` / `computeCpm` defend
 * against cycles internally (Kahn's topo-order omits cyclic nodes from the
 * critical-path computation, which `computeCpm` backfills with neutral CPM
 * values), so this renderer simply renders whatever the layout returns rather
 * than short-circuiting.
 */
export function renderActivitiesSvg(doc: ActivityDoc, options: RenderActivitiesOptions = {}): string {
  const {
    title = '',
    gaps = {},
    curvature = DEFAULT_EDGE_CURVATURE,
    entryCurvature,
    suppressProjectNodes = true,
  } = options;

  // #421: Suppress project-type container nodes in the network layout by
  // default (see suppressProjectNodes JSDoc). A shallow copy avoids mutating
  // the caller's doc.
  const renderDoc: ActivityDoc = suppressProjectNodes
    ? { ...doc, activities: (doc.activities ?? []).filter((a) => a.activity_type?.toLowerCase() !== 'project') }
    : doc;

  const layout: ActivitiesLayout = layoutActivities(renderDoc, gaps);

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const cpm = computeCpm(renderDoc.activities ?? []);
  const titleH = title ? 24 : 0;
  const w = layout.bounds.width + N_PAD * 2;
  const h = layout.bounds.height + N_PAD * 2 + titleH;
  const ox = -layout.bounds.x + N_PAD;
  const oy = -layout.bounds.y + N_PAD + titleH;

  const body = renderActivitiesNetworkBody(layout, cpm, ox, oy, curvature, entryCurvature);

  const titleSvg = title
    ? `<text class="text-header" x="${N_PAD}" y="${N_PAD - 6}">${escXml(title)}</text>`
    : '';

  // Embed the shared theme CSS plus the network diagram CSS inside the SVG so
  // the rendered output is self-contained — the JCEF host page only needs to
  // drop the SVG into the DOM and styling resolves without any cooperation from
  // the host stylesheet. Matches what the VS Code path produces via
  // `prepareSvgForExport`.
  const embedCss = generateSvgEmbedCss('transitrix') + ACTIVITIES_NETWORK_CSS;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
${ACTIVITIES_NETWORK_DEFS}
${titleSvg}
${body}
</svg>`;
}
