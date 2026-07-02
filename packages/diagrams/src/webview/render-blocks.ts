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
import { ENTITY_NODE_RX } from './notation-style.js';

const PAD = 24;

// Approximate character width (px) at text-primary size (12px/600).
const CHAR_W = 7;
// Approximate character width (px) at text-id size (10px/600).
const CHAR_W_ID = 6;

// Vertical spacing between line centres.
const LINE_H = 14;     // name lines (text-primary, 12 px font)
const LINE_H_ID = 12;  // id lines (text-id, 10 px font)
// Minimum gap to avoid overlap: half of name text height (6 px) + half of id
// text height (5 px) = 11 px. Use 14 px to match the name-line separation and
// leave a 3 px visual buffer — same as the gap between consecutive name lines.
const NAME_ID_GAP = 14;

/** Word-wrap `text` to at most `maxLines` lines of `maxChars` each. */
function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
  const safeMax = Math.max(2, maxChars);
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= safeMax) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = '';
      if (lines.length >= maxLines) break;
      if (lines.length === maxLines - 1) {
        const rest = words.slice(i).join(' ');
        lines.push(rest.length <= safeMax ? rest : rest.slice(0, safeMax - 1) + '…');
        return lines;
      }
      cur = w.length <= safeMax ? w : w.slice(0, safeMax - 1) + '…';
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [text.slice(0, safeMax - 1) + '…'];
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

// Reserve a small horizontal margin so text never abuts the rounded corners.
const TEXT_MARGIN_X = 8;

/** Truncate `text` to at most `maxChars` characters, at a word boundary when possible. */
function truncateLine(text: string, maxChars: number): string {
  const safeMax = Math.max(2, maxChars);
  if (text.length <= safeMax) return text;
  const cut = text.slice(0, safeMax - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > safeMax / 2 ? cut.slice(0, lastSpace) : cut) + '…';
}

/** Single-line ID truncation that prefers `_`/`-` separators before falling back to a hard cut. */
function truncateId(id: string, maxChars: number): string {
  const safeMax = Math.max(2, maxChars);
  if (id.length <= safeMax) return id;
  const cut = id.slice(0, safeMax - 1);
  const sepIdx = Math.max(cut.lastIndexOf('_'), cut.lastIndexOf('-'));
  return (sepIdx > safeMax / 3 ? cut.slice(0, sepIdx) : cut) + '…';
}

function emitBlockSvg(b: LaidOutBlock, ox: number, oy: number, parts: string[]): void {
  const cls = levelClassForDepth(b.depth);
  const cx = b.x + ox + b.width / 2;
  parts.push(
    `<rect class="diagram-node ${cls}" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="${ENTITY_NODE_RX}"/>`,
  );

  const innerW = Math.max(0, b.width - TEXT_MARGIN_X * 2);
  const isLeaf = b.children.length === 0;
  if (isLeaf) {
    // Leaf block: name (up to 3 lines) then ID (up to 2 lines), centred vertically.
    const maxCharsName = Math.max(4, Math.floor(innerW / CHAR_W));
    const maxCharsId = Math.max(4, Math.floor(innerW / CHAR_W_ID));
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
    // Container block: name (text-primary) above, ID (text-id, grey) below — both
    // single-line, truncated with `…` to fit within `b.width`. The header strip is
    // only `headerHeight` tall (default 28px), which is enough for one line each at
    // the configured text sizes. Stacking the ID as its own text-id element keeps
    // the wrapping/truncation rule consistent with leaves and guarantees no overflow
    // for any combination of name/ID length.
    const maxCharsName = Math.max(4, Math.floor(innerW / CHAR_W));
    const maxCharsId = Math.max(4, Math.floor(innerW / CHAR_W_ID));
    const nameText = truncateLine(b.name, maxCharsName);
    const idText = truncateId(b.id, maxCharsId);
    const headerMid = b.y + oy + b.headerHeight / 2;
    const halfSpan = (LINE_H + LINE_H_ID) / 4;
    const nameY = Math.round(headerMid - halfSpan);
    const idY = Math.round(headerMid + halfSpan);
    parts.push(
      `<text class="text-primary" x="${cx}" y="${nameY}" text-anchor="middle" dominant-baseline="central">${escXml(nameText)}</text>`,
    );
    parts.push(
      `<text class="text-id" x="${cx}" y="${idY}" text-anchor="middle" dominant-baseline="central">${escXml(idText)}</text>`,
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
