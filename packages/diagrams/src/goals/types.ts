export type ImpactType = 'opportunity' | 'positive' | 'risk' | 'negative' | 'mixed';

export interface Factor {
  id: number;
  name: string;
  description?: string;
  segment?: string;
  impact_type: ImpactType;
}

export interface Goal {
  id: number;
  name: string;
  type: string;
  level: number;
  parent_id: number;
  link?: string;
  tag?: string;
  description?: string;
  factors?: Factor[];
  created_at?: string;
}

export interface GoalType {
  name: string;
  level: number;
}

export interface GoalTree {
  goal_types: GoalType[];
  goals: Goal[];
}

// Validation result shape moved to the shared `validation-types.ts` module
// (one canonical definition across every notation). The re-exports below
// preserve the public type surface this module historically exposed.
export type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from '../validation-types.js';

import type { ValidationError } from '../validation-types.js';

export interface MutationResult<T> {
  ok: boolean;
  result?: T;
  error?: ValidationError;
}

import type { Scope } from '../scope.js';

export interface LayoutOptions {
  rankdir?: 'LR' | 'TB';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
  hideCollapsed?: number[];
  viewDepth?: number | null;
  /** Trim the tree to a level cap or a subtree root (vkgeorgia/strategy#77). Defaults to 'all'. */
  scope?: Scope;
}

export interface LaidOutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  data: Goal;
  isCollapsedRoot: boolean;
  hasHiddenChildren: boolean;
}

export interface LaidOutEdge {
  source: number;
  target: number;
}

export interface GoalTreeLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}
