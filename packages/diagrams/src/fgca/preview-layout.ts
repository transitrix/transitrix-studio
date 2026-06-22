// Pure column-layout geometry for the static FGCA / FGA previews.
//
// This is the layout the Studio extension's `fgca-preview.ts` renders to SVG
// (NOT the ReactFlow `buildFGCALayout` in `./layout.ts`, which targets the
// interactive web UI). It lives here — rather than inline in the extension —
// so the gap geometry is unit-testable: the extension has no test harness.
//
// No React, no DOM, no vscode. Safe to call in Node.js or a test environment.

import type { Scope } from '../scope.js';

export type FGCAPreviewColumn = 'driver' | 'goal' | 'change' | 'activity';

export interface FGCAPreviewFactor {
  id: number | string;
  name: string;
}
export interface FGCAPreviewGoal {
  id: number | string;
  name: string;
  level?: number;
  factor?: Array<{ id: number | string }>;
}
export interface FGCAPreviewChange {
  id: number | string;
  name: string;
  goal_id: number | string;
  activity_ids: Array<number | string>;
}
export interface FGCAPreviewActivity {
  id: number | string;
  name: string;
  goal_id?: number | string | null;
}

/** Structural input the preview layout needs — a subset of the parsed FGCA/FGA doc. */
export interface FGCAPreviewDoc {
  factors: FGCAPreviewFactor[];
  goals: FGCAPreviewGoal[];
  changes?: FGCAPreviewChange[];
  activities: FGCAPreviewActivity[];
}

export interface FGCAPreviewLayoutOptions {
  /** FGA hides the Changes column and links Goal → Activity directly. */
  hideChanges?: boolean;
  /** Horizontal gap (px) between columns. Default matches the historical hardcoded value. */
  colGap?: number;
  /** Vertical gap (px) between stacked nodes within a column. Default matches the historical hardcoded value. */
  rowGap?: number;
  /** Trim to a level cap or a single root goal (vkgeorgia/strategy#77). Defaults to 'all'. */
  scope?: Scope;
}

/**
 * Trims an FGCA/FGA doc to a scope (vkgeorgia/strategy#77).
 *
 * FGCA/FGA goals are flat (no parent_id), so:
 *   - 'level' → goals with `(level ?? 0) <= maxLevel`.
 *   - 'root'  → the single goal whose id matches `rootGoalId` (empty when absent).
 *
 * Factors, changes and activities are then kept only when they touch a visible
 * goal: a factor referenced by a visible goal, a change whose `goal_id` is
 * visible, an activity bound to a visible goal directly or via a visible
 * change. Pure and exported so an access-control layer can reuse it.
 */
export function selectScopedFGCA(doc: FGCAPreviewDoc, scope: Scope): FGCAPreviewDoc {
  if (scope.mode === 'all') return doc;

  const visibleGoals =
    scope.mode === 'level'
      ? doc.goals.filter(g => (g.level ?? 0) <= scope.maxLevel)
      : doc.goals.filter(g => String(g.id) === scope.rootGoalId);

  const visibleGoalIds = new Set(visibleGoals.map(g => g.id));

  const changes = doc.changes ?? [];
  const visibleChanges = changes.filter(c => visibleGoalIds.has(c.goal_id));
  const activityIdsViaChange = new Set(visibleChanges.flatMap(c => c.activity_ids));

  const visibleActivities = doc.activities.filter(
    a => (a.goal_id != null && visibleGoalIds.has(a.goal_id)) || activityIdsViaChange.has(a.id),
  );

  const factorIds = new Set(visibleGoals.flatMap(g => (g.factor ?? []).map(f => f.id)));
  const visibleFactors = doc.factors.filter(f => factorIds.has(f.id));

  return {
    factors: visibleFactors,
    goals: visibleGoals,
    changes: doc.changes === undefined ? undefined : visibleChanges,
    activities: visibleActivities,
  };
}

export interface FGCAPreviewNode {
  id: string;
  x: number;
  y: number;
  label: string;
  col: FGCAPreviewColumn;
}
export interface FGCAPreviewEdge {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}
/** Per-column header anchor — lets the renderer draw column headers without recomputing the stride. */
export interface FGCAPreviewColumnPos {
  col: FGCAPreviewColumn;
  x: number;
}
export interface FGCAPreviewLayout {
  nodes: FGCAPreviewNode[];
  edges: FGCAPreviewEdge[];
  columns: FGCAPreviewColumnPos[];
  width: number;
  height: number;
}

// Fixed node + frame geometry. Only the inter-node gaps are user-configurable
// (vkgeorgia/strategy#75); node size and padding stay constant.
export const FGCA_NODE_W = 220;
export const FGCA_NODE_H = 72;
export const FGCA_HEADER_H = 32;
export const FGCA_PAD = 20;
export const FGCA_DEFAULT_COL_GAP = 160;
export const FGCA_DEFAULT_ROW_GAP = 20;

export function layoutFGCAPreview(
  inputDoc: FGCAPreviewDoc,
  options: FGCAPreviewLayoutOptions = {},
): FGCAPreviewLayout {
  const {
    hideChanges = false,
    colGap = FGCA_DEFAULT_COL_GAP,
    rowGap = FGCA_DEFAULT_ROW_GAP,
    scope = { mode: 'all' },
  } = options;

  // Trim to scope first; everything below lays out the visible subset only.
  const doc = selectScopedFGCA(inputDoc, scope);

  const colStride = FGCA_NODE_W + colGap;
  const cols: FGCAPreviewColumn[] = hideChanges
    ? ['driver', 'goal', 'activity']
    : ['driver', 'goal', 'change', 'activity'];
  const changes = doc.changes ?? [];
  const colItems: Record<FGCAPreviewColumn, Array<{ id: string; label: string }>> = {
    driver:   doc.factors.map(f => ({ id: `driver_${f.id}`,     label: f.name })),
    goal:     doc.goals.map(g   => ({ id: `goal_${g.id}`,       label: g.name })),
    change:   changes.map(c     => ({ id: `change_${c.id}`,     label: c.name })),
    activity: doc.activities.map(a => ({ id: `activity_${a.id}`, label: a.name })),
  };

  const nodeMap = new Map<string, FGCAPreviewNode>();
  const nodes: FGCAPreviewNode[] = [];
  const columns: FGCAPreviewColumnPos[] = [];

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const x = FGCA_PAD + ci * colStride;
    columns.push({ col, x });
    let y = FGCA_PAD + FGCA_HEADER_H + rowGap;
    for (const item of colItems[col]) {
      const node: FGCAPreviewNode = { id: item.id, x, y, label: item.label, col };
      nodes.push(node);
      nodeMap.set(item.id, node);
      y += FGCA_NODE_H + rowGap;
    }
  }

  const edges: FGCAPreviewEdge[] = [];
  function addEdge(sourceId: string, targetId: string): void {
    const s = nodeMap.get(sourceId);
    const t = nodeMap.get(targetId);
    if (!s || !t) return;
    edges.push({ sx: s.x + FGCA_NODE_W, sy: s.y + FGCA_NODE_H / 2, tx: t.x, ty: t.y + FGCA_NODE_H / 2 });
  }

  for (const g of doc.goals) {
    for (const f of (g.factor ?? [])) addEdge(`driver_${f.id}`, `goal_${g.id}`);
  }
  if (hideChanges) {
    const connectedViaChange = new Set<number | string>();
    for (const c of changes) {
      for (const aid of c.activity_ids) {
        addEdge(`goal_${c.goal_id}`, `activity_${aid}`);
        connectedViaChange.add(aid);
      }
    }
    for (const a of doc.activities) {
      if (a.goal_id != null && !connectedViaChange.has(a.id)) {
        addEdge(`goal_${a.goal_id}`, `activity_${a.id}`);
      }
    }
  } else {
    for (const c of changes) addEdge(`goal_${c.goal_id}`, `change_${c.id}`);
    for (const c of changes) for (const aid of c.activity_ids) addEdge(`change_${c.id}`, `activity_${aid}`);
    const coveredActivities = new Set(changes.flatMap(c => c.activity_ids));
    for (const a of doc.activities) {
      if (a.goal_id != null && !coveredActivities.has(a.id)) {
        addEdge(`goal_${a.goal_id}`, `activity_${a.id}`);
      }
    }
  }

  const maxNodeBottom = nodes.reduce(
    (m, n) => Math.max(m, n.y + FGCA_NODE_H),
    FGCA_PAD + FGCA_HEADER_H + rowGap + FGCA_NODE_H,
  );
  const width = FGCA_PAD * 2 + cols.length * colStride - colGap;
  const height = maxNodeBottom + FGCA_PAD;

  return { nodes, edges, columns, width, height };
}
