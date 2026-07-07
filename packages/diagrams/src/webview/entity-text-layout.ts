/**
 * Shared text-in-block layout for Transitrix diagram renderers (strategy #521).
 *
 * Consolidates wrapping, truncation, and vertical placement patterns previously
 * duplicated across Blocks, Goals, DGCA/DGA, Activities, Process Blueprint, and
 * Capability Map renderers.
 */

export const TEXT_MARGIN_X = 8;
/** Approximate character width (px) at text-primary size (12px/600). */
export const CHAR_W_PRIMARY = 7;
/** Approximate character width (px) at text-id size (10px/600). */
export const CHAR_W_ID = 6;
/** Approximate character width (px) at text-secondary size. */
export const CHAR_W_SECONDARY = 7;
/** Vertical advance between name line centres (text-primary). */
export const LINE_H_PRIMARY = 14;
/** Vertical advance between secondary line centres. */
export const LINE_H_SECONDARY = 14;
/** Vertical advance between id line centres (text-id). */
export const LINE_H_ID = 12;
/** Gap between the name block and the id block in leaf-style layouts. */
export const NAME_ID_GAP = 14;
/** Gap between stacked row groups (name → type → id). */
export const ROW_GROUP_GAP = 9;

export function maxCharsForInnerWidth(innerWidth: number, charWidth: number): number {
  return Math.max(4, Math.floor(Math.max(0, innerWidth) / charWidth));
}

/** Word-wrap `text` to at most `maxLines` lines of `maxChars` each. */
export function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
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
        lines.push(rest.length <= safeMax ? rest : `${rest.slice(0, safeMax - 1)}…`);
        return lines;
      }
      cur = w.length <= safeMax ? w : `${w.slice(0, safeMax - 1)}…`;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.length ? lines : [`${text.slice(0, safeMax - 1)}…`];
}

/**
 * Greedy word-wrap with hard-break for tokens wider than the budget. When the
 * result exceeds `maxLines`, the last kept line is truncated with an ellipsis.
 * Used by Process Blueprint goal/result cells and aspect pill names.
 */
export function wrapTextLines(text: string, maxChars: number, maxLines: number): string[] {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) return [];
  const budget = Math.max(1, maxChars);

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    if (cur.length > 0) {
      lines.push(cur);
      cur = '';
    }
  };

  for (const word of words) {
    if (word.length > budget) {
      flush();
      let rest = word;
      while (rest.length > budget) {
        lines.push(rest.slice(0, budget));
        rest = rest.slice(budget);
      }
      cur = rest;
      continue;
    }
    const candidate = cur.length > 0 ? `${cur} ${word}` : word;
    if (candidate.length > budget) {
      flush();
      cur = word;
    } else {
      cur = candidate;
    }
  }
  flush();

  if (lines.length > maxLines) {
    const capped = lines.slice(0, maxLines);
    const last = capped[maxLines - 1];
    const clipped = last.length > budget - 1 ? last.slice(0, budget - 1) : last;
    capped[maxLines - 1] = `${clipped.replace(/…$/, '')}…`;
    return capped;
  }
  return lines;
}

/** Split an ID (no spaces) across lines, breaking at `_` or `-`. */
export function wrapId(id: string, maxChars: number, maxLines = 2): string[] {
  if (maxLines <= 1) return [truncateId(id, maxChars)];
  if (id.length <= maxChars) return [id];
  const seg = id.slice(0, maxChars);
  const sepIdx = Math.max(seg.lastIndexOf('_'), seg.lastIndexOf('-'));
  const cut = sepIdx > Math.floor(maxChars / 3) ? sepIdx : maxChars - 1;
  const isSep = id[cut] === '_' || id[cut] === '-';
  const line1 = id.slice(0, cut);
  const rest = id.slice(cut + (isSep ? 1 : 0));
  return [line1, rest.length <= maxChars ? rest : `${rest.slice(0, maxChars - 1)}…`];
}

/** Truncate `text` to at most `maxChars` characters, at a word boundary when possible. */
export function truncateLine(text: string, maxChars: number): string {
  const safeMax = Math.max(2, maxChars);
  if (text.length <= safeMax) return text;
  const cut = text.slice(0, safeMax - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > safeMax / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Single-line ID truncation that prefers `_`/`-` separators before a hard cut. */
export function truncateId(id: string, maxChars: number): string {
  const safeMax = Math.max(2, maxChars);
  if (id.length <= safeMax) return id;
  const cut = id.slice(0, safeMax - 1);
  const sepIdx = Math.max(cut.lastIndexOf('_'), cut.lastIndexOf('-'));
  return `${sepIdx > safeMax / 3 ? cut.slice(0, sepIdx) : cut}…`;
}

export interface TextLineSpec {
  cls: string;
  text: string;
  y: number;
  /** When set, use this x; otherwise callers supply a shared anchor (e.g. box centre). */
  x?: number;
}

export interface LayoutCenteredEntityOptions {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  name: string;
  type?: string;
  id: string;
  nameMaxLines?: number;
  idMaxLines?: number;
  marginX?: number;
}

interface TextRowGroup {
  cls: string;
  lines: string[];
  lineHeight: number;
  gapAfter: number;
}

function totalVerticalSpan(groups: TextRowGroup[]): number {
  let span = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.lines.length > 1) span += (g.lines.length - 1) * g.lineHeight;
    if (i < groups.length - 1) span += g.gapAfter;
  }
  return span;
}

/**
 * Layout centred entity text (name → optional type → id) inside a fixed box.
 * Returns absolute SVG y-positions (line centres) for each rendered row.
 */
export function layoutCenteredEntityText(opts: LayoutCenteredEntityOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const cx = opts.boxX + opts.boxWidth / 2;
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsType = maxCharsForInnerWidth(innerW, CHAR_W_SECONDARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);

  const nameLines = wrapWords(opts.name, maxCharsName, opts.nameMaxLines ?? 2);
  const typeLine = opts.type?.trim() ? truncateLine(opts.type, maxCharsType) : undefined;
  const idMaxLines = opts.idMaxLines ?? 1;
  const idLines = idMaxLines <= 1 ? [truncateId(opts.id, maxCharsId)] : wrapId(opts.id, maxCharsId, idMaxLines);

  const groups: TextRowGroup[] = [
    {
      cls: 'text-primary',
      lines: nameLines,
      lineHeight: LINE_H_PRIMARY,
      gapAfter: typeLine ? ROW_GROUP_GAP : NAME_ID_GAP,
    },
  ];
  if (typeLine) {
    groups.push({
      cls: 'text-secondary',
      lines: [typeLine],
      lineHeight: LINE_H_SECONDARY,
      gapAfter: NAME_ID_GAP,
    });
  }
  groups.push({
    cls: 'text-id',
    lines: idLines,
    lineHeight: LINE_H_ID,
    gapAfter: 0,
  });

  const span = totalVerticalSpan(groups);
  const firstY = Math.round(opts.boxY + (opts.boxHeight - span) / 2);
  const out: TextLineSpec[] = [];
  let y = firstY;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (let li = 0; li < g.lines.length; li++) {
      out.push({ cls: g.cls, text: g.lines[li], y });
      if (li < g.lines.length - 1) y += g.lineHeight;
    }
    if (gi < groups.length - 1) y += g.gapAfter;
  }
  return out;
}

/** Emit centred `<text>` elements from {@link layoutCenteredEntityText} specs. */
export function emitCenteredTextSvg(
  specs: TextLineSpec[],
  centerX: number,
  esc: (s: string) => string,
): string {
  return specs
    .map((spec) => {
      const x = spec.x ?? centerX;
      const anchor = spec.x != null && spec.cls === 'text-pill' ? ' text-anchor="middle"' : ' text-anchor="middle"';
      return `<text class="${spec.cls}" x="${x}" y="${spec.y}"${anchor} dominant-baseline="central">${esc(spec.text)}</text>`;
    })
    .join('\n');
}

export interface LayoutLeafBlockTextOptions {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  name: string;
  id: string;
  nameMaxLines?: number;
  marginX?: number;
}

/** Leaf nested-block layout: name (up to 3 lines) + id (up to 2 lines), centred. */
export function layoutLeafBlockText(opts: LayoutLeafBlockTextOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);
  const nameLines = wrapWords(opts.name, maxCharsName, opts.nameMaxLines ?? 3);
  const idLines = wrapId(opts.id, maxCharsId, 2);

  const nameSpan = (nameLines.length - 1) * LINE_H_PRIMARY;
  const idSpan = (idLines.length - 1) * LINE_H_ID;
  const totalSpan = nameSpan + NAME_ID_GAP + idSpan;
  const firstY = Math.round(opts.boxY + (opts.boxHeight - totalSpan) / 2);

  const out: TextLineSpec[] = [];
  for (let i = 0; i < nameLines.length; i++) {
    out.push({ cls: 'text-primary', text: nameLines[i], y: firstY + i * LINE_H_PRIMARY });
  }
  const idFirstY = firstY + nameSpan + NAME_ID_GAP;
  for (let i = 0; i < idLines.length; i++) {
    out.push({ cls: 'text-id', text: idLines[i], y: idFirstY + i * LINE_H_ID });
  }
  return out;
}

export interface LayoutHeaderBlockTextOptions {
  boxX: number;
  boxY: number;
  boxWidth: number;
  headerHeight: number;
  name: string;
  id: string;
  marginX?: number;
}

/** Container header: single-line name + id stacked in the header strip. */
export function layoutHeaderBlockText(opts: LayoutHeaderBlockTextOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);
  const nameText = truncateLine(opts.name, maxCharsName);
  const idText = truncateId(opts.id, maxCharsId);
  const headerMid = opts.boxY + opts.headerHeight / 2;
  const halfSpan = (LINE_H_PRIMARY + LINE_H_ID) / 4;
  return [
    { cls: 'text-primary', text: nameText, y: Math.round(headerMid - halfSpan) },
    { cls: 'text-id', text: idText, y: Math.round(headerMid + halfSpan) },
  ];
}

/**
 * Left-anchored multi-line cell text, vertically centred (Process Blueprint cells).
 * Returns one spec per line with absolute x baked into caller via anchorX.
 */
export function layoutLeftCellLines(
  lines: string[],
  anchorX: number,
  cellTop: number,
  cellHeight: number,
  lineHeight: number,
  cls: string,
): TextLineSpec[] {
  const ls = lines.length > 0 ? lines : [''];
  const firstY = cellTop + cellHeight / 2 - ((ls.length - 1) / 2) * lineHeight;
  return ls.map((text, i) => ({ cls, text, y: firstY + i * lineHeight, x: anchorX }));
}

/** Centred pill text: name lines + optional id line below. */
export function layoutCenteredPillText(
  pillX: number,
  pillY: number,
  pillWidth: number,
  pillHeight: number,
  nameLines: string[],
  idLine: string | undefined,
  nameLineHeight = 15,
): TextLineSpec[] {
  const cx = pillX + pillWidth / 2;
  const lineCount = nameLines.length + (idLine ? 1 : 0);
  const firstY = pillY + pillHeight / 2 - ((lineCount - 1) / 2) * nameLineHeight;
  const out: TextLineSpec[] = nameLines.map((text, i) => ({
    cls: 'text-pill',
    text,
    y: firstY + i * nameLineHeight,
    x: cx,
  }));
  if (idLine) {
    out.push({
      cls: 'text-secondary',
      text: idLine,
      y: firstY + nameLines.length * nameLineHeight,
      x: cx,
    });
  }
  return out;
}
