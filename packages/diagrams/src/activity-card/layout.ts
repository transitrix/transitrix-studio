// Activity Card — single-page layout (pure geometry; the preview paints SVG).
//
// Top-to-bottom card sections (spec §4 / §5):
//   1. Title         — project name
//   2. Dates band    — Initiation (valid_from) · Planned start · Planned end
//   3. Milestones    — narrative timeline, markers left→right by date
//   4. Motivation    — Factors → Goals → Changes columns with F→G→C edges
//   5. Child activities — activities whose parent = the project
//
// The §5.1 ArchiMate-class convention ("(Work Package)", "(Implementation
// Event)") is applied HERE, derived from element TYPE — there is no
// archimate_class data field.

import type {
  ActivityCardLayout,
  ActivityCardLayoutOptions,
  ChainEdge,
  ChainNode,
  ChildActivityRow,
  DateField,
  InfoRow,
  MilestoneMarker,
  ResolvedActivityCard,
  SectionHeader,
} from './types.js';

const DEFAULTS = {
  cardWidth: 780,
  columnGap: 28,
  rowGap: 12,
} as const;

// Fixed metrics (px). Kept local — the card has no user-tunable spacing yet.
const PAD = 20;
const TITLE_H = 38;
const DATES_H = 56;
const SECTION_HEADER_H = 26;
const SECTION_GAP = 16;
const MILESTONE_W = 168;
const MILESTONE_H = 64;
const MILESTONE_GAP = 16;
const CHAIN_NODE_H = 46;
const CHILD_ROW_H = 42;

// Info-row metrics (Description / Project goal / Stakeholders). The label sits
// at row-relative y=22, the first value line at y=44, each further line +18.
// The renderers paint at those same fixed offsets, so INFO_ROW_H must keep all
// value lines inside the box.
const INFO_LINE_H = 18;
const INFO_ROW_BASE_H = 38; // label band (22) + bottom padding past last line (16)
/** Approx px per character for the value font; sets the wrap budget. */
const INFO_CHAR_W = 7;

/**
 * Greedy word-wrap to a max characters-per-line budget. Over-long words are
 * hard-split; output beyond `maxLines` is dropped with an ellipsis so one long
 * field can't grow the card unbounded. (Local copy — the card layout is a
 * standalone module; cf. process-blueprint's `wrapText`.)
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
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

/** ArchiMate class per §5.1 — derived from element TYPE, never stored. */
export const ARCHIMATE_CLASS = {
  ACTIVITY: 'Work Package',
  MILESTONE: 'Implementation Event',
} as const;

export function layoutActivityCard(
  card: ResolvedActivityCard,
  options?: ActivityCardLayoutOptions,
): ActivityCardLayout {
  const opts = { ...DEFAULTS, ...(options ?? {}) };
  const contentX = PAD;
  const contentW = opts.cardWidth - PAD * 2;

  let cursorY = PAD;

  // 1. Title
  const title = { name: card.project.name, x: contentX, y: cursorY + TITLE_H / 2 };
  cursorY += TITLE_H;

  // 2. Dates band — three equal cells.
  const dateDefs: Array<{ label: string; value: string }> = [
    { label: 'Initiation', value: card.project.valid_from ?? '—' },
    { label: 'Planned start', value: card.project.start_date ?? '—' },
    { label: 'Planned end', value: card.project.end_date ?? '—' },
  ];
  const dateGap = 12;
  const dateCellW = (contentW - dateGap * (dateDefs.length - 1)) / dateDefs.length;
  const dateFields: DateField[] = dateDefs.map((d, i) => ({
    label: d.label,
    value: d.value,
    x: contentX + i * (dateCellW + dateGap),
    y: cursorY,
    width: dateCellW,
    height: DATES_H,
  }));
  cursorY += DATES_H + SECTION_GAP;

  // 2b. Info rows — Description, Project goal, Stakeholders (full-width).
  // Project goal and Stakeholders are ALWAYS shown (with a "—" placeholder when
  // empty); Description appears only when the card carries one.
  const infoRows: InfoRow[] = [];
  const maxChars = Math.max(8, Math.floor(contentW / INFO_CHAR_W));
  const pushInfoRow = (label: string, raw: string, maxLines: number): void => {
    const valueLines = wrapText(raw, maxChars, maxLines);
    const lines = valueLines.length > 0 ? valueLines : ['—'];
    const height = INFO_ROW_BASE_H + lines.length * INFO_LINE_H;
    infoRows.push({ label, valueLines: lines, x: contentX, y: cursorY, width: contentW, height });
    cursorY += height + opts.rowGap;
  };
  const description = (card.cardDescription ?? '').trim();
  if (description.length > 0) pushInfoRow('Description', description, 5);
  pushInfoRow('Project goal', (card.goalNames ?? []).join(' · '), 3);
  pushInfoRow('Stakeholders', (card.stakeholders ?? []).map((s) => s.name).join(' · '), 3);
  // Convert the trailing row gap into a section gap before the next section.
  if (infoRows.length > 0) cursorY += SECTION_GAP - opts.rowGap;

  const sectionHeaders: SectionHeader[] = [];
  const pushHeader = (label: string): void => {
    sectionHeaders.push({ label, x: contentX, y: cursorY, width: contentW, height: SECTION_HEADER_H });
    cursorY += SECTION_HEADER_H + 8;
  };

  // 3. Milestones — timeline markers, wrapped left→right.
  const milestones: MilestoneMarker[] = [];
  if (card.milestones.length > 0) {
    pushHeader('Milestones');
    const perRow = Math.max(1, Math.floor((contentW + MILESTONE_GAP) / (MILESTONE_W + MILESTONE_GAP)));
    const rowStartY = cursorY;
    card.milestones.forEach((m, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      milestones.push({
        id: m.id,
        name: m.name,
        date: m.date,
        archimateClass: ARCHIMATE_CLASS.MILESTONE,
        x: contentX + col * (MILESTONE_W + MILESTONE_GAP),
        y: rowStartY + row * (MILESTONE_H + opts.rowGap),
        width: MILESTONE_W,
        height: MILESTONE_H,
      });
    });
    const rows = Math.ceil(card.milestones.length / perRow);
    cursorY = rowStartY + rows * (MILESTONE_H + opts.rowGap) - opts.rowGap + SECTION_GAP;
  }

  // 4. Motivation chain — Factors | Goals | Changes columns.
  const chainEdges: ChainEdge[] = [];
  const factorsCol: ChainNode[] = [];
  const goalsCol: ChainNode[] = [];
  const changesCol: ChainNode[] = [];
  const { factors, goals, changes } = card.motivation;
  if (factors.length + goals.length + changes.length > 0) {
    pushHeader('Motivation — Factors → Goals → Changes');
    const colW = (contentW - opts.columnGap * 2) / 3;
    const colX = [contentX, contentX + colW + opts.columnGap, contentX + (colW + opts.columnGap) * 2];
    const colStartY = cursorY;

    const stack = (items: { id: string; name: string }[], colIndex: number, into: ChainNode[]) => {
      items.forEach((it, i) => {
        into.push({
          id: it.id,
          name: it.name,
          x: colX[colIndex],
          y: colStartY + i * (CHAIN_NODE_H + opts.rowGap),
          width: colW,
          height: CHAIN_NODE_H,
        });
      });
    };
    stack(factors, 0, factorsCol);
    stack(goals, 1, goalsCol);
    stack(changes, 2, changesCol);

    // Edges: factor→goal (goal.factorIds), goal→change (change.goalIds).
    const factorIds = new Set(factorsCol.map((n) => n.id));
    const goalIds = new Set(goalsCol.map((n) => n.id));
    for (const g of goals) {
      for (const fid of g.factorIds) {
        if (factorIds.has(fid)) chainEdges.push({ sourceId: fid, targetId: g.id });
      }
    }
    for (const c of changes) {
      for (const gid of c.goalIds) {
        if (goalIds.has(gid)) chainEdges.push({ sourceId: gid, targetId: c.id });
      }
    }

    const tallest = Math.max(factorsCol.length, goalsCol.length, changesCol.length);
    cursorY = colStartY + tallest * (CHAIN_NODE_H + opts.rowGap) - opts.rowGap + SECTION_GAP;
  }

  // 5. Child activities — full-width rows.
  const childActivities: ChildActivityRow[] = [];
  if (card.childActivities.length > 0) {
    pushHeader('Child activities');
    const rowStartY = cursorY;
    card.childActivities.forEach((a, i) => {
      const metaBits: string[] = [];
      if (a.start_date || a.end_date) metaBits.push(`${a.start_date ?? '?'} → ${a.end_date ?? '?'}`);
      if (a.owner) metaBits.push(a.owner);
      childActivities.push({
        id: a.id,
        name: a.name,
        archimateClass: ARCHIMATE_CLASS.ACTIVITY,
        meta: metaBits.join(' · '),
        x: contentX,
        y: rowStartY + i * (CHILD_ROW_H + opts.rowGap),
        width: contentW,
        height: CHILD_ROW_H,
      });
    });
    cursorY =
      rowStartY + card.childActivities.length * (CHILD_ROW_H + opts.rowGap) - opts.rowGap + SECTION_GAP;
  }

  const totalHeight = cursorY - SECTION_GAP + PAD;

  return {
    bounds: { x: 0, y: 0, width: opts.cardWidth, height: Math.max(totalHeight, PAD * 2 + TITLE_H) },
    title,
    dateFields,
    infoRows,
    sectionHeaders,
    milestones,
    chainColumns: { factors: factorsCol, goals: goalsCol, changes: changesCol },
    chainEdges,
    childActivities,
  };
}
