// Shared compliance reverse-index + derived views (vkgeorgia/strategy#84
// Phase 3). The reverse-index pass (Law → Requirements, Requirement →
// Assertions, Subject → Assertions) backs the single-law tree and the
// single-product view here, and the gap dashboard in Phase 4.

import type { AssertionStatus } from '../assertion/types.js';
import type { ComplianceCodexDoc } from './classify.js';

/** Projection of a REQUIREMENT (or CONSTRAINT) the compliance views need. */
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
  /**
   * Origin taxonomy (15-requirement.md §2.1): `legislative`, `process-product`,
   * or `project-product`. Distinguishes the context from which the obligation
   * was derived. Undefined for existing pre-taxonomy admissions (treated as
   * `legislative` by tooling that supports origin-based filtering).
   */
  origin?: 'legislative' | 'process-product' | 'project-product';
  /**
   * Same-TYPE `parent` reference: the higher-scale obligation this one
   * decomposes from (15-requirement.md §2.4; ELEMENT_PRIMITIVES.md §7.13 for
   * CONSTRAINT). Origin-agnostic, structure-only. Enables the hierarchy half
   * of the requirement traceability view.
   */
  parent?: string;
  /**
   * Motivation-layer element kind. `requirement` = positive obligation
   * (15-requirement.md); `constraint` = restriction / prohibition
   * (ELEMENT_PRIMITIVES.md §7.13). ASSERTION coverage applies to `requirement`
   * only (16-assertion.md §1); the hierarchy half applies to both.
   */
  element_kind?: 'requirement' | 'constraint';
  /**
   * Longer-form description of the obligation (15-requirement.md §2). Optional;
   * used by the requirement traceability view to show the requirement body
   * inline. Not used by matrix / list views.
   */
  description?: string;
  /**
   * `next_review_at` review-checkpoint date (15-requirement.md §2.3; ISO 8601).
   * Present when the author has scheduled a review; drives `REQ-STALE-001`.
   */
  next_review_at?: string;
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
  /**
   * Parent id → the requirements/constraints that name it in `parent`
   * (15-requirement.md §2.4). Enables the requirement-hierarchy view.
   */
  requirementsByParent: Map<string, IndexRequirement[]>;
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

// ── Requirement traceability + hierarchy view ───────────────────────────────

/** A codex artefact resolved from a requirement's `derived_from` reference. */
export interface TraceSourceRef {
  /** Verbatim id from `derived_from`. Always present. */
  id: string;
  /** The codex artefact, when resolved by the scan. Absent for dangling refs. */
  codex?: ComplianceCodexDoc;
}

/** A named element (subject or realising element) resolved by the trace. */
export interface TraceElementRef {
  id: string;
  /** Element name when resolved by the scan; absent for dangling refs. */
  name?: string;
}

/** One ASSERTION targeting the traced requirement, with subject + realising elements. */
export interface TraceAssertionRow {
  assertion: IndexAssertion;
  subject: TraceElementRef;
  /** Elements named in the assertion's `realised_via` list (may be empty). */
  realisedVia: TraceElementRef[];
}

/**
 * Requirement traceability + hierarchy view.
 *
 * Two halves, both origin-agnostic (15-requirement.md §2.1):
 *  1. Trace chain — `derived_from` source(s) → the element itself → any
 *     ASSERTION targeting it (`about`) → the asserted `subject` + `realised_via`
 *     elements. Origin-agnostic per 15-requirement.md §2.1; assertion coverage
 *     applies to REQUIREMENT only (16-assertion.md §1) — CONSTRAINT trace shows
 *     only the source chain + hierarchy.
 *  2. Hierarchy — `parent` chain (ancestors, root last of the array) + children
 *     (any element whose `parent` names this one), sorted by id.
 */
export interface RequirementTrace {
  /** The element being traced (REQUIREMENT or CONSTRAINT). Falls back to a
   *  stub carrying the id as its name when the element is missing from the
   *  scan (a dangling `parent` or a repository being edited). */
  requirement: IndexRequirement;
  /** Backward-trace: `derived_from` codex artefacts, verbatim order. */
  sources: TraceSourceRef[];
  /** Forward-trace via ASSERTION. Empty for CONSTRAINT elements (16-assertion.md §1) or for a REQUIREMENT with no filed assertion. */
  assertions: TraceAssertionRow[];
  /** Parent chain: immediate parent first, root last. Empty when the element has no `parent`. */
  ancestors: IndexRequirement[];
  /** Direct children: elements naming this one as their `parent`, id-sorted. */
  children: IndexRequirement[];
}

/**
 * The complementary data the trace builder needs to name subjects and realising
 * elements. Names are resolved by looking up the id in this map; unresolved ids
 * surface as the id alone (a dangling reference).
 */
export interface TraceElementCatalog {
  /** id → human-readable name (or the id itself when unnamed). */
  nameById: Map<string, string>;
}
