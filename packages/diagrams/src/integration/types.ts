// INTEGRATION — application-layer point-to-point exchange (ArchiMate Application Interface).
// Schema: methodology notations/ELEMENT_PRIMITIVES.md §7.8

import type { GateChecks } from '../requirement/types.js';

export const INTEGRATION_DIRECTIONS = ['inbound', 'outbound', 'bidirectional'] as const;
export type IntegrationDirectionType = typeof INTEGRATION_DIRECTIONS[number];

export const SENSITIVITY_VALUES = ['public', 'internal', 'confidential', 'restricted'] as const;
export type SensitivityValue = typeof SENSITIVITY_VALUES[number];

export const DIRECTIONALITY_VALUES = ['producer', 'consumer', 'request_reply', 'bidirectional_stream'] as const;
export type DirectionalityValue = typeof DIRECTIONALITY_VALUES[number];

export interface Integration {
  notation: 'integration';
  id: string;
  name?: string;
  source: string;
  target: string;
  direction?: IntegrationDirectionType;
  protocol?: string;
  description?: string;
  interface_semantics?: boolean;
  payload_class?: string;
  sensitivity?: SensitivityValue;
  directionality?: DirectionalityValue;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
