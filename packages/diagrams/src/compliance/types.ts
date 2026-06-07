// Shared compliance reverse-index + derived views (vkgeorgia/strategy#84
// Phase 3). The reverse-index pass (Law → Requirements, Requirement →
// Assertions, Subject → Assertions) backs the single-law tree and the
// single-product view here, and the gap dashboard in Phase 4.

import type { AssertionStatus } from '../assertion/types.js';

/** Projection of a REQUIREMENT the compliance views need. */
export interface IndexRequirement {
  id: string;
  name: string;
  severity?: string;
  /** Typed IDs of the codex sources this requirement derives from. */
  derived_from?: string[];
  /** Admission date (CONTRACT §6) — feeds DQ-1 freshness decay. */
  admitted_at?: string;
}

/** Projection of an ASSERTION the compliance views need. */
export interface IndexAssertion {
  id: string;
  about: string;
  subject: string;
  status: AssertionStatus;
  assessed_at?: string;
  next_review_at?: string;
  /** Number of evidence entries — feeds the Phase 4 "no evidence" gap. */
  evidenceCount?: number;
  /** Admission date (CONTRACT §6) — feeds DQ-1 freshness decay. */
  admitted_at?: string;
}

export interface ComplianceIndexInput {
  requirements: IndexRequirement[];
  assertions: IndexAssertion[];
}

/** The reverse-index — all maps are keyed by canonical id. */
export interface ComplianceIndex {
  requirementById: Map<string, IndexRequirement>;
  /** Codex artefact id → requirements whose `derived_from` names it. */
  requirementsByLaw: Map<string, IndexRequirement[]>;
  /** Requirement id → assertions whose `about` names it. */
  assertionsByRequirement: Map<string, IndexAssertion[]>;
  /** Subject id (product / process / capability) → assertions about it. */
  assertionsBySubject: Map<string, IndexAssertion[]>;
}

// ── Single-law tree ─────────────────────────────────────────────────────────

export interface LawTreeRequirement {
  requirement: IndexRequirement;
  /** Assertions targeting this requirement, id-sorted. */
  assertions: IndexAssertion[];
}
export interface LawTree {
  lawId: string;
  /** Requirements derived from the law, id-sorted. */
  requirements: LawTreeRequirement[];
}

// ── Single-product view ─────────────────────────────────────────────────────

export interface ProductRequirementStatus {
  /** The requirement the assertion is about. `name` falls back to the id when
   *  the requirement is not present in the scan (dangling `about`). */
  requirement: IndexRequirement;
  assertion: IndexAssertion;
}
export interface ProductView {
  productId: string;
  /** Requirements bound to the product via an assertion, requirement-id-sorted. */
  requirements: ProductRequirementStatus[];
}
