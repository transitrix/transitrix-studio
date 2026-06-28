// TECHNOLOGY_SERVICE — technology-layer platform service primitive (ArchiMate Technology Service).
// Schema: methodology notations/elements/26-technology-services.md

import type { GateChecks } from '../requirement/types.js';

export const TECHNOLOGY_SERVICE_TYPES = ['messaging', 'storage', 'api_gateway', 'database', 'compute'] as const;
export type TechnologyServiceType = typeof TECHNOLOGY_SERVICE_TYPES[number];

export interface TechnologyService {
  notation: 'technology-service';
  id: string;
  name: string;
  type: TechnologyServiceType;
  description?: string;
  node?: string;
  endpoint?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
