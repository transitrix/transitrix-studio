// BUSINESS_SERVICE — externally visible behaviour primitive (ArchiMate Business Service).
// Schema: methodology notations/elements/25-business-services.md

import type { GateChecks } from '../requirement/types.js';

export const BUSINESS_SERVICE_TYPES = ['internal', 'external', 'shared'] as const;
export type BusinessServiceType = typeof BUSINESS_SERVICE_TYPES[number];

export interface BusinessService {
  notation: 'business-service';
  id: string;
  name: string;
  type: BusinessServiceType;
  description?: string;
  offering_unit?: string;
  capability?: string;
  owner_role?: string;
  status?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
