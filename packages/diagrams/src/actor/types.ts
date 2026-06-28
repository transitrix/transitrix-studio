// ACTOR — active-structure identity primitive (ArchiMate Business Actor).
// Schema: methodology notations/elements/19-actors.md + ELEMENT_PRIMITIVES.md §7.10.

import type { GateChecks } from '../requirement/types.js';

export const ACTOR_TYPES = ['person', 'business_unit', 'system'] as const;
export type ActorType = typeof ACTOR_TYPES[number];

/**
 * Fields that record engagement / org-hierarchy and therefore MUST NOT appear
 * inline on an ACTOR file (§7.10, ACTOR-003). They belong in time-aware REL
 * records, never on the identity primitive.
 */
export const ACTOR_FORBIDDEN_INLINE_FIELDS = [
  'employment',
  'candidacy',
  'alumni_membership',
  'community_membership',
  'contracting',
  'unit_parent',
  'located_at',
  'unit_located_at',
  'roles',
  'owner',
] as const;

export interface Actor {
  notation: 'actor';
  id: string;
  name: string;
  type: ActorType;
  description?: string;
  contact?: string;
  external_ref?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
