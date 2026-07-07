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
  ProcessBlueprintLayoutOptions,
} from '../process-blueprint/types.js';
import {
  parseNodeSizePreset,
  resolveProcessBlueprintSize,
  type NodeSizePreset,
} from '../node-size-presets.js';
import { generateSvgEmbedCss } from '../theme/index.js';
import {
  layoutCenteredPillText,
  layoutLeftCellLines,
  maxCharsForInnerWidth,
  truncateLine,
} from './entity-text-layout.js';
import { escXml } from './render-util.js';

const PAD = 24;

const BP_EMBED_CSS = `
.bp-row-bg { fill: none; }
.bp-border { fill: none; stroke: var(--ts-border, #cbd5e1); stroke-width: 1; }`;

function textCellSvg(
  lines: string[],
  cls: string,
  x: number,
  cellTop: number,
  cellHeight: number,
  lineHeight: number,
): string {
  const specs = layoutLeftCellLines(lines, x, cellTop, cellHeight, lineHeight, cls);
  const ls = lines.length > 0 ? lines : [''];
  const first = cellTop + cellHeight / 2 - ((ls.length - 1) / 2) * lineHeight;
  const tspans = ls
    .map((ln, i) => `<tspan x="${x}" y="${first + i * lineHeight}">${escXml(ln)}</tspan>`)
    .join('');
  void specs;
  return `<text class="${cls}" dominant-baseline="central">${tspans}</text>`;
}

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
  const maxChars = maxCharsForInnerWidth(Math.max(0, width - 8), 8);
  const parts: string[] = [];
  parts.push(
    `<rect class="${rectClass}" x="${ax}" y="${ay}" width="${width}" height="${height}" rx="6"${strokeDash}/>`,
  );
  parts.push(
    `<text class="text-pill" x="${ax + width / 2}" y="${ay + height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncateLine(lawId, maxChars))}</text>`,
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

export function renderProcessBlueprintBody(
  layout: ProcessBlueprintLayout,
  ox: number,
  oy: number,
  clipId = 'bp-clip',
): string {
  const tw = layout.bounds.width;
  const th = layout.bounds.height;

  const parts: string[] = [];
  const topParts: string[] = [];

  parts.push(
    `<rect class="diagram-node level-0 bp-row-bg" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" stroke="none"/>`,
  );

  parts.push(`<defs><clipPath id="${clipId}"><rect x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6"/></clipPath></defs>`);

  const inner: string[] = [];
  const headerMaxChars = Math.max(8, Math.floor((layout.stageColumnWidth - 16) / 7));

  for (const s of layout.stageHeaders) {
    inner.push(
      `<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-header" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncateLine(s.name, headerMaxChars))}</text>`,
    );
  }

  for (const l of layout.legend) {
    inner.push(
      `<rect class="diagram-node level-2 bp-row-bg" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}" stroke="none"/>`,
    );
    inner.push(
      `<text class="text-primary" x="${ox + 12}" y="${l.y + oy + l.height / 2}" dominant-baseline="central">${escXml(l.label)}</text>`,
    );
  }

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

  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    inner.push(
      `<rect class="diagram-node level-${level} bp-row-bg" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${tw - layout.legendColumnWidth}" height="${row.height}" stroke="none"/>`,
    );
    for (const p of row.pills) {
      const hasIdLine = !!(p.id && p.lines.length > 0 && p.lines[p.lines.length - 1] === p.id);
      const nameLines = hasIdLine ? p.lines.slice(0, -1) : p.lines;
      const idLine = hasIdLine ? p.id : undefined;
      const pillSpecs = layoutCenteredPillText(p.x + ox, p.y + oy, p.width, p.height, nameLines, idLine);
      topParts.push(
        `<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`,
      );
      for (const spec of pillSpecs) {
        const anchor = spec.cls === 'text-pill' || spec.cls === 'text-secondary' ? ' text-anchor="middle"' : '';
        topParts.push(
          `<text class="${spec.cls}" x="${spec.x}" y="${spec.y}"${anchor} dominant-baseline="central">${escXml(spec.text)}</text>`,
        );
      }
    }
  }

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

  parts.push(`<g clip-path="url(#${clipId})">${inner.join('\n')}${topParts.join('\n')}</g>`);
  parts.push(`<rect class="bp-border" x="${ox}" y="${oy}" width="${tw}" height="${th}" rx="6" fill="none"/>`);

  return parts.join('\n');
}

export interface RenderProcessBlueprintOptions {
  title?: string;
  nodeSizePreset?: NodeSizePreset;
  layoutOptions?: ProcessBlueprintLayoutOptions;
}

export function renderProcessBlueprintSvg(
  doc: ProcessBlueprintFile,
  options: RenderProcessBlueprintOptions = {},
): string {
  const { title = '', nodeSizePreset = 'normal', layoutOptions } = options;
  const sizing = resolveProcessBlueprintSize(parseNodeSizePreset(nodeSizePreset));

  const layout: ProcessBlueprintLayout = layoutProcessBlueprint(doc, {
    ...sizing,
    ...layoutOptions,
  });

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

  const embedCss = generateSvgEmbedCss('transitrix') + BP_EMBED_CSS;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
${titleSvg}
${body}
</svg>`;
}
