// Pure column-layout geometry for the static DGCA / DGA previews.
//
// This is the layout the Studio extension's `dgca-preview.ts` renders to SVG
// (NOT the ReactFlow `buildFGCALayout` in `./layout.ts`, which targets the
// interactive web UI). It lives here — rather than inline in the extension —
// so the gap geometry is unit-testable: the extension has no test harness.
//
// No React, no DOM, no vscode. Safe to call in Node.js or a test environment.

import type { Scope } from '../scope.js';
import { ENTITY_NODE_SIZE } from '../node-size-presets.js';

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

/** Structural input the preview layout needs — a subset of the parsed DGCA/DGA doc. */
export interface FGCAPreviewDoc {
  factors: FGCAPreviewFactor[];
  goals: FGCAPreviewGoal[];
  changes?: FGCAPreviewChange[];
  activities: FGCAPreviewActivity[];
}

export interface FGCAPreviewLayoutOptions {
  /** DGA hides the Changes column and links Goal → Activity directly. */
  hideChanges?: boolean;
  /** Horizontal gap (px) between columns. Default matches the historical hardcoded value. */
  colGap?: number;
  /** Vertical gap (px) between stacked nodes within a column. Default matches the historical hardcoded value. */
  rowGap?: number;
  /** Trim to a level cap or a single root goal (vkgeorgia/strategy#77). Defaults to 'all'. */
  scope?: Scope;
  /** Entity node width (px). Default {@link FGCA_NODE_W}. */
  nodeWidth?: number;
  /** Entity node height (px). Default {@link FGCA_NODE_H}. */
  nodeHeight?: number;
}

/**
 * Trims a DGCA/DGA doc to a scope.
 *
 * DGCA/DGA goals are flat (no parent_id), so:
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

// Default node + frame geometry. Inter-node gaps are user-configurable via
// Inter-node gaps are user-configurable via spacing settings; node size uses presets.
export const FGCA_NODE_W = ENTITY_NODE_SIZE.normal.width;
export const FGCA_NODE_H = ENTITY_NODE_SIZE.normal.height;
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
    nodeWidth = FGCA_NODE_W,
    nodeHeight = FGCA_NODE_H,
  } = options;

  // Trim to scope first; everything below lays out the visible subset only.
  const doc = selectScopedFGCA(inputDoc, scope);

  const colStride = nodeWidth + colGap;
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

  // Build predecessor map: for each node, which node IDs in the previous column
  // connect to it from the left. Used for barycenter crossing minimization.
  const predecessors = new Map<string, string[]>();
  for (const g of doc.goals) {
    predecessors.set(`goal_${g.id}`, (g.factor ?? []).map(f => `driver_${f.id}`));
  }
  if (!hideChanges) {
    for (const c of changes) {
      predecessors.set(`change_${c.id}`, [`goal_${c.goal_id}`]);
    }
    const coveredActs = new Set(changes.flatMap(c => c.activity_ids.map(String)));
    for (const a of doc.activities) {
      const preds = changes
        .filter(c => c.activity_ids.map(String).includes(String(a.id)))
        .map(c => `change_${c.id}`);
      if (a.goal_id != null && !coveredActs.has(String(a.id))) preds.push(`goal_${a.goal_id}`);
      predecessors.set(`activity_${a.id}`, preds);
    }
  } else {
    const connectedViaChange = new Set<string>();
    for (const c of changes) {
      for (const aid of c.activity_ids) {
        predecessors.set(`activity_${aid}`, [`goal_${c.goal_id}`]);
        connectedViaChange.add(String(aid));
      }
    }
    for (const a of doc.activities) {
      if (a.goal_id != null && !connectedViaChange.has(String(a.id))) {
        predecessors.set(`activity_${a.id}`, [`goal_${a.goal_id}`]);
      }
    }
  }

  // Sort a column's items by the barycenter of their predecessors' y-centres.
  // Nodes with no predecessors sort last (Infinity barycenter) so they don't
  // displace connected nodes.
  function barycentricSort(
    items: Array<{ id: string; label: string }>,
    yCenters: Map<string, number>,
  ): Array<{ id: string; label: string }> {
    return [...items].sort((a, b) => {
      const pA = (predecessors.get(a.id) ?? []).map(p => yCenters.get(p) ?? 0).filter(v => v > 0);
      const pB = (predecessors.get(b.id) ?? []).map(p => yCenters.get(p) ?? 0).filter(v => v > 0);
      const bcA = pA.length > 0 ? pA.reduce((s, v) => s + v, 0) / pA.length : Infinity;
      const bcB = pB.length > 0 ? pB.reduce((s, v) => s + v, 0) / pB.length : Infinity;
      return bcA - bcB;
    });
  }

  const nodeMap = new Map<string, FGCAPreviewNode>();
  const nodes: FGCAPreviewNode[] = [];
  const columns: FGCAPreviewColumnPos[] = [];
  const yCenters = new Map<string, number>(); // nodeId → y + nodeHeight / 2

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const x = FGCA_PAD + ci * colStride;
    columns.push({ col, x });
    const items = ci === 0 ? colItems[col] : barycentricSort(colItems[col], yCenters);
    let y = FGCA_PAD + FGCA_HEADER_H + rowGap;
    for (const item of items) {
      const node: FGCAPreviewNode = { id: item.id, x, y, label: item.label, col };
      nodes.push(node);
      nodeMap.set(item.id, node);
      yCenters.set(item.id, y + nodeHeight / 2);
      y += nodeHeight + rowGap;
    }
  }

  const edges: FGCAPreviewEdge[] = [];
  function addEdge(sourceId: string, targetId: string): void {
    const s = nodeMap.get(sourceId);
    const t = nodeMap.get(targetId);
    if (!s || !t) return;
    edges.push({ sx: s.x + nodeWidth, sy: s.y + nodeHeight / 2, tx: t.x, ty: t.y + nodeHeight / 2 });
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
    (m, n) => Math.max(m, n.y + nodeHeight),
    FGCA_PAD + FGCA_HEADER_H + rowGap + nodeHeight,
  );
  const width = FGCA_PAD * 2 + cols.length * colStride - colGap;
  const height = maxNodeBottom + FGCA_PAD;

  return { nodes, edges, columns, width, height };
}
