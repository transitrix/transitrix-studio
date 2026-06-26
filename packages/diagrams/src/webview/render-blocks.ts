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
// Approximate character width (px) at text-id size (10px/600).
const CHAR_W_ID = 6;

// Vertical spacing between line centres.
const LINE_H = 14;    // name lines (text-primary)
const LINE_H_ID = 12; // id lines (text-id)
const NAME_ID_GAP = 6; // gap between last name centre and first ID centre

/** Word-wrap `text` to at most `maxLines` lines of `maxChars` each. */
function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
      if (lines.length === maxLines - 1) {
        const rest = words.slice(i).join(' ');
        lines.push(rest.length <= maxChars ? rest : rest.slice(0, maxChars - 1) + '…');
        return lines;
      }
      cur = w.length <= maxChars ? w : w.slice(0, maxChars - 1) + '…';
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [text.slice(0, maxChars - 1) + '…'];
}

/** Split an ID (no spaces) across at most 2 lines, breaking at `_` or `-`. */
function wrapId(id: string, maxChars: number): string[] {
  if (id.length <= maxChars) return [id];
  const seg = id.slice(0, maxChars);
  const sepIdx = Math.max(seg.lastIndexOf('_'), seg.lastIndexOf('-'));
  const cut = sepIdx > Math.floor(maxChars / 3) ? sepIdx : maxChars - 1;
  const isSep = id[cut] === '_' || id[cut] === '-';
  const line1 = id.slice(0, cut);
  const rest = id.slice(cut + (isSep ? 1 : 0));
  return [line1, rest.length <= maxChars ? rest : rest.slice(0, maxChars - 1) + '…'];
}

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
    // Leaf block: name (up to 3 lines) then ID (up to 2 lines), centred vertically.
    const maxCharsName = Math.max(4, Math.floor(b.width / CHAR_W));
    const maxCharsId = Math.max(4, Math.floor(b.width / CHAR_W_ID));
    const nameLines = wrapWords(b.name, maxCharsName, 3);
    const idLines = wrapId(b.id, maxCharsId);
    const nameTotalSpan = (nameLines.length - 1) * LINE_H;
    const idTotalSpan = (idLines.length - 1) * LINE_H_ID;
    const totalSpan = nameTotalSpan + NAME_ID_GAP + idTotalSpan;
    const firstY = Math.round(b.y + oy + (b.height - totalSpan) / 2);
    for (let i = 0; i < nameLines.length; i++) {
      parts.push(
        `<text class="text-primary" x="${cx}" y="${firstY + i * LINE_H}" text-anchor="middle" dominant-baseline="central">${escXml(nameLines[i])}</text>`,
      );
    }
    const idFirstY = firstY + nameTotalSpan + NAME_ID_GAP;
    for (let i = 0; i < idLines.length; i++) {
      parts.push(
        `<text class="text-id" x="${cx}" y="${idFirstY + i * LINE_H_ID}" text-anchor="middle" dominant-baseline="central">${escXml(idLines[i])}</text>`,
      );
    }
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
