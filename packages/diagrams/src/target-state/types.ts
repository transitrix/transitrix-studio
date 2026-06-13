// TARGET_STATE — implementation-layer Plateau (ArchiMate).
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.18.

import type { GateChecks } from '../requirement/types.js';

/** Composition list field → expected TYPE prefix of each entry. */
export const TARGET_STATE_COMPOSITION_FIELDS = {
  capabilities: 'CAPABILITY',
  processes: 'PROCESS',
  applications: 'APPLICATION',
} as const;

export interface TargetState {
  notation: 'target-state';
  id: string;
  name: string;
  capabilities?: string[];
  processes?: string[];
  applications?: string[];
  description?: string;
  link?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
