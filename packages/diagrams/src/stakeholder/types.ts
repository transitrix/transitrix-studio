// STAKEHOLDER — motivation-layer interest primitive (ArchiMate Stakeholder).
// Schema: methodology notations/elements/20-stakeholders.md + ELEMENT_PRIMITIVES.md §7.16.

import type { GateChecks } from '../requirement/types.js';

export const STAKEHOLDER_TYPES = ['internal', 'external'] as const;
export type StakeholderType = typeof STAKEHOLDER_TYPES[number];

export const STAKEHOLDER_LEVELS = ['high', 'medium', 'low'] as const;
export type StakeholderLevel = typeof STAKEHOLDER_LEVELS[number];

export interface Stakeholder {
  notation: 'stakeholder';
  id: string;
  name: string;
  type: StakeholderType;
  /** ACTOR-… whose identity this stake attaches to (STAKE-002). */
  actor: string;
  concern?: string;
  interest?: StakeholderLevel;
  influence?: StakeholderLevel;
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
