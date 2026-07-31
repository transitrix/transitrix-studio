// METRIC — motivation-layer managed indicator (no ArchiMate counterpart).
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.27.

import type { GateChecks } from '../requirement/types.js';

/** How to read movement relative to `target` (§7.27). */
export type MetricDirectionOfGood = 'higher_is_better' | 'lower_is_better' | 'on_target';

export const METRIC_DIRECTIONS_OF_GOOD: readonly MetricDirectionOfGood[] = [
  'higher_is_better',
  'lower_is_better',
  'on_target',
];

export interface Metric {
  notation: 'metric';
  id: string;
  name: string;
  /** Typed IDs of what this metric tracks — GOAL, CAPABILITY, or PROCESS. Non-empty. */
  measures: string[];
  /** Free-form unit the value and `target` are expressed in (percent, days, …). */
  unit: string;
  target: number;
  direction_of_good: MetricDirectionOfGood;
  /** ROLE-… accountable for tracking this metric and acting on it. */
  owner_role: string;
  description?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
