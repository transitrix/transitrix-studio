// RISK — motivation-layer projected event (no ArchiMate counterpart).
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.26.

import type { GateChecks } from '../requirement/types.js';

/** Likelihood / impact / residual severity vocabulary (§7.26). */
export type RiskLevel = 'low' | 'medium' | 'high';

export const RISK_LEVELS: readonly RiskLevel[] = ['low', 'medium', 'high'];

export interface Risk {
  notation: 'risk';
  id: string;
  name: string;
  likelihood: RiskLevel;
  impact: RiskLevel;
  residual: RiskLevel;
  /** ROLE-… accountable for tracking and treating this risk. */
  owner_role: string;
  /** Typed IDs of the elements this risk threatens. Non-empty; any TYPE. */
  threatens: string[];
  /** Typed IDs (REQUIREMENT-… / CONSTRAINT-…) of the treatment obligations. */
  treated_by?: string[];
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
