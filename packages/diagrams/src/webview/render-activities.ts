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
import { horizontalCubicEdgePath, bowedCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { parseNodeSizePreset, resolveActionNodeSize, type NodeSizePreset } from '../node-size-presets.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { emitCenteredTextSvg, layoutCenteredEntityText } from './entity-text-layout.js';
import { escXml } from './render-util.js';

const N_PAD = 24;

/**
 * Network-view diagram CSS (critical path, milestones, edge colours) — the
 * canonical rules shared with the VS Code preview's `ACTIVITIES_DIAGRAM_CSS`
 * network subset. Embedded alongside the shared theme CSS so the SVG is
 * self-contained for the JCEF host.
 */
export const ACTIVITIES_NETWORK_CSS = `
  .act-node { fill: var(--ts-layer-activity, #d4edda); stroke: var(--ts-node-stroke, #004d67); stroke-width: 1; }
  .critical-node { fill: var(--ts-brand-orange-tint, #ffeee5); stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 1.5; }
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

type ActivityLayoutNode = ActivitiesLayout['nodes'][number];

/**
 * Nodes horizontally between `source` and `target` (a "skip" edge passes over
 * their column) whose vertical span overlaps the edge's Y band. A
 * straight-tangent cubic (`horizontalCubicEdgePath`) stays within
 * [min(sourceCenterY,targetCenterY), max(...)] by convex hull, so any such
 * node sits directly on the edge's path — the "arrow goes straight through
 * the node" bug reported against a linear PSND chain where a multi-predecessor
 * activity's nearer predecessor shares a row with an intermediate column.
 */
function blockingNodes(
  nodes: ActivityLayoutNode[],
  source: ActivityLayoutNode,
  target: ActivityLayoutNode,
): ActivityLayoutNode[] {
  const sCenterY = source.y + source.height / 2;
  const tCenterY = target.y + target.height / 2;
  const loY = Math.min(sCenterY, tCenterY);
  const hiY = Math.max(sCenterY, tCenterY);
  const sRight = source.x + source.width;
  const tLeft = target.x;
  return nodes.filter((n) => {
    if (n.id === source.id || n.id === target.id) return false;
    if (n.x + n.width <= sRight || n.x >= tLeft) return false; // not between the two columns
    return n.y < hiY && n.y + n.height > loY; // vertical overlap with the edge's band
  });
}

/**
 * Pre-offset bow-control-point Y for a skip edge arcing over `blockers`: one
 * full node-height of clearance above the topmost blocker's top edge. A
 * cubic's apex only reaches part-way toward its control point (see
 * `bowedCubicEdgePath` doc), so this generous margin is what actually keeps
 * the visible curve clear of the box — verified numerically in
 * `render-activities.test.ts`.
 */
function bowY(blockers: ActivityLayoutNode[]): number {
  const topY = Math.min(...blockers.map((n) => n.y));
  const clearance = Math.max(...blockers.map((n) => n.height));
  return topY - clearance;
}

/**
 * Extra top padding (px) a network-view canvas must add so skip-edge bows
 * (see `blockingNodes`/`bowY` above) never draw above the SVG's y=0 and get
 * clipped. `oyBase` is the canvas's Y offset *before* this padding — the
 * historical `-bounds.y + N_PAD + titleH` both hosts compute — since a bow
 * near the topmost row can reach above the diagram's own node bounds.
 * Callers add the returned value to both `oyBase` and the canvas height.
 */
export function computeNetworkTopPad(layout: ActivitiesLayout, oyBase: number): number {
  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));
  let pad = 0;
  for (const e of layout.edges) {
    const s = nodeMap.get(e.sourceId);
    const t = nodeMap.get(e.targetId);
    if (!s || !t) continue;
    const blockers = blockingNodes(layout.nodes, s, t);
    if (blockers.length === 0) continue;
    const shortfall = -(oyBase + bowY(blockers));
    if (shortfall > pad) pad = shortfall;
  }
  return pad;
}

function activityNodeSvg(
  n: ActivitiesLayout['nodes'][number],
  x: number,
  y: number,
  isCritical: boolean,
  isMilestone: boolean,
  durLabel: string,
): string {
  const cls = `diagram-node act-node ${isCritical ? 'critical-node' : ''} ${isMilestone ? 'milestone-node' : ''}`.trim();
  const specs = layoutCenteredEntityText({
    boxX: x,
    boxY: y,
    boxWidth: n.width,
    boxHeight: n.height,
    name: n.data.name,
    id: n.id,
    nameMaxLines: 2,
    idMaxLines: 1,
  });
  const textSvg = emitCenteredTextSvg(specs, x + n.width / 2, escXml);
  return [
    `<rect class="${cls}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>`,
    textSvg,
    durLabel ? `<text class="text-secondary" x="${x + n.width - 8}" y="${y + n.height - 8}" text-anchor="end">${durLabel}</text>` : '',
  ].filter(Boolean).join('\n');
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
      const blockers = blockingNodes(layout.nodes, s, t);
      const d = blockers.length > 0
        ? bowedCubicEdgePath(sx, sy, tx, ty, bowY(blockers) + oy, curvature)
        : horizontalCubicEdgePath(sx, sy, tx, ty, curvature, entryCurvature);
      return `<path d="${d}" class="${cls}" marker-end="${marker}"/>`;
    })
    .join('\n');

  const nodeSvg = layout.nodes
    .map((n) => {
      const x = n.x + ox;
      const y = n.y + oy;
      const isCritical = cpm.get(n.id)?.isCritical ?? false;
      const durVal = n.data.duration;
      const isMilestone = (durVal ?? -1) === 0;
      const durLabel = (durVal !== undefined && durVal > 0) ? `${durVal}d` : '';
      return activityNodeSvg(n, x, y, isCritical, isMilestone, durLabel);
    })
    .join('\n');

  return `${nodeSvg}\n${edgeSvg}`;
}

export interface RenderActivitiesOptions {
  /** Optional heading rendered as a `text-header` above the diagram. */
  title?: string;
  /** Network column / row gaps and node size. Defaults match `layoutActivities`. */
  gaps?: ActivitiesLayoutOptions;
  nodeSizePreset?: NodeSizePreset;
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
    nodeSizePreset = 'normal',
    curvature = DEFAULT_EDGE_CURVATURE,
    entryCurvature,
    suppressProjectNodes = true,
  } = options;
  const nodeSize = resolveActionNodeSize(parseNodeSizePreset(nodeSizePreset));
  const layoutGaps: ActivitiesLayoutOptions = {
    ...gaps,
    nodeWidth: gaps.nodeWidth ?? nodeSize.width,
    nodeHeight: gaps.nodeHeight ?? nodeSize.height,
  };

  // #421: Suppress project-type container nodes in the network layout by
  // default (see suppressProjectNodes JSDoc). A shallow copy avoids mutating
  // the caller's doc.
  const renderDoc: ActivityDoc = suppressProjectNodes
    ? { ...doc, activities: (doc.activities ?? []).filter((a) => a.activity_type?.toLowerCase() !== 'project') }
    : doc;

  const layout: ActivitiesLayout = layoutActivities(renderDoc, layoutGaps);

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const cpm = computeCpm(renderDoc.activities ?? []);
  const titleH = title ? 24 : 0;
  const oyBase = -layout.bounds.y + N_PAD + titleH;
  const topPad = computeNetworkTopPad(layout, oyBase);
  const w = layout.bounds.width + N_PAD * 2;
  const h = layout.bounds.height + N_PAD * 2 + titleH + topPad;
  const ox = -layout.bounds.x + N_PAD;
  const oy = oyBase + topPad;

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
