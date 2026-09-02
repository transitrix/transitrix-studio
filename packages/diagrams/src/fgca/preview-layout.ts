// Pure column-layout geometry for the static DGCA / DGA previews.
//
// This is the layout the Studio extension's `dgca-preview.ts` renders to SVG
// (NOT the ReactFlow `buildFGCALayout` in `./layout.ts`, which targets the
// interactive web UI). It lives here — rather than inline in the extension —
// so the gap geometry is unit-testable: the extension has no test harness.
//
// No React, no DOM, no vscode. Safe to call in Node.js or a test environment.

import type { ChainColumnKey, ChainScope, FgcaScope } from '../scope.js';
import { isChainScope } from '../scope.js';
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
  progress?: {
    percent: number;
    computedAt: string;
  };
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
  /** Trim to a level cap, a single root goal, or per-column chain filters. Defaults to 'all'. */
  scope?: FgcaScope;
  /** Entity node width (px). Default {@link FGCA_NODE_W}. */
  nodeWidth?: number;
  /** Entity node height (px). Default {@link FGCA_NODE_H}. */
  nodeHeight?: number;
}

function sid(id: number | string): string {
  return String(id);
}

interface ChainPath {
  driverId?: string;
  goalId?: string;
  changeId?: string;
  activityId?: string;
}

/**
 * Every Driver–Goal–Change–Action thread in the document, plus a singleton
 * path for any entity that is not on a connected thread (orphans). Used to
 * AND column filters: a node stays visible when it appears on at least one
 * path that includes every selected id.
 */
function enumerateChainPaths(doc: FGCAPreviewDoc): ChainPath[] {
  const paths: ChainPath[] = [];
  const seen = {
    driver: new Set<string>(),
    goal: new Set<string>(),
    change: new Set<string>(),
    activity: new Set<string>(),
  };
  const mark = (p: ChainPath): void => {
    paths.push(p);
    if (p.driverId) seen.driver.add(p.driverId);
    if (p.goalId) seen.goal.add(p.goalId);
    if (p.changeId) seen.change.add(p.changeId);
    if (p.activityId) seen.activity.add(p.activityId);
  };

  const changes = doc.changes ?? [];

  for (const g of doc.goals) {
    const goalId = sid(g.id);
    const driverIds = (g.factor ?? []).map(f => sid(f.id));
    const drivers: Array<string | undefined> = driverIds.length > 0 ? driverIds : [undefined];

    const goalChanges = changes.filter(c => sid(c.goal_id) === goalId);
    const coveredActs = new Set(goalChanges.flatMap(c => c.activity_ids.map(sid)));
    const directActs = doc.activities.filter(
      a => a.goal_id != null && sid(a.goal_id) === goalId && !coveredActs.has(sid(a.id)),
    );

    const slots: Array<{ changeId?: string; activityIds: Array<string | undefined> }> = [];
    for (const c of goalChanges) {
      const acts = c.activity_ids.map(sid);
      slots.push({ changeId: sid(c.id), activityIds: acts.length > 0 ? acts : [undefined] });
    }
    for (const a of directActs) {
      slots.push({ changeId: undefined, activityIds: [sid(a.id)] });
    }
    if (slots.length === 0) {
      slots.push({ changeId: undefined, activityIds: [undefined] });
    }

    for (const d of drivers) {
      for (const slot of slots) {
        for (const a of slot.activityIds) {
          mark({ driverId: d, goalId, changeId: slot.changeId, activityId: a });
        }
      }
    }
  }

  for (const f of doc.factors) {
    const id = sid(f.id);
    if (!seen.driver.has(id)) mark({ driverId: id });
  }
  for (const g of doc.goals) {
    const id = sid(g.id);
    if (!seen.goal.has(id)) mark({ goalId: id });
  }
  for (const c of changes) {
    const id = sid(c.id);
    if (!seen.change.has(id)) mark({ changeId: id, goalId: sid(c.goal_id) });
  }
  for (const a of doc.activities) {
    const id = sid(a.id);
    if (!seen.activity.has(id)) {
      mark({ activityId: id, goalId: a.goal_id != null ? sid(a.goal_id) : undefined });
    }
  }

  return paths;
}

function selectChainScopedFGCA(
  doc: FGCAPreviewDoc,
  scope: ChainScope,
  hideChanges: boolean,
): FGCAPreviewDoc {
  const driverId = scope.driverId || undefined;
  const goalId = scope.goalId || undefined;
  const changeId = hideChanges ? undefined : (scope.changeId || undefined);
  const activityId = scope.activityId || undefined;
  if (!driverId && !goalId && !changeId && !activityId) return doc;

  const matched = enumerateChainPaths(doc).filter(p => {
    if (driverId && p.driverId !== driverId) return false;
    if (goalId && p.goalId !== goalId) return false;
    if (changeId && p.changeId !== changeId) return false;
    if (activityId && p.activityId !== activityId) return false;
    return true;
  });

  const driverIds = new Set<string>();
  const goalIds = new Set<string>();
  const changeIds = new Set<string>();
  const activityIds = new Set<string>();
  for (const p of matched) {
    if (p.driverId) driverIds.add(p.driverId);
    if (p.goalId) goalIds.add(p.goalId);
    if (p.changeId) changeIds.add(p.changeId);
    if (p.activityId) activityIds.add(p.activityId);
  }

  return {
    factors: doc.factors.filter(f => driverIds.has(sid(f.id))),
    goals: doc.goals.filter(g => goalIds.has(sid(g.id))),
    changes: doc.changes === undefined ? undefined : doc.changes.filter(c => changeIds.has(sid(c.id))),
    activities: doc.activities.filter(a => activityIds.has(sid(a.id))),
  };
}

const CHAIN_COLUMN_KEYS: ChainColumnKey[] = ['driverId', 'goalId', 'changeId', 'activityId'];

function columnEntities(
  doc: FGCAPreviewDoc,
  column: ChainColumnKey,
): Array<{ id: string; name: string }> {
  if (column === 'driverId') return doc.factors.map(f => ({ id: sid(f.id), name: f.name ?? '' }));
  if (column === 'goalId') return doc.goals.map(g => ({ id: sid(g.id), name: g.name ?? '' }));
  if (column === 'changeId') return (doc.changes ?? []).map(c => ({ id: sid(c.id), name: c.name ?? '' }));
  return doc.activities.map(a => ({ id: sid(a.id), name: a.name ?? '' }));
}

/**
 * Dropdown options for one chain column, cascaded from the other selected
 * filters (this column's own filter is ignored so the user can still switch it).
 */
export function chainColumnOptions(
  doc: FGCAPreviewDoc,
  scope: ChainScope,
  column: ChainColumnKey,
  hideChanges = false,
): Array<{ id: string; name: string }> {
  if (hideChanges && column === 'changeId') return [];
  const withoutSelf: ChainScope = { ...scope, mode: 'chain', [column]: undefined };
  const filtered = selectChainScopedFGCA(doc, withoutSelf, hideChanges);
  return columnEntities(filtered, column);
}

/**
 * Drop column filters that are no longer reachable given the others.
 * `justChanged` is kept even when incompatible — the last pick wins, neighbours yield.
 */
export function sanitizeChainScope(
  doc: FGCAPreviewDoc,
  scope: ChainScope,
  opts: { justChanged?: ChainColumnKey; hideChanges?: boolean } = {},
): ChainScope {
  const next: ChainScope = {
    mode: 'chain',
    driverId: scope.driverId || undefined,
    goalId: scope.goalId || undefined,
    changeId: opts.hideChanges ? undefined : (scope.changeId || undefined),
    activityId: scope.activityId || undefined,
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const key of CHAIN_COLUMN_KEYS) {
      if (key === opts.justChanged) continue;
      if (opts.hideChanges && key === 'changeId') continue;
      const id = next[key];
      if (!id) continue;
      const available = new Set(chainColumnOptions(doc, next, key, opts.hideChanges).map(o => o.id));
      if (!available.has(id)) {
        next[key] = undefined;
        changed = true;
      }
    }
  }
  return next;
}

/**
 * Trims a DGCA/DGA doc to a scope.
 *
 * DGCA/DGA goals are flat (no parent_id), so:
 *   - 'level' → goals with `(level ?? 0) <= maxLevel`.
 *   - 'root'  → the single goal whose id matches `rootGoalId` (empty when absent).
 *   - 'chain' → AND of per-column ids (Driver / Goal / Change / Action); empty
 *               ids are All. DGA passes hideChanges so a Change filter is ignored.
 *
 * Factors, changes and activities are then kept only when they touch a visible
 * goal: a factor referenced by a visible goal, a change whose `goal_id` is
 * visible, an activity bound to a visible goal directly or via a visible
 * change. Pure and exported so an access-control layer can reuse it.
 */
export function selectScopedFGCA(
  doc: FGCAPreviewDoc,
  scope: FgcaScope,
  opts: { hideChanges?: boolean } = {},
): FGCAPreviewDoc {
  if (scope.mode === 'all') return doc;
  if (isChainScope(scope)) {
    return selectChainScopedFGCA(doc, scope, opts.hideChanges === true);
  }

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
  type?: string;
  progress?: {
    percent: number;
    computedAt: string;
  };
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
  const doc = selectScopedFGCA(inputDoc, scope, { hideChanges });

  const colStride = nodeWidth + colGap;
  const cols: FGCAPreviewColumn[] = hideChanges
    ? ['driver', 'goal', 'activity']
    : ['driver', 'goal', 'change', 'activity'];
  const changes = doc.changes ?? [];
  const colItems: Record<FGCAPreviewColumn, Array<{ id: string; label: string; type?: string; progress?: { percent: number; computedAt: string } }>> = {
    driver:   doc.factors.map(f => ({ id: `driver_${f.id}`,     label: f.name })),
    goal:     doc.goals.map(g   => ({ id: `goal_${g.id}`,       label: g.name })),
    change:   changes.map(c     => ({ id: `change_${c.id}`,     label: c.name })),
    activity: doc.activities.map(a => ({ id: `activity_${a.id}`, label: a.name, type: a.type, progress: a.progress })),
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
    items: Array<{ id: string; label: string; type?: string; progress?: { percent: number; computedAt: string } }>,
    yCenters: Map<string, number>,
  ): Array<{ id: string; label: string; type?: string; progress?: { percent: number; computedAt: string } }> {
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
      const node: FGCAPreviewNode = { id: item.id, x, y, label: item.label, col, type: item.type, progress: item.progress };
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
