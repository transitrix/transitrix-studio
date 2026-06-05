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

// Activities-specific diagram CSS. Mirrors `ACTIVITIES_DIAGRAM_CSS` from the
// VS Code preview — the rules that shape the network diagram itself (critical
// path, milestones, edge colours). Embedded alongside the shared theme CSS so
// the SVG is self-contained for the JCEF host.
const ACTIVITIES_DIAGRAM_CSS = `
  .act-node { fill: var(--ts-bg-surface, #f8fafc); stroke: var(--ts-border, #94a3b8); stroke-width: 1.5; }
  .critical-node { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2.5; }
  .milestone-node { fill: #ecfeff; stroke: var(--ts-text-muted, #64748b); stroke-dasharray: 4 2; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }
`;

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

export interface RenderActivitiesOptions {
  /** Optional heading rendered as a `text-header` above the diagram. */
  title?: string;
  /** Network column / row gaps. Defaults match `layoutActivities`. */
  gaps?: ActivitiesLayoutOptions;
  /** Edge curvature; 1 = default, 0 = straight, higher = stronger arc. */
  curvature?: number;
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
  const { title = '', gaps = {}, curvature = DEFAULT_EDGE_CURVATURE } = options;

  const layout: ActivitiesLayout = layoutActivities(doc, gaps);

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const cpm = computeCpm(doc.activities ?? []);
  const titleH = title ? 24 : 0;
  const w = layout.bounds.width + N_PAD * 2;
  const h = layout.bounds.height + N_PAD * 2 + titleH;
  const ox = -layout.bounds.x + N_PAD;
  const oy = -layout.bounds.y + N_PAD + titleH;

  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  // SVG paints later siblings over earlier ones. Sort non-critical first so the
  // bright orange critical-path edges land on top — a gray edge crossing an
  // orange one shouldn't bury the critical signal.
  const orderedEdges = [...layout.edges].sort(
    (a, b) => Number(Boolean(a.isCritical)) - Number(Boolean(b.isCritical)),
  );

  // Edge path = a single cubic Bézier with horizontal control handles (shared
  // geometry in `edge-path.js`), so the curve meets the vertical node edge at a
  // right angle and the marker-end arrow reads as perpendicular.
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
      return `<path d="${horizontalCubicEdgePath(sx, sy, tx, ty, curvature)}" class="${cls}" marker-end="${marker}"/>`;
    })
    .join('\n');

  const nodeSvg = layout.nodes
    .map((n) => {
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
        `<text class="text-secondary" x="${x + N_NODE_W - 8}" y="${y + N_NODE_H - 10}" text-anchor="end">${escXml(durLabel)}</text>`,
      ].join('\n');
    })
    .join('\n');

  const titleSvg = title
    ? `<text class="text-header" x="${N_PAD}" y="${N_PAD - 6}">${escXml(title)}</text>`
    : '';

  // Embed the shared theme CSS plus the activities-specific diagram CSS inside
  // the SVG so the rendered output is self-contained — the JCEF host page only
  // needs to drop the SVG into the DOM and styling resolves without any
  // cooperation from the host stylesheet. Matches what the VS Code path
  // produces via `prepareSvgForExport`.
  const embedCss = generateSvgEmbedCss('transitrix') + ACTIVITIES_DIAGRAM_CSS;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
  <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>
${titleSvg}
${nodeSvg}
${edgeSvg}
</svg>`;
}
