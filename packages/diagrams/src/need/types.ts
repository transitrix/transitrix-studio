// NEED — motivation-layer stakeholder/user need (no ArchiMate counterpart).
// Upstream of REQUIREMENT — schema: methodology notations/ELEMENT_PRIMITIVES.md §7.28.

import type { GateChecks } from '../requirement/types.js';

export interface Need {
  notation: 'need';
  id: string;
  name: string;
  /** Typed ID of the STAKEHOLDER whose need this is. */
  stakeholder: string;
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
