/**
 * Shared text-in-block layout for Transitrix diagram renderers.
 *
 * Consolidates wrapping, truncation, and vertical placement patterns previously
 * duplicated across Blocks, Goals, DGCA/DGA, Activities, Process Blueprint, and
 * Capability Map renderers.
 */

export const TEXT_MARGIN_X = 8;
/**
 * Minimum reserved vertical padding (px) between the box's top/bottom edge and
 * the nearest line's outer extent. Always enforced — see
 * {@link layoutCenteredEntityText}'s adaptive line-count reduction, which
 * trades name-line count for this padding rather than letting text touch or
 * cross the box border.
 */
export const TEXT_MARGIN_Y = 4;
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
/**
 * Gap between the name block and the id block in leaf-style layouts — used as
 * a direct centre-to-centre distance there, so keep it >= ~11px (half of
 * text-primary's 12px font + half of text-id's 10px font) to avoid the
 * overlap regressed in #419. Do not tighten without re-checking that test.
 */
export const NAME_ID_GAP = 14;
/** Gap between stacked row groups (name → type → id). */
export const ROW_GROUP_GAP = 4;

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
  marginY?: number;
}

interface TextRowGroup {
  cls: string;
  lines: string[];
  lineHeight: number;
  gapAfter: number;
}

/**
 * Half-extent (px) of rendered glyphs around their centre y — approximately
 * font-size / 2, the same heuristic the #419 non-overlap regression test
 * uses. Used only to keep the *outermost* line's visual extent (not just its
 * centre) inside the box when computing edge padding; inter-line spacing
 * between adjacent rows is governed separately by the LINE_H_ constants,
 * NAME_ID_GAP and ROW_GROUP_GAP, which already keep centres far enough apart
 * to avoid overlap.
 */
const HALF_EXTENT_PRIMARY = 6; // text-primary, 12px font
const HALF_EXTENT_ID = 5; // text-id, 10px font

/** Place `groups`' lines starting at `startY`, advancing by each line's own height and gap. */
function placeLines(groups: TextRowGroup[], startY: number): TextLineSpec[] {
  const out: TextLineSpec[] = [];
  let y = startY;
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    for (let li = 0; li < g.lines.length; li++) {
      out.push({ cls: g.cls, text: g.lines[li], y });
      y += g.lineHeight;
    }
    if (gi < groups.length - 1) y += g.gapAfter;
  }
  return out;
}

/** Centre-to-centre distance from the first to the last placed line. */
function centerSpan(groups: TextRowGroup[]): number {
  const ys = placeLines(groups, 0).map((s) => s.y);
  return ys[ys.length - 1] - ys[0];
}

/**
 * Layout centred entity text (name → optional type → id) inside a fixed box.
 * Returns absolute SVG y-positions (line centres) for each rendered row.
 *
 * Guarantees, in order of priority:
 *   1. Content never crosses the box's top/bottom edge.
 *   2. At least `marginY` (default {@link TEXT_MARGIN_Y}) of padding is kept
 *      above the first line's glyphs and below the last line's glyphs.
 *   3. The name gets as many lines as `nameMaxLines` allows (2 by default)
 *      when the box is tall enough; on short/compact boxes (e.g. with a type
 *      row present) it degrades to fewer name lines — trading line count,
 *      not padding — rather than letting text overflow.
 */
export function layoutCenteredEntityText(opts: LayoutCenteredEntityOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const marginY = opts.marginY ?? TEXT_MARGIN_Y;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsType = maxCharsForInnerWidth(innerW, CHAR_W_SECONDARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);

  const typeLine = opts.type?.trim() ? truncateLine(opts.type, maxCharsType) : undefined;
  const idMaxLines = opts.idMaxLines ?? 1;
  const idLines = idMaxLines <= 1 ? [truncateId(opts.id, maxCharsId)] : wrapId(opts.id, maxCharsId, idMaxLines);

  function buildGroups(nameLines: string[]): TextRowGroup[] {
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
    return groups;
  }

  // groups[0] is always the name (text-primary) and the last group is always
  // the id (text-id), so the edge-padding half-extents below are fixed.
  const requestedNameMaxLines = Math.max(1, opts.nameMaxLines ?? 2);
  const availableHeight = Math.max(0, opts.boxHeight - marginY * 2);

  let nameLines = wrapWords(opts.name, maxCharsName, requestedNameMaxLines);
  let groups = buildGroups(nameLines);
  let contentSpan = centerSpan(groups) + HALF_EXTENT_PRIMARY + HALF_EXTENT_ID;
  for (
    let cap = requestedNameMaxLines - 1;
    cap >= 1 && contentSpan > availableHeight;
    cap--
  ) {
    nameLines = wrapWords(opts.name, maxCharsName, cap);
    groups = buildGroups(nameLines);
    contentSpan = centerSpan(groups) + HALF_EXTENT_PRIMARY + HALF_EXTENT_ID;
  }

  const margin = Math.max(0, (opts.boxHeight - contentSpan) / 2);
  const firstY = Math.round(opts.boxY + margin + HALF_EXTENT_PRIMARY);
  return placeLines(groups, firstY);
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

/**
 * Leaf nested-block layout: name (up to 3 lines) + id (up to 2 lines), centred.
 * Degrades name line count (never below 1) when the box is too short to hold
 * the requested max plus {@link TEXT_MARGIN_Y} padding on both edges, so text
 * never crosses the box border.
 */
export function layoutLeafBlockText(opts: LayoutLeafBlockTextOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);
  const idLines = wrapId(opts.id, maxCharsId, 2);
  const idCenterSpan = (idLines.length - 1) * LINE_H_ID;

  const requestedNameMaxLines = Math.max(1, opts.nameMaxLines ?? 3);
  const availableHeight = Math.max(0, opts.boxHeight - TEXT_MARGIN_Y * 2);

  let nameLines = wrapWords(opts.name, maxCharsName, requestedNameMaxLines);
  let nameCenterSpan = (nameLines.length - 1) * LINE_H_PRIMARY;
  let contentSpan = nameCenterSpan + NAME_ID_GAP + idCenterSpan + HALF_EXTENT_PRIMARY + HALF_EXTENT_ID;
  for (
    let cap = requestedNameMaxLines - 1;
    cap >= 1 && contentSpan > availableHeight;
    cap--
  ) {
    nameLines = wrapWords(opts.name, maxCharsName, cap);
    nameCenterSpan = (nameLines.length - 1) * LINE_H_PRIMARY;
    contentSpan = nameCenterSpan + NAME_ID_GAP + idCenterSpan + HALF_EXTENT_PRIMARY + HALF_EXTENT_ID;
  }

  const margin = Math.max(0, (opts.boxHeight - contentSpan) / 2);
  const firstY = Math.round(opts.boxY + margin + HALF_EXTENT_PRIMARY);

  const out: TextLineSpec[] = [];
  for (let i = 0; i < nameLines.length; i++) {
    out.push({ cls: 'text-primary', text: nameLines[i], y: firstY + i * LINE_H_PRIMARY });
  }
  const idFirstY = firstY + nameCenterSpan + NAME_ID_GAP;
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

/**
 * Direct centre-to-centre gap between the header's name and id lines.
 * Safely above the ~11px non-overlap floor (half of text-primary's 12px font
 * + half of text-id's 10px font, per the #419 regression) but tighter than
 * {@link NAME_ID_GAP} to fit the compact header strip.
 */
const HEADER_NAME_ID_GAP = 12;

/** Container header: single-line name + id stacked in the header strip. */
export function layoutHeaderBlockText(opts: LayoutHeaderBlockTextOptions): TextLineSpec[] {
  const marginX = opts.marginX ?? TEXT_MARGIN_X;
  const innerW = Math.max(0, opts.boxWidth - marginX * 2);
  const maxCharsName = maxCharsForInnerWidth(innerW, CHAR_W_PRIMARY);
  const maxCharsId = maxCharsForInnerWidth(innerW, CHAR_W_ID);
  const nameText = truncateLine(opts.name, maxCharsName);
  const idText = truncateId(opts.id, maxCharsId);

  const contentSpan = HEADER_NAME_ID_GAP + HALF_EXTENT_PRIMARY + HALF_EXTENT_ID;
  const margin = Math.max(0, (opts.headerHeight - contentSpan) / 2);
  const nameY = Math.round(opts.boxY + margin + HALF_EXTENT_PRIMARY);
  const idY = nameY + HEADER_NAME_ID_GAP;
  return [
    { cls: 'text-primary', text: nameText, y: nameY },
    { cls: 'text-id', text: idText, y: idY },
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
