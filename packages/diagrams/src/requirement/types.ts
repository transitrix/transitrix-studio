// REQUIREMENT — motivation-layer positive obligation.
// Schema: methodology notations/elements/15-requirement.md §2.

export type RequirementSeverity = 'high' | 'medium' | 'low';

/** Standard canon admission gate checks (CONTRACT.md §6). */
export interface GateChecks {
  uniqueness?: string;
  consistency?: string;
  completeness?: string;
}

/** TYPEs a requirement may be derived from (15-requirement.md §2, REQ-003). */
export const REQUIREMENT_DERIVED_FROM_TYPES = ['LAW', 'REGULATION', 'POLICY', 'INTERNAL_STANDARD'] as const;

export interface Requirement {
  notation: 'requirement';
  id: string;
  name: string;
  description: string;
  /** Organisation-defined priority. */
  severity?: RequirementSeverity;
  /** Typed IDs of the codex source documents this requirement is drawn from. */
  derived_from?: string[];

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
