/**
 * Browser-safe SVG renderer for the canonical FGCA and FGA notations.
 *
 * Step 4 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated FGCA/FGA document into renderable SVG so JCEF can drop it into the
 * preview panel. The VS Code path lives in `extension/src/fgca-preview.ts` and
 * pulls in VS Code-specific concerns (themes, title block, save dialogs,
 * spacing/scope controls); this module is the host-neutral subset — pure
 * column layout → SVG with no VS Code APIs, no `node:fs`, no `node:path`.
 *
 * FGCA and FGA share the same renderer; FGA only differs by hiding the
 * `change` column (`hideChanges` / the layout's Goal → Activity collapse),
 * exactly as the extension preview does.
 */
import {
  layoutFGCAPreview,
  FGCA_NODE_W as NODE_W,
  FGCA_NODE_H as NODE_H,
  FGCA_HEADER_H as HEADER_H,
  FGCA_PAD as PAD,
  type FGCAPreviewColumn,
} from '../fgca/preview-layout.js';
import type { FGCADoc } from '../fgca/validate.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

const COL_LABELS: Record<FGCAPreviewColumn, string> = {
  driver: 'Drivers (D)',
  goal: 'Goals (G)',
  change: 'Changes (C)',
  activity: 'Actions (A)',
};

type FgcaLayout = ReturnType<typeof layoutFGCAPreview>;

/**
 * Canonical FGCA/FGA body — the column headers, node rects and edge paths that
 * go inside the `<svg>`, shared verbatim by the VS Code preview (`buildSvg`)
 * and the host-neutral wrapper below. Excludes the host-specific title block
 * and the (identical) `<defs>` arrow marker. Coordinates are absolute (the
 * layout's own); the VS Code path wraps this in a `translate(0, titleH)` group
 * to make room for its title block, while the host-neutral wrapper renders it
 * untranslated.
 */
export function renderFgcaBody(
  columns: FgcaLayout['columns'],
  nodes: FgcaLayout['nodes'],
  edges: FgcaLayout['edges'],
  curvature: number,
  entryCurvature: number | undefined,
): string {
  const headerSvg = columns
    .map(({ col, x }) =>
      [
        `<rect class="diagram-node layer-${col}" x="${x}" y="${PAD}" width="${NODE_W}" height="${HEADER_H}" rx="6"/>`,
        `<text class="text-header" x="${x + NODE_W / 2}" y="${PAD + HEADER_H / 2}" text-anchor="middle" dominant-baseline="central">${escXml(COL_LABELS[col])}</text>`,
      ].join('\n'),
    )
    .join('\n');

  const edgeSvg = edges
    .map(
      (e) =>
        `<path d="${horizontalCubicEdgePath(e.sx, e.sy, e.tx, e.ty, curvature, entryCurvature)}" class="diagram-edge" marker-end="url(#arrow)"/>`,
    )
    .join('\n');

  const nodeSvg = nodes
    .map((n) => {
      const words = n.label.split(' ');
      let line1 = '';
      let line2 = '';
      for (const w of words) {
        if ((line1 + ' ' + w).trim().length <= 26) {
          line1 = (line1 + ' ' + w).trim();
        } else if ((line2 + ' ' + w).trim().length <= 26) {
          line2 = (line2 + ' ' + w).trim();
        } else if (!line2) {
          line2 = w.slice(0, 24) + '…';
          break;
        }
      }
      const twoLines = line2.length > 0;
      const y1 = twoLines ? n.y + 16 : n.y + 26;
      const y2 = n.y + 32;
      const idY = twoLines ? n.y + 54 : n.y + 50;
      const entityId = n.id.slice(n.id.indexOf('_') + 1);
      return [
        `<rect class="diagram-node layer-${n.col}" x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>`,
        `<text class="text-primary" x="${n.x + NODE_W / 2}" y="${y1}" text-anchor="middle" dominant-baseline="central">${escXml(line1)}</text>`,
        twoLines
          ? `<text class="text-secondary" x="${n.x + NODE_W / 2}" y="${y2}" text-anchor="middle" dominant-baseline="central">${escXml(line2)}</text>`
          : '',
        `<text class="text-id" x="${n.x + NODE_W / 2}" y="${idY}" text-anchor="middle" dominant-baseline="central">${escXml(entityId)}</text>`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  return `${headerSvg}\n${nodeSvg}\n${edgeSvg}`;
}

export interface RenderFgcaOptions {
  /** `'fga'` hides the Changes column; defaults to `'fgca'`. */
  variant?: 'fgca' | 'fga';
  /** Optional heading rendered as a left-anchored `text-header` line. */
  title?: string;
  /** Exit edge curvature; 1 = default, 0 = straight, higher = stronger arc. */
  curvature?: number;
  /** Entry curvature at the target node; defaults to `curvature` when omitted. */
  entryCurvature?: number;
}

export function renderFgcaSvg(doc: FGCADoc, options: RenderFgcaOptions = {}): string {
  const { variant = 'fgca', title = '', curvature = DEFAULT_EDGE_CURVATURE, entryCurvature } = options;
  const hideChanges = variant === 'fga';

  const { nodes, edges, columns, width, height } = layoutFGCAPreview(doc, { hideChanges });

  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const body = renderFgcaBody(columns, nodes, edges, curvature, entryCurvature);

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(title)}</text>`
    : '';

  // Embed the shared theme CSS inside the SVG so the rendered output is
  // self-contained — the JCEF host page only needs to drop the SVG into the
  // DOM and styling resolves without any cooperation from the host stylesheet.
  const embedCss = generateSvgEmbedCss('transitrix');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<style>${embedCss}</style>
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
${body}
</svg>`;
}
