/**
 * Browser-safe SVG renderer for the canonical DGCA and DGA notations.
 *
 * Step 4 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated DGCA/DGA document into renderable SVG so JCEF can drop it into the
 * preview panel. The VS Code path lives in `extension/src/dgca-preview.ts` and
 * pulls in VS Code-specific concerns (themes, title block, save dialogs,
 * spacing/scope controls); this module is the host-neutral subset — pure
 * column layout → SVG with no VS Code APIs, no `node:fs`, no `node:path`.
 *
 * DGCA and DGA share the same renderer; DGA only differs by hiding the
 * `change` column (`hideChanges` / the layout's Goal → Activity collapse),
 * exactly as the extension preview does.
 */
import {
  layoutFGCAPreview,
  FGCA_NODE_W,
  FGCA_NODE_H,
  FGCA_HEADER_H as HEADER_H,
  FGCA_PAD as PAD,
  type FGCAPreviewColumn,
} from '../fgca/preview-layout.js';
import type { FGCADoc } from '../fgca/validate.js';
import { horizontalCubicEdgePath, DEFAULT_EDGE_CURVATURE } from '../edge-path.js';
import { parseNodeSizePreset, resolveDgcaNodeSize, type NodeSizePreset } from '../node-size-presets.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { emitCenteredTextSvg, layoutCenteredEntityText, truncateLine } from './entity-text-layout.js';
import { escXml } from './render-util.js';

const COL_LABELS: Record<FGCAPreviewColumn, string> = {
  driver: 'Drivers (D)',
  goal: 'Goals (G)',
  change: 'Changes (C)',
  activity: 'Actions (A)',
};

type FgcaLayout = ReturnType<typeof layoutFGCAPreview>;

export interface RenderFgcaBodyOptions {
  nodeWidth?: number;
  nodeHeight?: number;
}

/**
 * Canonical DGCA/DGA body — the column headers, node rects and edge paths that
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
  bodyOptions: RenderFgcaBodyOptions = {},
): string {
  const nodeWidth = bodyOptions.nodeWidth ?? FGCA_NODE_W;
  const nodeHeight = bodyOptions.nodeHeight ?? FGCA_NODE_H;
  const headerTruncate = Math.max(8, Math.floor((nodeWidth - 16) / 7));

  const headerSvg = columns
    .map(({ col, x }) =>
      [
        `<rect class="diagram-node layer-${col}" x="${x}" y="${PAD}" width="${nodeWidth}" height="${HEADER_H}" rx="6"/>`,
        `<text class="text-header" x="${x + nodeWidth / 2}" y="${PAD + HEADER_H / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncateLine(COL_LABELS[col], headerTruncate))}</text>`,
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
      const entityId = n.id.slice(n.id.indexOf('_') + 1);
      const specs = layoutCenteredEntityText({
        boxX: n.x,
        boxY: n.y,
        boxWidth: nodeWidth,
        boxHeight: nodeHeight,
        name: n.label,
        id: entityId,
        nameMaxLines: 2,
        idMaxLines: 1,
      });
      const textSvg = emitCenteredTextSvg(specs, n.x + nodeWidth / 2, escXml);
      return [
        `<rect class="diagram-node layer-${n.col}" x="${n.x}" y="${n.y}" width="${nodeWidth}" height="${nodeHeight}" rx="8"/>`,
        textSvg,
      ].join('\n');
    })
    .join('\n');

  return `${headerSvg}\n${nodeSvg}\n${edgeSvg}`;
}

export interface RenderFgcaOptions {
  /** `'dga'` hides the Changes column; defaults to `'dgca'`. */
  variant?: 'dgca' | 'dga';
  /** Optional heading rendered as a left-anchored `text-header` line. */
  title?: string;
  /** Exit edge curvature; 1 = default, 0 = straight, higher = stronger arc. */
  curvature?: number;
  /** Entry curvature at the target node; defaults to `curvature` when omitted. */
  entryCurvature?: number;
  nodeSizePreset?: NodeSizePreset;
  layoutOptions?: Parameters<typeof layoutFGCAPreview>[1];
}

export function renderFgcaSvg(doc: FGCADoc, options: RenderFgcaOptions = {}): string {
  const {
    variant = 'dgca',
    title = '',
    curvature = DEFAULT_EDGE_CURVATURE,
    entryCurvature,
    nodeSizePreset = 'normal',
    layoutOptions,
  } = options;
  const hideChanges = variant === 'dga';
  const nodeSize = resolveDgcaNodeSize(parseNodeSizePreset(nodeSizePreset));

  const { nodes, edges, columns, width, height } = layoutFGCAPreview(doc, {
    hideChanges,
    nodeWidth: nodeSize.width,
    nodeHeight: nodeSize.height,
    ...layoutOptions,
  });

  if (nodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const body = renderFgcaBody(columns, nodes, edges, curvature, entryCurvature, {
    nodeWidth: nodeSize.width,
    nodeHeight: nodeSize.height,
  });

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(title)}</text>`
    : '';

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
