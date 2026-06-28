// LOCATION — physical and virtual place primitive (ArchiMate Location/Facility).
// Schema: methodology notations/elements/21-locations.md

import type { GateChecks } from '../requirement/types.js';

export const LOCATION_TYPES = ['country', 'region', 'city', 'site', 'office', 'virtual'] as const;
export type LocationType = typeof LOCATION_TYPES[number];

export interface Location {
  notation: 'location';
  id: string;
  name: string;
  type: LocationType;
  address?: string;
  country_code?: string;
  timezone?: string;
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
