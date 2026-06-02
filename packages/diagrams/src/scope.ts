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

/** Default scope — render everything. */
export const SCOPE_ALL: Scope = { mode: 'all' };

/** Warning code emitted when a root-mode scope names a goal that isn't in the document. */
export const SCOPE_MISSING_ROOT_CODE = 'SCOPE-001';

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
