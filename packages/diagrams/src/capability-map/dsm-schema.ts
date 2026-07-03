/**
 * Types for the DSM-migration capability map (docs/extraction/capability-map.md).
 *
 * Distinct from `./types.ts` (`CapabilityNode`/`CapabilityMapFile`), which is
 * Transitrix's own native `*.capability-map.transitrix.yaml` notation — a
 * nested-children tree, statically rendered to SVG. This module is a
 * separate, flat, address-triple data model matching DSM's internal
 * capability editor, for the interactive `CapabilityMapView` component. The
 * two coexist in this folder by design (see the address-helper/component
 * deliverables in the extraction spec); only the validator function name
 * collided, so it's `validateCapabilityMapData` here, not
 * `validateCapabilityMap` (already taken by `./validate.ts`).
 */

export interface MaturitySnapshot {
  date: string;
  level: number;
}

export interface Capability {
  id: number;
  name: string;
  /** 'X.Y.Z' triple. X=0 or backlog=true means "not on the diagram". */
  address: string;
  backlog?: boolean;
  description?: string;
  maturity?: MaturitySnapshot[];
}

export interface CapabilityMap {
  organisation: string;
  set_id: string;
  capabilities: Capability[];
}

export type {
  ValidationError,
  ValidationWarning,
  ValidationResult,
} from '../validation-types.js';

import type { ValidationError } from '../validation-types.js';

export interface MutationResult<T> {
  ok: boolean;
  result?: T;
  error?: ValidationError;
}

export interface LayoutOptions {
  rankdir?: 'LR' | 'TB';
  nodeWidth?: number;
  nodeHeight?: number;
  rankSep?: number;
  nodeSep?: number;
  hideCollapsed?: number[];
  organisationLabel?: string;
}

export interface LaidOutNode {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  data: Capability | null;
  hasHiddenChildren: boolean;
}

export interface LaidOutEdge {
  source: number | 'root';
  target: number;
}

export interface CapabilityMapLayout {
  rootNode: LaidOutNode;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}
