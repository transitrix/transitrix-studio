// CHANGE — implementation-layer Gap (ArchiMate). The BDN change layer.
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.3.

import type { GateChecks } from '../requirement/types.js';

export interface Change {
  notation: 'change';
  id: string;
  name: string;
  /** GOAL-… IDs this change delivers. */
  goals?: string[];
  /** Higher-scale CHANGE this one decomposes from (recursive, §6.1). */
  parent?: string;
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
