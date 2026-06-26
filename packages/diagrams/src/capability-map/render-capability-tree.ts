import type { CapabilityMapHeader } from './types.js';
import { layoutCapabilityTree, TREE_NODE_WIDTH, TREE_NODE_HEIGHT, TREE_NODE_SEP } from './layout-tree.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { escXml } from '../webview/render-util.js';

const PAD = 24;
const BTN_R = 8;
const LEGEND_H = 40;
const LABEL_MAX_CHARS = 28;
const LABEL_TRIM_CHARS = 26;

const BAND_LABELS = ['Levels 0–2', 'Levels 3–4', 'Levels 5+'] as const;

function depthBand(depth: number): 0 | 1 | 2 {
  if (depth <= 2) return 0;
  if (depth <= 4) return 1;
  return 2;
}

function truncate(s: string, max: number, trim: number): string {
  return s.length > max ? s.slice(0, trim) + '…' : s;
}

export interface RenderCapabilityTreeOptions {
  collapsedIds?: Set<string>;
  curvature?: number;
}

/**
 * Renders a capability-map as a left-to-right SVG node tree with DSM-matching
 * visual design: depth-banded fills, maturity badges, and +/− collapse buttons.
 *
 * The SVG uses CSS classes (`tree-level-N`, `tree-maturity-N`, `tree-collapse-btn`)
 * that must be resolved by the host's stylesheet (injected via `diagramClassCss()`
 * in themes.ts). Collapse buttons carry `data-node-id` / `data-collapsed` attributes
 * for the webview click handler.
 */
export function renderCapabilityTreeSvg(
  map: CapabilityMapHeader,
  opts: RenderCapabilityTreeOptions = {},
): string {
  const { collapsedIds = new Set(), curvature = DEFAULT_EDGE_CURVATURE } = opts;
  const layout = layoutCapabilityTree(map, collapsedIds);

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const ox = -layout.bounds.x + PAD;
  const oy = -layout.bounds.y + PAD;
  const svgW = layout.bounds.width + PAD * 2 + BTN_R;
  const svgH = layout.bounds.height + PAD * 2 + LEGEND_H + TREE_NODE_SEP;

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));

  const edgeSvg = layout.edges.map(e => {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    return `<path d="${horizontalCubicEdgePath(sx, sy, tx, ty, curvature)}" class="diagram-edge"/>`;
  }).filter(Boolean).join('\n');

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const band = depthBand(n.depth);
    const mat = Math.max(1, Math.min(5, n.data.current_maturity | 0));

    const nameText = truncate(n.data.name, LABEL_MAX_CHARS, LABEL_TRIM_CHARS);
    const nameTitle = n.data.name.length > LABEL_MAX_CHARS ? escXml(n.data.name) : '';

    // Maturity badge: left side of node
    const badgeW = 28;
    const badgeH = 18;
    const badgeX = x + 10;
    const badgeY = y + (TREE_NODE_HEIGHT - badgeH) / 2;

    // Text area: right of badge
    const textX = badgeX + badgeW + 8;
    const nameY = y + TREE_NODE_HEIGHT / 2 - 8;
    const idY = y + TREE_NODE_HEIGHT / 2 + 9;

    // Collapse button: centered on right edge of node
    const btnCx = x + TREE_NODE_WIDTH;
    const btnCy = y + TREE_NODE_HEIGHT / 2;

    const collapseBtn = n.hasChildren
      ? `<circle class="tree-collapse-btn" cx="${btnCx}" cy="${btnCy}" r="${BTN_R}" data-node-id="${escXml(n.id)}" data-collapsed="${n.isCollapsed}"/>
  <text class="tree-collapse-lbl" x="${btnCx}" y="${btnCy}" text-anchor="middle">${n.isCollapsed ? '+' : '−'}</text>`
      : '';

    return `<g${nameTitle ? ` title="${nameTitle}"` : ''}>
  <rect class="tree-level-${band}" x="${x}" y="${y}" width="${TREE_NODE_WIDTH}" height="${TREE_NODE_HEIGHT}" rx="11" stroke="var(--ts-node-stroke,#94a3b8)" stroke-width="3"/>
  <rect class="tree-maturity-${mat}" x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" rx="4"/>
  <text class="text-pill" x="${badgeX + badgeW / 2}" y="${badgeY + badgeH / 2}" text-anchor="middle" fill="white">L${mat}</text>
  <text class="text-primary" x="${textX}" y="${nameY}" dominant-baseline="central">${escXml(nameText)}</text>
  <text class="text-id" x="${textX}" y="${idY}" dominant-baseline="central">${escXml(n.id)}</text>
  ${collapseBtn}
</g>`;
  }).join('\n');

  // Legend band: proportional coloured blocks per level-count band
  const legendY = layout.bounds.height + PAD * 2 + TREE_NODE_SEP / 2;
  const legendW = svgW - PAD * 2;
  const totalNodes = layout.nodes.length || 1;
  const bandCounts = [layout.levelCounts.band0, layout.levelCounts.band1, layout.levelCounts.band2];
  let legendX = PAD;
  const legendSvg = bandCounts.map((count, i) => {
    const bw = Math.max(1, Math.round(legendW * count / totalNodes));
    const bx = legendX;
    legendX += bw;
    if (count === 0) return '';
    return `<rect class="tree-level-${i}" x="${bx}" y="${legendY}" width="${bw}" height="24" rx="4" stroke="var(--ts-node-stroke,#94a3b8)" stroke-width="1"/>
  <text class="text-id" x="${bx + bw / 2}" y="${legendY + 12}" text-anchor="middle" dominant-baseline="central">${escXml(BAND_LABELS[i])}</text>`;
  }).filter(Boolean).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">
<defs>
  <marker id="cap-tree-arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${edgeSvg}
${nodeSvg}
${legendSvg}
</svg>`;
}
