/**
 * Browser-safe SVG renderer for the Nested Blocks notation.
 *
 * Step 4 of the IntelliJ epic (ADR 0001): the webview bundle must turn a
 * validated BlocksFile into renderable SVG so JCEF can drop it into the
 * preview panel. The VS Code path lives in `extension/src/blocks-preview.ts`
 * and pulls in VS Code-specific concerns (themes, title block, save dialogs);
 * this module is the host-neutral subset — pure `layoutNestedBlocks` → SVG
 * with no VS Code APIs, no `node:*`, and no svgbob subprocess.
 *
 * Follows the same shape as `render-goals.ts`: a self-contained `<svg>` with
 * the shared theme CSS embedded in a `<style>` element and a simple optional
 * title `<text>`.
 */
import { layoutNestedBlocks, layoutGrid } from '../blocks/layout.js';
import type {
  BlocksFile,
  BlocksLayout,
  BlocksLayoutOptions,
  GridFile,
  GridLayout,
  GridLayoutOptions,
  LaidOutBlock,
} from '../blocks/types.js';
import { parseNodeSizePreset, resolveBlocksLeafSize, type NodeSizePreset } from '../node-size-presets.js';
import { generateSvgEmbedCss, type ThemeId } from '../theme/index.js';
import {
  CHAR_W_PRIMARY,
  emitCenteredTextSvg,
  layoutHeaderBlockText,
  layoutLeafBlockText,
  maxCharsForInnerWidth,
  wrapWords,
} from './entity-text-layout.js';
import { escXml } from './render-util.js';
import { ENTITY_NODE_RX } from './notation-style.js';

const PAD = 24;

export interface RenderBlocksOptions {
  title?: string;
  nodeSizePreset?: NodeSizePreset;
  layoutOptions?: BlocksLayoutOptions;
}

/**
 * Pick the diagram-frame level class for a block at the given depth.
 *
 * `level-0` is the lightest fill in the brand colour ramp; deeper levels are
 * progressively darker. The methodology spec mandates "outermost lightest"
 * (08-blocks.md §7), so depth 1 (top-level) maps to `level-0`. The theme CSS
 * defines `level-0` … `level-6`; deeper blocks reuse `level-6`.
 */
function levelClassForDepth(depth: number): string {
  const idx = Math.min(Math.max(depth - 1, 0), 6);
  return `level-${idx}`;
}

function emitBlockSvg(b: LaidOutBlock, ox: number, oy: number, parts: string[]): void {
  const cls = levelClassForDepth(b.depth);
  const cx = b.x + ox + b.width / 2;
  parts.push(
    `<rect class="diagram-node ${cls}" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="${ENTITY_NODE_RX}"/>`,
  );

  const isLeaf = b.children.length === 0;
  if (isLeaf) {
    const specs = layoutLeafBlockText({
      boxX: b.x + ox,
      boxY: b.y + oy,
      boxWidth: b.width,
      boxHeight: b.height,
      name: b.name,
      id: b.id,
    });
    parts.push(emitCenteredTextSvg(specs, cx, escXml));
  } else {
    const specs = layoutHeaderBlockText({
      boxX: b.x + ox,
      boxY: b.y + oy,
      boxWidth: b.width,
      headerHeight: b.headerHeight,
      name: b.name,
      id: b.id,
    });
    parts.push(emitCenteredTextSvg(specs, cx, escXml));
    for (const c of b.children) emitBlockSvg(c, ox, oy, parts);
  }
}

export interface RenderBlocksLayoutOptions {
  /** Extra vertical space reserved at the top of the canvas (e.g. for a title block). */
  topInset?: number;
  /** Raw SVG injected immediately after the opening tag — a header line or a full title block. */
  title?: string;
  /** When set, the theme CSS is embedded as `<style>` so the SVG is self-contained. */
  embedCssTheme?: ThemeId;
}

/**
 * The single Nested Blocks SVG emitter shared by every host. Takes an
 * already-computed {@link BlocksLayout} (callers decide the layout options) and
 * produces the `<svg>`. Hosts wrap it with their own chrome:
 *   - IntelliJ/UI via {@link renderBlocksSvg} (embedded CSS + simple header);
 *   - VS Code's blocks preview (rich title block, no embedded CSS — the webview
 *     and the export path own styling).
 */
export function renderBlocksLayoutSvg(
  layout: BlocksLayout,
  options: RenderBlocksLayoutOptions = {},
): string {
  const { topInset = 0, title = '', embedCssTheme } = options;

  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + topInset;
  const ox = -layout.bounds.x + PAD;
  const oy = -layout.bounds.y + PAD + topInset;

  const parts: string[] = [];
  for (const top of layout.blocks) emitBlockSvg(top, ox, oy, parts);

  const styleLine = embedCssTheme ? `\n<style>${generateSvgEmbedCss(embedCssTheme)}</style>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${styleLine}
${title}
${parts.join('\n')}
</svg>`;
}

/**
 * Host-neutral blocks renderer (IntelliJ/UI). Lays the doc out with the default
 * spacing, then delegates the actual SVG emission to {@link renderBlocksLayoutSvg}
 * with the shared theme CSS embedded so the output is self-contained.
 */
export function renderBlocksSvg(doc: BlocksFile, options: RenderBlocksOptions = {}): string {
  const { title = '', nodeSizePreset = 'normal', layoutOptions } = options;
  const leaf = resolveBlocksLeafSize(parseNodeSizePreset(nodeSizePreset));

  const layout: BlocksLayout = layoutNestedBlocks(doc, {
    leafWidth: leaf.width,
    leafHeight: leaf.height,
    ...layoutOptions,
  });

  if (layout.blocks.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Nested Blocks — ${title}`)}</text>`
    : '';

  return renderBlocksLayoutSvg(layout, { title: titleSvg, embedCssTheme: 'transitrix' });
}

/**
 * Matrix subset (08-blocks.md §4a) — first cut: a single-layer rectangular
 * `grid:` document (the RACI-style matrix case) rendered as a plain
 * HTML/CSS-table-like SVG grid. Layers, arbitrary
 * (non-rectangular) cell sets, and nested sub-grids belong to the general
 * layered-grid superset, which is still in design upstream (methodology) and
 * out of scope here — see 08-blocks.md §4a / §8.
 */
const GRID_CELL_PAD_X = 8;
const GRID_LINE_HEIGHT = 15;
const GRID_EMBED_CSS = `
.blocks-grid-border { fill: none; stroke: var(--ts-border, #cbd5e1); }`;

function centeredGridCellTextSvg(
  lines: string[],
  cls: string,
  cx: number,
  cellTop: number,
  cellHeight: number,
): string {
  const ls = lines.length > 0 ? lines : [''];
  const firstY = cellTop + cellHeight / 2 - ((ls.length - 1) / 2) * GRID_LINE_HEIGHT;
  const tspans = ls
    .map((ln, i) => `<tspan x="${cx}" y="${firstY + i * GRID_LINE_HEIGHT}">${escXml(ln)}</tspan>`)
    .join('');
  return `<text class="${cls}" text-anchor="middle" dominant-baseline="central">${tspans}</text>`;
}

/**
 * Emit the grid body (headers, cells, grid lines) at the given origin offset.
 * Shared by the host-neutral wrapper below; VS Code's blocks preview wraps
 * this the same way it wraps {@link renderBlocksLayoutSvg} for the tree form.
 */
export function renderGridBody(layout: GridLayout, ox: number, oy: number): string {
  const tw = layout.bounds.width;
  const th = layout.bounds.height;
  const parts: string[] = [];

  parts.push(`<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${tw}" height="${th}" stroke="none"/>`);

  // Corner cell (above the row headers, left of the column headers).
  parts.push(
    `<rect class="diagram-node level-1" x="${ox}" y="${oy}" width="${layout.rowHeaderWidth}" height="${layout.headerHeight}" stroke="none"/>`,
  );

  for (const col of layout.columns) {
    const x = col.x + ox;
    parts.push(
      `<rect class="diagram-node level-1" x="${x}" y="${oy}" width="${col.width}" height="${layout.headerHeight}" stroke="none"/>`,
    );
    const maxChars = maxCharsForInnerWidth(col.width - GRID_CELL_PAD_X * 2, CHAR_W_PRIMARY);
    const lines = wrapWords(col.name, maxChars, 2);
    parts.push(centeredGridCellTextSvg(lines, 'text-header', x + col.width / 2, oy, layout.headerHeight));
  }

  for (const row of layout.rows) {
    const y = row.y + oy;
    parts.push(
      `<rect class="diagram-node level-2" x="${ox}" y="${y}" width="${layout.rowHeaderWidth}" height="${row.height}" stroke="none"/>`,
    );
    const maxChars = maxCharsForInnerWidth(layout.rowHeaderWidth - GRID_CELL_PAD_X * 2, CHAR_W_PRIMARY);
    const lines = wrapWords(row.name, maxChars, 2);
    parts.push(centeredGridCellTextSvg(lines, 'text-primary', ox + layout.rowHeaderWidth / 2, y, row.height));
  }

  for (const cell of layout.cells) {
    if (cell.value === undefined) continue;
    const cx = cell.x + ox + cell.width / 2;
    const cy = cell.y + oy + cell.height / 2;
    parts.push(
      `<text class="text-secondary" x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central">${escXml(cell.value)}</text>`,
    );
  }

  const gridX1 = ox;
  const gridX2 = ox + tw;
  const gridY1 = oy;
  const gridY2 = oy + th;

  const headerBottomY = oy + layout.headerHeight;
  parts.push(`<line class="diagram-edge" x1="${gridX1}" y1="${headerBottomY}" x2="${gridX2}" y2="${headerBottomY}"/>`);
  for (const row of layout.rows) {
    const rowBottomY = oy + row.y + row.height;
    parts.push(`<line class="diagram-edge" x1="${gridX1}" y1="${rowBottomY}" x2="${gridX2}" y2="${rowBottomY}"/>`);
  }

  const rowHeaderLineX = ox + layout.rowHeaderWidth;
  parts.push(`<line class="diagram-edge" x1="${rowHeaderLineX}" y1="${gridY1}" x2="${rowHeaderLineX}" y2="${gridY2}"/>`);
  for (const col of layout.columns) {
    const colLineX = ox + col.x + col.width;
    parts.push(`<line class="diagram-edge" x1="${colLineX}" y1="${gridY1}" x2="${colLineX}" y2="${gridY2}"/>`);
  }

  parts.push(`<rect class="blocks-grid-border" x="${ox}" y="${oy}" width="${tw}" height="${th}"/>`);

  return parts.join('\n');
}

export interface RenderGridLayoutOptions {
  /** Extra vertical space reserved at the top of the canvas (e.g. for a title block). */
  topInset?: number;
  /** Raw SVG injected immediately after the opening tag — a header line or a full title block. */
  title?: string;
  /** When set, the theme CSS is embedded as `<style>` so the SVG is self-contained. */
  embedCssTheme?: ThemeId;
}

/** The single grid (matrix subset) SVG emitter shared by every host. */
export function renderGridLayoutSvg(layout: GridLayout, options: RenderGridLayoutOptions = {}): string {
  const { topInset = 0, title = '', embedCssTheme } = options;

  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + topInset;
  const ox = PAD;
  const oy = PAD + topInset;

  const body = renderGridBody(layout, ox, oy);
  const styleLine = embedCssTheme ? `\n<style>${generateSvgEmbedCss(embedCssTheme)}${GRID_EMBED_CSS}</style>` : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${styleLine}
${title}
${body}
</svg>`;
}

export interface RenderGridOptions {
  title?: string;
  layoutOptions?: GridLayoutOptions;
}

/** Host-neutral grid (matrix subset) renderer (IntelliJ/UI). */
export function renderGridSvg(doc: GridFile, options: RenderGridOptions = {}): string {
  const { title = '', layoutOptions } = options;
  const layout = layoutGrid(doc, layoutOptions);

  if (layout.columns.length === 0 || layout.rows.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Nested Blocks — ${title}`)}</text>`
    : '';

  return renderGridLayoutSvg(layout, { title: titleSvg, embedCssTheme: 'transitrix' });
}
