/**
 * Host-neutral SVG renderer for the Process Blueprint notation.
 *
 * Single-emitter unification (review C): the canonical blueprint body lives
 * here in `renderProcessBlueprintBody` and is shared by both hosts. The VS Code
 * preview (`extension/src/process-blueprint-preview.ts`) wraps it with the VS
 * Code title block; this module wraps it with `render-goals.ts`' simple
 * optional `<text class="text-header">` heading and embeds the shared theme CSS
 * (plus the blueprint-specific `bp-*` rules) so the JCEF output is
 * self-contained. No `vscode`, no `node:*`, no host APIs.
 */
import { layoutProcessBlueprint } from '../process-blueprint/layout.js';
import type {
  ComplianceChip,
  ProcessBlueprintFile,
  ProcessBlueprintLayout,
} from '../process-blueprint/types.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import { escXml } from './render-util.js';

const PAD = 24;

// Blueprint-specific rules not carried by the shared theme CSS. The outer
// border is drawn last on top of the clipped inner content; the row
// backgrounds are transparent (pills/chips carry the colour). Mirrors
// `BLUEPRINT_CSS` from the VS Code preview so the self-contained JCEF output
// matches the editor.
const BP_EMBED_CSS = `
.bp-row-bg { fill: none; }
.bp-border { fill: none; stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }`;

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, Math.max(0, maxChars - 1)) + '…';
}

/**
 * Render a left-anchored, vertically centred multi-line text cell. `lines` are
 * pre-wrapped by the layout; the block is centred within the cell height.
 */
function textCellSvg(
  lines: string[],
  cls: string,
  x: number,
  cellTop: number,
  cellHeight: number,
  lineHeight: number,
): string {
  const ls = lines.length > 0 ? lines : [''];
  const first = cellTop + cellHeight / 2 - ((ls.length - 1) / 2) * lineHeight;
  const tspans = ls
    .map((ln, i) => `<tspan x="${x}" y="${first + i * lineHeight}">${escXml(ln)}</tspan>`)
    .join('');
  return `<text class="${cls}" dominant-baseline="central">${tspans}</text>`;
}

/**
 * Render a single compliance law chip wrapped in a `<g data-chip-law…>` so the
 * VS Code host can wire click-to-drill-down. Other hosts (JCEF) simply ignore
 * the data attributes.
 *
 * Three orthogonal decorations are expressed as SVG overrides:
 * - `new`      — dashed stroke border  (`stroke-dasharray="4 2"`)
 * - `gap`      — warning-level fill    (`class="…compliance-gap"`)
 * - `deadline` — urgent fill override  (`class="…compliance-deadline"`) + a small
 *                badge circle in the top-right corner
 */
function complianceChipSvg(
  chip: ComplianceChip,
  ox: number,
  oy: number,
  stageId: string,
): string {
  const { x, y, width, height, lawId, decorations } = chip;
  const ax = x + ox;
  const ay = y + oy;
  const hasNew = decorations.includes('new');
  const hasGap = decorations.includes('gap');
  const hasDeadline = decorations.includes('deadline');
  let rectClass = 'diagram-node level-5 compliance-chip';
  if (hasDeadline) rectClass += ' compliance-deadline';
  else if (hasGap) rectClass += ' compliance-gap';
  const strokeDash = hasNew ? ' stroke-dasharray="4 2"' : '';
  const parts: string[] = [];
  parts.push(
    `<rect class="${rectClass}" x="${ax}" y="${ay}" width="${width}" height="${height}" rx="6"${strokeDash}/>`,
  );
  parts.push(
    `<text class="text-pill" x="${ax + width / 2}" y="${ay + height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(lawId, Math.floor(width / 8)))}</text>`,
  );
  if (hasDeadline) {
    const br = 5;
    const bx = ax + width - br - 3;
    const by = ay + br + 3;
    parts.push(`<circle class="compliance-badge" cx="${bx}" cy="${by}" r="${br}"/>`);
    parts.push(
      `<text class="compliance-badge-text" x="${bx}" y="${by}" text-anchor="middle" dominant-baseline="central">!</text>`,
    );
  }
  return `<g data-chip-law="${escXml(lawId)}" data-chip-stage="${escXml(stageId)}">\n${parts.join('\n')}\n</g>`;
}

/**
 * Canonical Process Blueprint body — everything inside the `<svg>` except the
 * host-specific title block. Shared verbatim by the VS Code preview and the
 * host-neutral wrapper below so both surfaces stay pixel-identical.
 *
 * Layering: a clipped group holds the row fills and grid lines; pills and
 * compliance chips render on top (so grid lines sit under pill content); the
 * outer rounded border is drawn last so corner cells never overflow it.
 */
export function renderProcessBlueprintBody(
  layout: ProcessBlueprintLayout,
  ox: number,
  oy: number,
  clipId = 'bp-clip',
): string {
  const tw = layout.bounds.width;
  const th = layout.bounds.height;

  const parts: string[] = [];
  // Pills and chips collected separately so they render after (on top of) grid lines.
  const topParts: string[] = [];

  // Outer background (fill only; border drawn last on top).
  parts.push(
    `<rect class="diagram-node level-0 bp-row-bg" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" stroke="none"/>`,
  );

  // ClipPath — clips all inner content to the outer rounded rect so corner cells
  // don't visually overflow the rx=6 boundary.
  parts.push(`<defs><clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6"/></clipPath></defs>`);

  const inner: string[] = [];

  // Stage headers (top row).
  for (const s of layout.stageHeaders) {
    inner.push(
      `<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-header" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(s.name, 28))}</text>`,
    );
  }

  // Legend column (row labels).
  for (const l of layout.legend) {
    inner.push(
      `<rect class="diagram-node level-2 bp-row-bg" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-primary" x="${ox + 12}" y="${l.y + oy + l.height / 2}" dominant-baseline="central">${escXml(l.label)}</text>`,
    );
  }

  // Goal and result cells.
  const textX = layout.cellTextPadX;
  for (const c of layout.goalCells) {
    inner.push(
      `<rect class="diagram-node level-3 bp-row-bg" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}" stroke="none"/>`,
    );
    inner.push(textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight));
  }
  for (const c of layout.resultCells) {
    inner.push(
      `<rect class="diagram-node level-4 bp-row-bg" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}" stroke="none"/>`,
    );
    inner.push(textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight));
  }

  // Aspect rows — transparent background; pills carry the colour.
  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    inner.push(
      `<rect class="diagram-node level-${level} bp-row-bg" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${tw - layout.legendColumnWidth}" height="${row.height}" stroke="none"/>`,
    );
    for (const p of row.pills) {
      const cx = p.x + ox + p.width / 2;
      const pillLH = 15;
      // p.lines: name lines (possibly wrapped), optionally with id as last line.
      const hasIdLine = !!(p.id && p.lines.length > 0 && p.lines[p.lines.length - 1] === p.id);
      const nameLines = hasIdLine ? p.lines.slice(0, -1) : p.lines;
      const idLine = hasIdLine ? p.id : undefined;
      const pillFirstY = p.y + oy + p.height / 2 - ((p.lines.length - 1) / 2) * pillLH;
      topParts.push(
        `<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`,
      );
      if (nameLines.length > 0) {
        const tspans = nameLines
          .map((ln, i) => `<tspan x="${cx}" y="${pillFirstY + i * pillLH}">${escXml(ln)}</tspan>`)
          .join('');
        topParts.push(`<text class="text-pill" text-anchor="middle" dominant-baseline="central">${tspans}</text>`);
      }
      if (idLine) {
        topParts.push(
          `<text class="text-secondary" x="${cx}" y="${pillFirstY + nameLines.length * pillLH}" text-anchor="middle" dominant-baseline="central">${escXml(idLine)}</text>`,
        );
      }
    }
  }

  // Compliance row (optional).
  if (layout.complianceRow) {
    const row = layout.complianceRow;
    inner.push(
      `<rect class="diagram-node level-5 bp-row-bg" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${tw - layout.legendColumnWidth}" height="${row.height}" stroke="none"/>`,
    );
    for (const chip of row.chips) {
      const stageId = layout.stageHeaders[chip.stageIndex]?.id ?? '';
      topParts.push(complianceChipSvg(chip, ox, oy, stageId));
    }
  }

  // Grid lines — drawn before pills so they appear under pill content.
  const gridX1 = ox;
  const gridX2 = ox + tw;
  const gridY1 = oy;
  const gridY2 = oy + th;
  if (layout.legend.length > 0) {
    const headerBottomY = oy + layout.legend[0].y;
    inner.push(`<line class="diagram-edge" x1="${gridX1}" y1="${headerBottomY}" x2="${gridX2}" y2="${headerBottomY}"/>`);
    for (let i = 0; i < layout.legend.length - 1; i++) {
      const rowBottomY = oy + layout.legend[i].y + layout.legend[i].height;
      inner.push(`<line class="diagram-edge" x1="${gridX1}" y1="${rowBottomY}" x2="${gridX2}" y2="${rowBottomY}"/>`);
    }
  }
  const legLineX = ox + layout.legendColumnWidth;
  inner.push(`<line class="diagram-edge" x1="${legLineX}" y1="${gridY1}" x2="${legLineX}" y2="${gridY2}"/>`);
  for (let i = 1; i < layout.stageHeaders.length; i++) {
    const stageLineX = ox + layout.legendColumnWidth + i * layout.stageColumnWidth;
    inner.push(`<line class="diagram-edge" x1="${stageLineX}" y1="${gridY1}" x2="${stageLineX}" y2="${gridY2}"/>`);
  }

  // Inner content (fills + grid lines) clipped to rounded outer rect.
  parts.push(`<g clip-path="url(#${clipId})">${inner.join('\n')}${topParts.join('\n')}</g>`);

  // Outer border on top — fill="none" as attribute so PNG export (no external CSS) never shows black.
  parts.push(`<rect class="bp-border" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" fill="none"/>`);

  return parts.join('\n');
}

export interface RenderProcessBlueprintOptions {
  title?: string;
}

export function renderProcessBlueprintSvg(
  doc: ProcessBlueprintFile,
  options: RenderProcessBlueprintOptions = {},
): string {
  const { title = '' } = options;

  const layout: ProcessBlueprintLayout = layoutProcessBlueprint(doc);

  if (layout.bounds.width === 0 || layout.bounds.height === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" viewBox="0 0 0 0"></svg>`;
  }

  const titleH = title ? PAD : 0;
  const w = layout.bounds.width + PAD * 2;
  const h = layout.bounds.height + PAD * 2 + titleH;
  const ox = PAD;
  const oy = PAD + titleH;

  const body = renderProcessBlueprintBody(layout, ox, oy);

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(title)}</text>`
    : '';

  // Embed the shared theme CSS plus the blueprint-specific rules inside the SVG
  // so the rendered output is self-contained for the JCEF host.
  const embedCss = generateSvgEmbedCss('transitrix') + BP_EMBED_CSS;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
${titleSvg}
${body}
</svg>`;
}
