import type { CapabilityMapHeader } from './types.js';
import { layoutCapabilityTree, TREE_NODE_SEP } from './layout-tree.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { parseNodeSizePreset, resolveCapabilityMapNodeSize, type NodeSizePreset } from '../node-size-presets.js';
import { maxCharsForInnerWidth, truncateLine } from '../webview/entity-text-layout.js';
import { escXml } from '../webview/render-util.js';

const PAD = 24;
const BTN_R = 8;
const LEGEND_H = 40;

const BAND_LABELS = ['Levels 0–2', 'Levels 3–4', 'Levels 5+'] as const;

function depthBand(depth: number): 0 | 1 | 2 {
  if (depth <= 2) return 0;
  if (depth <= 4) return 1;
  return 2;
}

export interface RenderCapabilityTreeOptions {
  collapsedIds?: Set<string>;
  curvature?: number;
  nodeSizePreset?: NodeSizePreset;
}

export function renderCapabilityTreeSvg(
  map: CapabilityMapHeader,
  opts: RenderCapabilityTreeOptions = {},
): string {
  const { collapsedIds = new Set(), curvature = DEFAULT_EDGE_CURVATURE, nodeSizePreset = 'normal' } = opts;
  const nodeSize = resolveCapabilityMapNodeSize(parseNodeSizePreset(nodeSizePreset));
  const layout = layoutCapabilityTree(map, collapsedIds, nodeSize);

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

    const badgeW = 28;
    const badgeH = 18;
    const textAreaW = Math.max(0, n.width - badgeW - 26);
    const maxChars = maxCharsForInnerWidth(textAreaW, 7);
    const nameText = truncateLine(n.data.name, maxChars);
    const nameTitle = n.data.name.length > maxChars ? escXml(n.data.name) : '';

    const badgeX = x + 10;
    const badgeY = y + (n.height - badgeH) / 2;

    const textX = badgeX + badgeW + 8;
    const nameY = y + n.height / 2 - 8;
    const idY = y + n.height / 2 + 9;

    const btnCx = x + n.width;
    const btnCy = y + n.height / 2;

    const collapseBtn = n.hasChildren
      ? `<circle class="tree-collapse-btn" cx="${btnCx}" cy="${btnCy}" r="${BTN_R}" data-node-id="${escXml(n.id)}" data-collapsed="${n.isCollapsed}"/>
  <text class="tree-collapse-lbl" x="${btnCx}" y="${btnCy}" text-anchor="middle">${n.isCollapsed ? '+' : '−'}</text>`
      : '';

    return `<g${nameTitle ? ` title="${nameTitle}"` : ''}>
  <rect class="tree-level-${band}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="11" stroke="var(--ts-node-stroke,#94a3b8)" stroke-width="3"/>
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
