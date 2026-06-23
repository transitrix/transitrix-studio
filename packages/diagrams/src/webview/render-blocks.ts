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
import { layoutNestedBlocks } from '../blocks/layout.js';
import type { BlocksFile, BlocksLayout, LaidOutBlock } from '../blocks/types.js';
import { generateSvgEmbedCss, type ThemeId } from '../theme/index.js';
import { escXml } from './render-util.js';

const PAD = 24;

// Approximate character width (px) at text-primary size (12px/600).
const CHAR_W = 7;
// Approximate character width (px) at text-id size (10px/600) — used for ID suffix.
const CHAR_W_ID = 6;

export interface RenderBlocksOptions {
  title?: string;
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

/** Truncate at a word boundary so labels never break in the middle of a word. */
function wordTruncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut) + '…';
}

function emitBlockSvg(b: LaidOutBlock, ox: number, oy: number, parts: string[]): void {
  const cls = levelClassForDepth(b.depth);
  const cx = b.x + ox + b.width / 2;
  parts.push(
    `<rect class="diagram-node ${cls}" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="6"/>`,
  );

  const isLeaf = b.children.length === 0;
  if (isLeaf) {
    // Leaf block: name on upper line, ID on lower line — both centred.
    const nameY = b.y + oy + Math.round(b.height * 0.38);
    const idY = b.y + oy + Math.round(b.height * 0.66);
    const maxChars = Math.max(4, Math.floor(b.width / CHAR_W));
    parts.push(
      `<text class="text-primary" x="${cx}" y="${nameY}" text-anchor="middle" dominant-baseline="central">${escXml(wordTruncate(b.name, maxChars))}</text>`,
      `<text class="text-id" x="${cx}" y="${idY}" text-anchor="middle" dominant-baseline="central">${escXml(b.id)}</text>`,
    );
  } else {
    // Container block: name + (ID) on the single header line; ID in grey.
    const headerY = b.y + oy + b.headerHeight / 2;
    const idSuffix = ` (${b.id})`;
    const idSuffixW = idSuffix.length * CHAR_W_ID;
    const nameMaxChars = Math.max(4, Math.floor((b.width - idSuffixW) / CHAR_W));
    const nameText = wordTruncate(b.name, nameMaxChars);
    parts.push(
      `<text class="text-primary" x="${cx}" y="${headerY}" text-anchor="middle" dominant-baseline="central">${escXml(nameText)}<tspan fill="var(--ts-text-secondary, #64748b)" font-size="10" font-weight="600">${escXml(idSuffix)}</tspan></text>`,
    );
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
  const { title = '' } = options;

  const layout: BlocksLayout = layoutNestedBlocks(doc);

  if (layout.blocks.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Nested Blocks — ${title}`)}</text>`
    : '';

  return renderBlocksLayoutSvg(layout, { title: titleSvg, embedCssTheme: 'transitrix' });
}
