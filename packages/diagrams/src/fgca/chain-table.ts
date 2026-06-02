// Chain-table model for the FGCA / FGA previews (vkgeorgia/strategy#137).
//
// The tree/chain preview (`layoutFGCAPreview`) shows Factor → Goal → Change →
// Activity as columns of nodes joined by edges. This module produces the
// *tabular* alternative: the same chain flattened into rows, with shared
// parents collapsed into vertically-merged (rowspan) cells.
//
// It is the pure, unit-testable half of the feature — no DOM, no vscode. The
// Studio preview renders the returned model as an HTML `<table>`.
//
// Link semantics mirror `layoutFGCAPreview` exactly (the authoritative source):
//   - F → G via `goal.factor[]`
//   - G → C via `change.goal_id`            (FGCA only)
//   - C → A via `change.activity_ids[]`     (FGCA only)
//   - G → A directly via `activity.goal_id` for activities not covered by any
//     change (FGCA) / for every activity (FGA, no Change column)
//
// Broken references are validation *warnings*, not errors, so a rendered doc
// can contain a goal with a missing factor, a change with a missing goal, or an
// unlinked activity. Every element still appears in the table — rooted where it
// links, or as a trailing orphan row with empty cells to its left — so the
// table mirrors the document the same way the tree does.

import type { FGCAPreviewDoc } from './preview-layout.js';

export type ChainColumn = 'factor' | 'goal' | 'change' | 'activity';

export interface ChainCell {
  /** Column-qualified identity (e.g. "goal:3") — stable, unique across columns. */
  key: string;
  /** Display text — the element name, falling back to its id. */
  label: string;
}

export interface ChainTableCell {
  /** The element to render, or null for a gap in the chain (empty cell). */
  cell: ChainCell | null;
  /** Vertical span — how many rows this cell covers. */
  rowSpan: number;
}

export interface ChainTable {
  /** Columns left→right: FGA omits 'change'. */
  columns: ChainColumn[];
  /**
   * Grid of rendered cells. `rows[r][c]` is the cell to emit at (r, c), or null
   * when that position is covered by a `rowSpan` from a row above (emit no
   * `<td>`). Each row corresponds to one path through the chain.
   */
  rows: Array<Array<ChainTableCell | null>>;
}

export interface ChainTableOptions {
  /** FGA hides the Change column (Goal links straight to Activity). */
  hideChanges?: boolean;
}

function cellOf(col: ChainColumn, id: number | string, name: string): ChainCell {
  const label = name && name.trim() ? name : String(id);
  return { key: `${col}:${id}`, label };
}

/** Identity comparison for the rowspan grouping; both-null counts as equal. */
function sameCell(a: ChainCell | null, b: ChainCell | null): boolean {
  if (a === null || b === null) return a === b;
  return a.key === b.key;
}

/**
 * Flattens an FGCA/FGA doc into a chain table with rowspan-merged parent cells.
 *
 * Rows are enumerated in document order (deterministic). A parent that links to
 * several children spans those children's rows; an element with no downstream
 * link still appears, with empty cells to its right.
 */
export function buildChainTable(doc: FGCAPreviewDoc, options: ChainTableOptions = {}): ChainTable {
  const { hideChanges = false } = options;
  const columns: ChainColumn[] = hideChanges
    ? ['factor', 'goal', 'activity']
    : ['factor', 'goal', 'change', 'activity'];

  const changes = doc.changes ?? [];
  const factorIds = new Set(doc.factors.map(f => f.id));
  const activityById = new Map(doc.activities.map(a => [a.id, a] as const));
  // An activity is "covered" by a change when any change lists it — those render
  // under their change, not directly under the goal (mirrors the tree).
  const coveredActivityIds = new Set(changes.flatMap(c => c.activity_ids));

  const emittedGoals = new Set<number | string>();
  const emittedChanges = new Set<number | string>();
  const emittedActivities = new Set<number | string>();

  // Each path is an array (length = columns.length) of ChainCell | null.
  const paths: Array<Array<ChainCell | null>> = [];
  const pad = (cells: Array<ChainCell | null>): Array<ChainCell | null> => {
    // Defensive: ensure every path matches the column count.
    while (cells.length < columns.length) cells.push(null);
    return cells;
  };

  const emitGoal = (factorCell: ChainCell | null, goal: FGCAPreviewDoc['goals'][number]): void => {
    emittedGoals.add(goal.id);
    const goalCell = cellOf('goal', goal.id, goal.name);

    if (hideChanges) {
      const acts = doc.activities.filter(a => a.goal_id != null && a.goal_id === goal.id);
      if (acts.length === 0) {
        paths.push(pad([factorCell, goalCell]));
        return;
      }
      for (const a of acts) {
        emittedActivities.add(a.id);
        paths.push([factorCell, goalCell, cellOf('activity', a.id, a.name)]);
      }
      return;
    }

    const goalChanges = changes.filter(c => c.goal_id === goal.id);
    const directActs = doc.activities.filter(
      a => a.goal_id != null && a.goal_id === goal.id && !coveredActivityIds.has(a.id),
    );

    if (goalChanges.length === 0 && directActs.length === 0) {
      paths.push([factorCell, goalCell, null, null]);
      return;
    }
    for (const c of goalChanges) {
      emittedChanges.add(c.id);
      const changeCell = cellOf('change', c.id, c.name);
      const acts = c.activity_ids.map(id => activityById.get(id)).filter((a): a is NonNullable<typeof a> => a != null);
      if (acts.length === 0) {
        paths.push([factorCell, goalCell, changeCell, null]);
        continue;
      }
      for (const a of acts) {
        emittedActivities.add(a.id);
        paths.push([factorCell, goalCell, changeCell, cellOf('activity', a.id, a.name)]);
      }
    }
    // Change-less paths: activities bound straight to the goal (gap in Change).
    for (const a of directActs) {
      emittedActivities.add(a.id);
      paths.push([factorCell, goalCell, null, cellOf('activity', a.id, a.name)]);
    }
  };

  // Phase 1 — factor-rooted paths.
  for (const f of doc.factors) {
    const factorCell = cellOf('factor', f.id, f.name);
    const goalsOfFactor = doc.goals.filter(g => (g.factor ?? []).some(ref => ref.id === f.id));
    if (goalsOfFactor.length === 0) {
      paths.push(pad([factorCell]));
      continue;
    }
    for (const g of goalsOfFactor) emitGoal(factorCell, g);
  }

  // Phase 2 — goals with no existing factor (orphan or broken-ref): empty Factor.
  for (const g of doc.goals) {
    if (emittedGoals.has(g.id)) continue;
    const hasExistingFactor = (g.factor ?? []).some(ref => factorIds.has(ref.id));
    if (hasExistingFactor) continue; // emitted under its factor in phase 1
    emitGoal(null, g);
  }

  // Phase 3 — changes whose goal is missing (FGCA only): empty Factor + Goal.
  if (!hideChanges) {
    for (const c of changes) {
      if (emittedChanges.has(c.id)) continue;
      emittedChanges.add(c.id);
      const changeCell = cellOf('change', c.id, c.name);
      const acts = c.activity_ids.map(id => activityById.get(id)).filter((a): a is NonNullable<typeof a> => a != null);
      if (acts.length === 0) {
        paths.push([null, null, changeCell, null]);
        continue;
      }
      for (const a of acts) {
        emittedActivities.add(a.id);
        paths.push([null, null, changeCell, cellOf('activity', a.id, a.name)]);
      }
    }
  }

  // Phase 4 — activities linked to nothing: empty cells to their left.
  for (const a of doc.activities) {
    if (emittedActivities.has(a.id)) continue;
    const row: Array<ChainCell | null> = columns.map(() => null);
    row[columns.length - 1] = cellOf('activity', a.id, a.name);
    paths.push(row);
  }

  return { columns, rows: computeRowSpans(paths, columns.length) };
}

/**
 * Turns a flat list of equal-length paths into a render grid. For each column,
 * a cell spans the run of consecutive rows that share identical values in every
 * column from 0 through that column (so a child only merges within one parent).
 */
function computeRowSpans(
  paths: Array<Array<ChainCell | null>>,
  colCount: number,
): Array<Array<ChainTableCell | null>> {
  const n = paths.length;
  const grid: Array<Array<ChainTableCell | null>> = paths.map(() => new Array(colCount).fill(null));

  for (let c = 0; c < colCount; c++) {
    let r = 0;
    while (r < n) {
      let end = r + 1;
      while (end < n && prefixEqual(paths[end], paths[r], c)) end++;
      grid[r][c] = { cell: paths[r][c], rowSpan: end - r };
      r = end;
    }
  }
  return grid;
}

/** True when two paths agree on every column 0..c (inclusive). */
function prefixEqual(a: Array<ChainCell | null>, b: Array<ChainCell | null>, c: number): boolean {
  for (let i = 0; i <= c; i++) {
    if (!sameCell(a[i], b[i])) return false;
  }
  return true;
}
