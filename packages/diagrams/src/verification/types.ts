// VERIFICATION — engineering V&V claim against a REQUIREMENT.
// Schema: methodology notations/elements/27-verification.md §2.

import type { GateChecks } from '../requirement/types.js';
import type { Evidence } from '../assertion/types.js';

/** V&V method vocabulary (27-verification.md §3). */
export type VerificationMethod = 'test' | 'analysis' | 'inspection' | 'demonstration';

export const VERIFICATION_METHODS: readonly VerificationMethod[] = [
  'test', 'analysis', 'inspection', 'demonstration',
];

/** Pass/fail judgement vocabulary (27-verification.md §3). */
export type VerificationOutcome = 'pass' | 'fail' | 'inconclusive' | 'not_yet_run';

export const VERIFICATION_OUTCOMES: readonly VerificationOutcome[] = [
  'pass', 'fail', 'inconclusive', 'not_yet_run',
];

/** Outcomes that count as "closed" — the trace link has resolved one way or
 *  the other, distinct from still-open (`not_yet_run` / `inconclusive`)
 *  (27-verification.md §5, REQ-VERIF-COVERAGE-002). */
export const CLOSED_VERIFICATION_OUTCOMES: readonly VerificationOutcome[] = ['pass', 'fail'];

export interface Verification {
  notation: 'verification';
  id: string;
  /** Typed ID of the REQUIREMENT this verification targets. */
  verifies: string;
  method: VerificationMethod;
  protocol: string;
  result?: string;
  outcome: VerificationOutcome;
  evidence?: Evidence[];
  performed_at?: string;
  performed_by?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
