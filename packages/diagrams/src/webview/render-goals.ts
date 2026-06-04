/**
 * Browser-safe SVG renderer for the canonical Goals notation.
 *
 * Step 3 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated GoalTree into renderable SVG so JCEF can drop it into the preview
 * panel. The VS Code path lives in `extension/src/goals-preview.ts` and pulls
 * in VS Code-specific concerns (themes, title block, save dialogs); this
 * module is the host-neutral subset — pure layout → SVG with no VS Code APIs,
 * no `node:fs`, no `node:path`.
 *
 * Step 4 will follow the same shape for the remaining ten notations.
 */
import { layoutGoalTree } from '../goals/layout.js';
import type { GoalTree, GoalTreeLayout, LaidOutEdge } from '../goals/types.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { generateSvgEmbedCss } from '../theme/index.js';

const NODE_W = 250;
const NODE_H = 60;
const RANK_SEP = 100;
const NODE_SEP = 24;
const PAD = 24;
const LABEL_MAX = 36;
const LABEL_TRIM = 34;

function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface RenderGoalsOptions {
  treeName?: string;
  curvature?: number;
}

export function renderGoalsSvg(tree: GoalTree, options: RenderGoalsOptions = {}): string {
  const { treeName = '', curvature = DEFAULT_EDGE_CURVATURE } = options;

  const layout: GoalTreeLayout = layoutGoalTree(tree, {
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
    rankSep: RANK_SEP,
    nodeSep: NODE_SEP,
  });

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2;
  const ox = -layout.bounds.x + PAD;
  const oy = -layout.bounds.y + PAD;

  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  function edgePath(e: LaidOutEdge): string {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    return horizontalCubicEdgePath(sx, sy, tx, ty, curvature);
  }

  const edgeSvg = layout.edges
    .map((e) => `<path d="${edgePath(e)}" class="diagram-edge" marker-end="url(#arrow)"/>`)
    .join('\n');

  const nodeSvg = layout.nodes
    .map((n) => {
      const x = n.x + ox;
      const y = n.y + oy;
      const level = n.data.level % 8;
      const labelText = n.data.name ?? String(n.id);
      const label = labelText.length > LABEL_MAX ? labelText.slice(0, LABEL_TRIM) + '…' : labelText;
      return `<g>
  <rect class="diagram-node level-${level}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>
  <text class="text-primary" x="${x + n.width / 2}" y="${y + n.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(label)}</text>
</g>`;
    })
    .join('\n');

  const titleSvg = treeName
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Goal tree — ${treeName}`)}</text>`
    : '';

  // Embed the shared theme CSS inside the SVG so the rendered output is
  // self-contained — the JCEF host page only needs to drop the SVG into the
  // DOM and styling resolves without any cooperation from the host stylesheet.
  // Matches what the VS Code path produces via `prepareSvgForExport`.
  const embedCss = generateSvgEmbedCss('transitrix');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
${nodeSvg}
${edgeSvg}
</svg>`;
}
