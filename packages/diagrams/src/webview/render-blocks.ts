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
import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

const PAD = 24;

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

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

function emitBlockSvg(b: LaidOutBlock, ox: number, oy: number, parts: string[]): void {
  const cls = levelClassForDepth(b.depth);
  parts.push(
    `<rect class="diagram-node ${cls}" x="${b.x + ox}" y="${b.y + oy}" width="${b.width}" height="${b.height}" rx="6"/>`,
  );

  // Header label, centred horizontally within the block's header strip.
  const headerY = b.y + oy + b.headerHeight / 2;
  const maxChars = Math.max(4, Math.floor(b.width / 8));
  parts.push(
    `<text class="text-header" x="${b.x + ox + b.width / 2}" y="${headerY}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(b.name, maxChars))}</text>`,
  );

  for (const c of b.children) emitBlockSvg(c, ox, oy, parts);
}

export function renderBlocksSvg(doc: BlocksFile, options: RenderBlocksOptions = {}): string {
  const { title = '' } = options;

  const layout: BlocksLayout = layoutNestedBlocks(doc);

  if (layout.blocks.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2;
  const ox = -layout.bounds.x + PAD;
  const oy = -layout.bounds.y + PAD;

  const parts: string[] = [];
  for (const top of layout.blocks) emitBlockSvg(top, ox, oy, parts);

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(`Nested Blocks — ${title}`)}</text>`
    : '';

  // Embed the shared theme CSS inside the SVG so the rendered output is
  // self-contained — the JCEF host page only needs to drop the SVG into the
  // DOM and styling resolves without any cooperation from the host stylesheet.
  const embedCss = generateSvgEmbedCss('transitrix');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
${titleSvg}
${parts.join('\n')}
</svg>`;
}
