/**
 * Host-neutral SVG renderer for the Process Blueprint notation.
 *
 * Step 4 of the IntelliJ epic (ADR 0001): ported from the pure SVG core of
 * `extension/src/process-blueprint-preview.ts` (`layoutToSvg`). The VS Code
 * title block (`svg-title-block.ts`) is intentionally dropped — JCEF has no
 * VS Code APIs — and replaced with `render-goals.ts`' simple optional
 * `<text class="text-header">` heading. No `vscode`, no `node:*`, no host APIs;
 * the shared theme CSS is embedded inside the `<svg>` so the output is
 * self-contained.
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
 * Render a single compliance law chip.
 *
 * Three orthogonal decorations are expressed as SVG overrides:
 * - `new`      — dashed stroke border  (`stroke-dasharray="4 2"`)
 * - `gap`      — warning-level fill    (`class="…compliance-gap"`)
 * - `deadline` — urgent fill override  (`class="…compliance-deadline"`) + a small
 *                badge circle in the top-right corner
 */
function complianceChipSvg(chip: ComplianceChip, ox: number, oy: number): string {
  const { x, y, width, height, lawId, decorations } = chip;
  const ax = x + ox;
  const ay = y + oy;
  const rx = 6;
  const hasNew = decorations.includes('new');
  const hasGap = decorations.includes('gap');
  const hasDeadline = decorations.includes('deadline');

  let rectClass = 'diagram-node level-5 compliance-chip';
  if (hasDeadline) rectClass += ' compliance-deadline';
  else if (hasGap) rectClass += ' compliance-gap';

  const strokeDash = hasNew ? ' stroke-dasharray="4 2"' : '';
  const parts: string[] = [];
  parts.push(
    `<rect class="${rectClass}" x="${ax}" y="${ay}" width="${width}" height="${height}" rx="${rx}"${strokeDash}/>`,
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

  const parts: string[] = [];

  parts.push(
    `<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="6"/>`,
  );

  for (const s of layout.stageHeaders) {
    parts.push(
      `<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}"/>`,
    );
    parts.push(
      `<text class="text-header" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(s.name, 28))}</text>`,
    );
  }

  for (const l of layout.legend) {
    parts.push(
      `<rect class="diagram-node level-2" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}"/>`,
    );
    parts.push(
      `<text class="text-primary" x="${ox + 12}" y="${l.y + oy + l.height / 2}" dominant-baseline="central">${escXml(l.label)}</text>`,
    );
  }

  const textX = layout.cellTextPadX;
  for (const c of layout.goalCells) {
    parts.push(
      `<rect class="diagram-node level-3" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight),
    );
  }
  for (const c of layout.resultCells) {
    parts.push(
      `<rect class="diagram-node level-4" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`,
    );
    parts.push(
      textCellSvg(c.lines, 'text-secondary', c.x + ox + textX, c.y + oy, c.height, layout.textLineHeight),
    );
  }

  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    parts.push(
      `<rect class="diagram-node level-${level}" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${layout.bounds.width - layout.legendColumnWidth}" height="${row.height}" opacity="0.15"/>`,
    );
    for (let i = 1; i < layout.stageHeaders.length; i++) {
      const x = layout.legendColumnWidth + i * layout.stageColumnWidth + ox;
      parts.push(
        `<line class="diagram-edge" x1="${x}" y1="${row.y + oy}" x2="${x}" y2="${row.y + row.height + oy}" opacity="0.3"/>`,
      );
    }
    for (const p of row.pills) {
      parts.push(
        `<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`,
      );
      const label = p.id ? `${p.name} · ${p.id}` : p.name;
      parts.push(
        `<text class="text-pill" x="${p.x + ox + p.width / 2}" y="${p.y + oy + p.height / 2}" text-anchor="middle" dominant-baseline="central">${escXml(truncate(label, Math.floor(p.width / 8)))}</text>`,
      );
    }
  }

  // Compliance row (optional).
  if (layout.complianceRow) {
    const row = layout.complianceRow;
    parts.push(
      `<rect class="diagram-node level-5" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${layout.bounds.width - layout.legendColumnWidth}" height="${row.height}" opacity="0.10"/>`,
    );
    for (let i = 1; i < layout.stageHeaders.length; i++) {
      const x = layout.legendColumnWidth + i * layout.stageColumnWidth + ox;
      parts.push(
        `<line class="diagram-edge" x1="${x}" y1="${row.y + oy}" x2="${x}" y2="${row.y + row.height + oy}" opacity="0.3"/>`,
      );
    }
    for (const chip of row.chips) {
      parts.push(complianceChipSvg(chip, ox, oy));
    }
  }

  const titleSvg = title
    ? `<text class="text-header" x="${PAD}" y="${PAD - 6}">${escXml(title)}</text>`
    : '';

  // Embed the shared theme CSS inside the SVG so the rendered output is
  // self-contained for the JCEF host — matches render-goals.ts.
  const embedCss = generateSvgEmbedCss('transitrix');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<style>${embedCss}</style>
${titleSvg}
${parts.join('\n')}
</svg>`;
}
