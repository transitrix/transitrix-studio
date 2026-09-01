// Scope filtering for hierarchical / relational previews (Goals, FGA, FGCA).
//
// A `Scope` trims what a preview renders to part of the hierarchy:
//   - 'all'   → everything (default, today's behaviour)
//   - 'level' → only goals at or below a level cap, plus the factors /
//               changes / activities that touch a visible goal
//   - 'root'  → only a chosen goal's subtree (Goals: descendants via
//               parent_id; FGA/FGCA goals are flat, so the subtree is the
//               single root goal), plus its connected factors / changes /
//               activities
//
// This is intentionally a small, pure rendering primitive: a role's view in
// a future access-control layer (DSM) can be expressed as a level cap or a
// subtree root and reuse exactly this filter. No RBAC here — just the filter.

import type { ValidationWarning } from './validation-types.js';

export type Scope =
  | { mode: 'all' }
  | { mode: 'level'; maxLevel: number }
  | { mode: 'root'; rootGoalId: string };

/** Column filters on a DGCA/DGA chain. Empty / omitted id = All for that column. */
export type ChainColumnKey = 'driverId' | 'goalId' | 'changeId' | 'activityId';

export type ChainScope = {
  mode: 'chain';
  driverId?: string;
  goalId?: string;
  changeId?: string;
  activityId?: string;
};

/** Scope accepted by DGCA/DGA layout — Goals tree still uses {@link Scope} only. */
export type FgcaScope = Scope | ChainScope;

/** Default scope — render everything. */
export const SCOPE_ALL: Scope = { mode: 'all' };

export function isChainScope(scope: FgcaScope): scope is ChainScope {
  return scope.mode === 'chain';
}

/** True when at least one column filter is set. */
export function chainScopeActive(scope: ChainScope): boolean {
  return !!(scope.driverId || scope.goalId || scope.changeId || scope.activityId);
}

/** Warning code emitted when a root-mode scope names a goal that isn't in the document. */
export const SCOPE_MISSING_ROOT_CODE = 'SCOPE-001';

/** Warning code emitted when a chain-column filter names an id that isn't in the document. */
export const SCOPE_MISSING_CHAIN_CODE = 'SCOPE-002';

/**
 * Returns the SCOPE-001 warning when `scope` is root-mode and `rootGoalId` is
 * not among the document's goal ids; otherwise null. Goal ids are compared as
 * strings so numeric (FGCA/Goals) and string ids both work.
 *
 * Previews call this to surface the warning in their panel — the layout
 * functions independently return an empty layout in the same situation.
 */
export function checkScopeRoot(scope: Scope, goalIds: Iterable<string | number>): ValidationWarning | null {
  if (scope.mode !== 'root') return null;
  for (const id of goalIds) {
    if (String(id) === scope.rootGoalId) return null;
  }
  return {
    code: SCOPE_MISSING_ROOT_CODE,
    message: `Scope root goal "${scope.rootGoalId}" was not found in this document — nothing to show. Clear the scope or pick a goal that exists.`,
  };
}

function idSetHas(ids: Iterable<string | number>, want: string): boolean {
  for (const id of ids) {
    if (String(id) === want) return true;
  }
  return false;
}

/**
 * Returns a SCOPE-002 warning when a chain filter names an id that is not in
 * the document's corresponding column; otherwise null. Several missing ids
 * are listed in one message.
 */
export function checkChainScope(
  scope: ChainScope,
  ids: {
    drivers: Iterable<string | number>;
    goals: Iterable<string | number>;
    changes: Iterable<string | number>;
    activities: Iterable<string | number>;
  },
  hideChanges = false,
): ValidationWarning | null {
  if (scope.mode !== 'chain') return null;
  const missing: string[] = [];
  if (scope.driverId && !idSetHas(ids.drivers, scope.driverId)) missing.push(`driver "${scope.driverId}"`);
  if (scope.goalId && !idSetHas(ids.goals, scope.goalId)) missing.push(`goal "${scope.goalId}"`);
  if (!hideChanges && scope.changeId && !idSetHas(ids.changes, scope.changeId)) missing.push(`change "${scope.changeId}"`);
  if (scope.activityId && !idSetHas(ids.activities, scope.activityId)) missing.push(`action "${scope.activityId}"`);
  if (missing.length === 0) return null;
  return {
    code: SCOPE_MISSING_CHAIN_CODE,
    message: `Scope ${missing.join(', ')} was not found in this document — nothing to show for that filter. Clear the scope or pick an id that exists.`,
  };
}
