// Requirement -> verification matrix — deterministic, repository-wide
// projection over the shared compliance reverse-index. Pure data; the
// consumer (a VS Code table, an export) renders it.

import type { VerificationOutcome } from '../verification/types.js';

/**
 * One row of the requirement-verification matrix.
 *
 * A requirement with N admitted VERIFICATION records produces N rows, one per
 * verification. A requirement with none still produces exactly one row,
 * carrying the `REQ-VERIF-COVERAGE-001` gap. A requirement whose
 * verifications exist but never closed (pass/fail) produces one row per
 * verification — each carrying the `REQ-VERIF-COVERAGE-002` gap alongside its
 * (still-open) outcome; the open verification is real data and is never
 * replaced by a placeholder gap row.
 *
 * Coverage comes only from `VERIFICATION.verifies` (27-verification.md §2). A
 * child requirement's verification never covers its `parent`
 * (15-requirement.md §2.4 — `parent` records structure only, no roll-up).
 */
export interface RequirementVerificationRow {
  requirementId: string;
  requirementLabel: string;

  /**
   * Direct `REQUIREMENT.parent` id, verbatim, present whenever the field is
   * set — whether or not it resolves. `parent` resolution is not currently a
   * validator concern (15-requirement.md §2.4); a dangling parent must still
   * be visible on the row, not silently dropped.
   */
  parentId?: string;
  /**
   * The resolved parent's `name`, present only when `parentId` names an
   * admitted requirement in the index. Absent when `parentId` is set but
   * unresolved (dangling), or when the requirement has no parent.
   */
  parentLabel?: string;

  /** The verification filling this row, when one exists. */
  verificationId?: string;
  /**
   * VERIFICATION carries no `name`/label field of its own
   * (27-verification.md §2); `protocol` — the procedure description — is the
   * closest human-readable text and is what this row shows as its label.
   */
  verificationLabel?: string;
  verificationOutcome?: VerificationOutcome;

  /**
   * `REQ-VERIF-COVERAGE-001` / `-002` (`compliance/gap-report.ts`), reused
   * verbatim — this builder never recomputes a competing coverage verdict.
   * Absent once the requirement has at least one closed (pass/fail)
   * verification.
   */
  coverageGap?: 'REQ-VERIF-COVERAGE-001' | 'REQ-VERIF-COVERAGE-002';
}

export interface RequirementVerificationMatrixOptions {
  /**
   * Forwarded to `buildGapReport`. Neither coverage gap this matrix surfaces
   * (`REQ-VERIF-COVERAGE-001`/`-002`) depends on `today` — accepted only for
   * call-site symmetry with the other compliance-view builders.
   */
  today?: string;
}

export interface RequirementVerificationMatrix {
  /**
   * One row per (requirement, verification) pair, plus one gap row per
   * requirement with zero verifications.
   *
   * Ordering (stable, independent of filesystem/Map enumeration order):
   * requirements sorted by id; within a requirement, its verification rows
   * sorted by verification id.
   */
  rows: RequirementVerificationRow[];
  summary: {
    requirements: number;
    /** Rows carrying a real verification (excludes -001 gap-only rows). */
    verifications: number;
    /** Requirements carrying a REQ-VERIF-COVERAGE-001 or -002 gap. */
    gaps: number;
  };
}
