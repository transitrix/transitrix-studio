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
    sectionHeaders,
    milestones,
    chainColumns: { factors: factorsCol, goals: goalsCol, changes: changesCol },
    chainEdges,
    childActivities,
  };
}
