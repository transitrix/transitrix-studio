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
import { generateSvgEmbedCss, type ThemeId } from '../theme/index.js';
import { escXml } from './render-util.js';

const NODE_W = 250;
const NODE_H = 72;
const RANK_SEP = 100;
const NODE_SEP = 24;
const PAD = 24;
const LABEL_CHARS = 30;

export interface RenderGoalsOptions {
  treeName?: string;
  curvature?: number;
  entryCurvature?: number;
}

/**
 * Host-neutral goals renderer (IntelliJ/UI). Lays the tree out with the default
 * spacing, then delegates the actual SVG emission to {@link renderGoalsLayoutSvg}
 * with the shared theme CSS embedded so the output is self-contained.
 */
export function renderGoalsSvg(tree: GoalTree, options: RenderGoalsOptions = {}): string {
  const { treeName = '', curvature = DEFAULT_EDGE_CURVATURE, entryCurvature } = options;

  const layout: GoalTreeLayout = layoutGoalTree(tree, {
    nodeWidth: NODE_W,
    nodeHeight: NODE_H,
    rankSep: RANK_SEP,
    nodeSep: NODE_SEP,
  });

  if (layout.nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const title = treeName
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Goal tree — ${treeName}`)}</text>`
    : '';

  // Embed the shared theme CSS so the JCEF host page only needs to drop the SVG
  // into the DOM — styling resolves without help from the host stylesheet. The
  // VS Code preview omits this (its webview supplies the CSS) and embeds it only
  // on export via `prepareSvgForExport`.
  return renderGoalsLayoutSvg(layout, { curvature, entryCurvature, title, embedCssTheme: 'transitrix' });
}

export interface RenderGoalsLayoutOptions {
  curvature?: number;
  entryCurvature?: number;
  /** Extra vertical space reserved at the top of the canvas (e.g. for a title block). */
  topInset?: number;
  /** Raw SVG injected immediately after `<defs>` — a header line or a full title block. */
  title?: string;
  /** When set, the theme CSS is embedded as `<style>` so the SVG is self-contained. */
  embedCssTheme?: ThemeId;
}

/**
 * The single goals SVG emitter shared by every host. Takes an already-computed
 * {@link GoalTreeLayout} (callers decide spacing/scope) and produces the `<svg>`.
 * Hosts wrap it with their own chrome:
 *   - IntelliJ/UI via {@link renderGoalsSvg} (embedded CSS + simple header);
 *   - VS Code's goals preview (rich title block, no embedded CSS — the webview
 *     and the export path own styling).
 */
export function renderGoalsLayoutSvg(layout: GoalTreeLayout, options: RenderGoalsLayoutOptions = {}): string {
  const { curvature = DEFAULT_EDGE_CURVATURE, entryCurvature, topInset = 0, title = '', embedCssTheme } = options;

  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + topInset;
  const ox = -layout.bounds.x + PAD;
  const oy = -layout.bounds.y + PAD + topInset;

  const nodeMap = new Map(layout.nodes.map((n) => [n.id, n]));

  function edgePath(e: LaidOutEdge): string {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    return horizontalCubicEdgePath(sx, sy, tx, ty, curvature, entryCurvature);
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
      const words = labelText.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= LABEL_CHARS) {
          line1 = (line1 + ' ' + w).trim();
        } else if ((line2 + ' ' + w).trim().length <= LABEL_CHARS) {
          line2 = (line2 + ' ' + w).trim();
        } else if (!line2) {
          line2 = w.slice(0, LABEL_CHARS - 2) + '…';
          break;
        }
      }
      const twoLines = line2.length > 0;
      const nameY1 = twoLines ? y + 12 : y + 16;
      const nameY2 = y + 26;
      const typeY = twoLines ? y + 43 : y + 35;
      const idY = twoLines ? y + 59 : y + 55;
      const typeLabel = n.data.type ?? '';
      const idText = String(n.data.id);
      return `<g>
  <rect class="diagram-node level-${level}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>
  <text class="text-primary" x="${x + n.width / 2}" y="${nameY1}" text-anchor="middle" dominant-baseline="central">${escXml(line1)}</text>${twoLines ? `
  <text class="text-primary" x="${x + n.width / 2}" y="${nameY2}" text-anchor="middle" dominant-baseline="central">${escXml(line2)}</text>` : ''}${typeLabel ? `
  <text class="text-secondary" x="${x + n.width / 2}" y="${typeY}" text-anchor="middle" dominant-baseline="central">${escXml(typeLabel)}</text>` : ''}
  <text class="text-id" x="${x + n.width / 2}" y="${idY}" text-anchor="middle" dominant-baseline="central">${escXml(idText)}</text>
</g>`;
    })
    .join('\n');

  const styleLine = embedCssTheme ? `\n<style>${generateSvgEmbedCss(embedCssTheme)}</style>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${styleLine}
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${title}
${nodeSvg}
${edgeSvg}
</svg>`;
}
