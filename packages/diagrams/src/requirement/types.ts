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

/** ISO/IEC/IEEE 29148 specification-tier ladder (15-requirement.md §2.5, REQ-005). */
export type RequirementLevel = 'stakeholder' | 'system' | 'software';

export const REQUIREMENT_LEVELS: readonly RequirementLevel[] = ['stakeholder', 'system', 'software'];

/** Functional vs quality classification (15-requirement.md §2.6, REQ-006). */
export type RequirementKind = 'functional' | 'quality';

export const REQUIREMENT_KINDS: readonly RequirementKind[] = ['functional', 'quality'];

export interface Requirement {
  notation: 'requirement';
  id: string;
  name: string;
  description: string;
  /** Organisation-defined priority. */
  severity?: RequirementSeverity;
  /** ISO/IEC/IEEE 29148 specification tier (§2.5, REQ-005). */
  level?: RequirementLevel;
  /** Functional vs quality classification (§2.6, REQ-006). */
  kind?: RequirementKind;
  /** Typed IDs of the codex source documents this requirement is drawn from. */
  derived_from?: string[];
  /** Typed ID of the upstream NEED this requirement traces to (§2.7, REQ-SERVES-001). Optional, singular. */
  serves?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
