// NODE — technology-layer infrastructure node primitive (ArchiMate Technology Node).
// Schema: methodology notations/elements/25-nodes.md

import type { GateChecks } from '../requirement/types.js';

export const NODE_TYPES = ['server', 'cloud_instance', 'container_platform', 'database_server', 'network_device'] as const;
export type NodeType = typeof NODE_TYPES[number];

export interface Node {
  notation: 'node';
  id: string;
  name: string;
  type: NodeType;
  description?: string;
  provider?: string;
  region?: string;

  // Admission record (CONTRACT.md §6).
  zone: 'canon';
  admitted_at: string;
  admitted_by: string;
  gate_checks: GateChecks;

  // Primitive lifecycle (CONTRACT.md §7).
  valid_from: string;
  valid_to: string | null;
}
