// ASSERTION — REQUIREMENT realisation claim.
// Schema: methodology notations/elements/16-assertion.md §2.

import type { GateChecks } from '../requirement/types.js';

/** Compliance status vocabulary (16-assertion.md §3). */
export type AssertionStatus = 'compliant' | 'partial' | 'non_compliant' | 'under_review' | 'pending_owner' | 'n_a';

export const ASSERTION_STATUSES: readonly AssertionStatus[] = [
  'compliant', 'partial', 'non_compliant', 'under_review', 'pending_owner', 'n_a',
];

/** TYPEs a `subject` may resolve to (16-assertion.md §2, ASSERT-003). */
export const ASSERTION_SUBJECT_TYPES = ['PRODUCT', 'PROCESS', 'CAPABILITY'] as const;

/** Evidence entry kinds (16-assertion.md §4). */
export type EvidenceKind = 'canonical_ref' | 'external_doc' | 'note';

export interface CanonicalRefEvidence {
  kind: 'canonical_ref';
  ref: string;
}
export interface ExternalDocEvidence {
  kind: 'external_doc';
  title: string;
  url: string;
}
export interface NoteEvidence {
  kind: 'note';
  text: string;
}
export type Evidence = CanonicalRefEvidence | ExternalDocEvidence | NoteEvidence;

export interface Assertion {
  notation: 'assertion';
  id: string;
  /** Typed ID of the REQUIREMENT this assertion is about. */
  about: string;
  /** Exactly one typed ID; TYPE ∈ {PRODUCT, PROCESS, CAPABILITY}. */
  subject: string;
  /** Typed IDs of elements that realise the requirement for the subject. */
  realised_via?: string[];
  status: AssertionStatus;
  evidence?: Evidence[];
  assessed_at?: string;
  assessed_by?: string;
  next_review_at?: string;
  /** ID or name of the party who must confirm this assertion (pending-owner state). */
  owner_to_confirm?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
