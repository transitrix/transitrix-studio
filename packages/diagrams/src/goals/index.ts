export type {
  Goal,
  GoalType,
  GoalTree,
  ImpactType,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  MutationResult,
  LayoutOptions,
  LaidOutNode,
  LaidOutEdge,
  GoalTreeLayout,
} from './types.js';

export { validateGoalTree } from './validate.js';
export { parseCanonicalGoals } from './parse-canonical.js';
export type { CanonicalGoalsResult } from './parse-canonical.js';
export { resolveGoals, isGoalsViewDoc } from './resolver.js';
export type { GoalsViewConfig, GoalsCanonSources } from './resolver.js';
export { layoutGoalTree, selectScopedGoals } from './layout.js';
export { reparent, addChild, deleteWithDescendants, moveToBacklog, restoreFromBacklog } from './mutations.js';

export { GoalTreeView } from './GoalTreeView.js';
export type { GoalTreeViewProps, GoalTreeChange } from './GoalTreeView.js';
export type { ThemeTokens } from './theme.js';
