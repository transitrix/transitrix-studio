// FACTOR — motivation-layer Driver (ArchiMate).
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.1.

import type { GateChecks } from '../requirement/types.js';

export type FactorType = 'external' | 'internal';

/** PESTLE sub-classification — external factors only (§7.1). */
export const FACTOR_PESTLE_CATEGORIES = [
  'political',
  'economic',
  'social',
  'technological',
  'legal',
  'environmental',
] as const;
export type FactorPestleCategory = typeof FACTOR_PESTLE_CATEGORIES[number];

export interface Factor {
  notation: 'driver';
  id: string;
  name: string;
  type?: FactorType;
  category?: FactorPestleCategory;
  description?: string;
  references_constraint?: string[];

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
