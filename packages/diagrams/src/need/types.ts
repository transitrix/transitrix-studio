// NEED — motivation-layer stakeholder/user need (no ArchiMate counterpart).
// Upstream of REQUIREMENT — schema: methodology notations/ELEMENT_PRIMITIVES.md §7.28.

import type { GateChecks } from '../requirement/types.js';
import type { AgreementValue } from '../agreement.js';

export interface Need {
  notation: 'need';
  id: string;
  name: string;
  /** Typed ID of the STAKEHOLDER whose need this is. */
  stakeholder: string;
  description?: string;

  // Agreement axis (CONTRACT.md §6.3, when present) — independent of admission.
  /** `draft` \| `agreed` \| `disputed`. Absent ⇒ `agreed` (back-compat). */
  agreement?: AgreementValue;
  /** Required whenever `agreement` is present (AGREE-003). Written only by a human when `agreement: agreed` (AGREE-002). */
  agreed_by?: string;
  agreed_at?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
