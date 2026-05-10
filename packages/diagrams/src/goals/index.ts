export type {
  Goal,
  GoalType,
  GoalTree,
  Factor,
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
export { layoutGoalTree } from './layout.js';
export { reparent, addChild, deleteWithDescendants, moveToBacklog, restoreFromBacklog } from './mutations.js';
