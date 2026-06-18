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
  /**
   * Compliance deadline (ISO 8601 date, YYYY-MM-DD).
   * When a gap exists on a cell whose requirement carries a deadline that is
   * past or imminent, CV-3 renders an urgent decoration on the cell.
   */
  deadline?: string;
}

// ── Temporal status (CV-3) ──────────────────────────────────────────────────

/**
 * Temporal status of a requirement deadline relative to today.
 *
 * - `past_due`  — deadline has already passed (`deadline < today`).
 * - `in_force`  — deadline is within the next 30 days.
 * - `upcoming`  — deadline is more than 30 days away.
 * - `none`      — no deadline set.
 */
export type DeadlineStatus = 'past_due' | 'in_force' | 'upcoming' | 'none';

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
  /**
   * Typed IDs of the stages / tasks where the requirement is realised for
   * the subject (16-assertion.md §2 `realised_via`). Populated when the
   * assertion carries granular evidence; absent when the claim covers the
   * entire subject without stage decomposition. CV-3a uses this to fill
   * stage-grouped matrix cells.
   */
  realised_via?: string[];
  /** ID or name of the party who must confirm this assertion (pending-owner state). */
  owner_to_confirm?: string;
}

// ── Stage grouping (CV-3a) ──────────────────────────────────────────────────

/** One stage (or task) element of a business object, used as a matrix sub-column. */
export interface ObjectDetailDef {
  id: string;
  name: string;
  /**
   * Ordered task-type flow steps within this stage.
   * Present only when `grouping.columns: product-stage-task` grain is active.
   * Each task produces a separate matrix column: (subject, stageId, taskId).
   * When absent or empty, the stage itself is the column grain.
   */
  tasks?: Array<{ id: string; name: string }>;
}

/**
 * Maps a business object to its ordered stages (and optionally their tasks).
 * Passed into `buildImpactMatrix` to enable stage/task column grouping.
 *
 * - For `grouping.columns: product-stage`: `details` contains stages; each
 *   stage becomes one matrix column.
 * - For `grouping.columns: product-stage-task`: each stage in `details` carries
 *   a `tasks` array; each task produces a `(subject, stage, task)` column.
 *   Stages with no tasks fall back to a stage-grain column.
 *
 * Typically built by combining `extractObjectDetails` (blueprint stages) and
 * `extractProcessFlowTasks` (process flow tasks), then merging via
 * `mergeStageTaskDetails`.
 */
export interface ObjectDetailInput {
  objectId: string;
  details: ObjectDetailDef[];
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
