// Render-time resolution of a nested capability-map entry's sidecar-bound
// time_varying fields (current_maturity, target_maturity, owner_role,
// target_date — 05-capability-map.md §13/§14, CONTRACT.md §9.4).
// check-versioned-attributes.ts's VERSIONED-004 already rejects these inline
// on the standalone CAPABILITY-*.yaml primitive; a nested capability-map
// entry references that same primitive by id (the 2026-08-05 packages
// decision — no separate per-nested-entry sidecar convention), so this
// resolves the same way applications/resolve-maturity.ts does for the
// applications catalogue.
//
// Pure: no I/O, no repo walk. The host (VS Code extension, IntelliJ/JCEF,
// CLI) already owns loading canon/elements/** — this module only knows how
// to pick sidecars out of that pool and resolve them at a date.
//
// Per the 2026-08-05 packages decision: this is a read model, never
// storage. Callers render an augmented, ephemeral copy of the capability
// tree and must never serialise it back — the sidecar stays the only place
// these fields are written.

import { parseSidecar, resolveAttributes } from '../versioned-attribute/index.js';
import type { CapabilityMapHeader, CapabilityNode } from './types.js';

export interface ResolvedCapabilityAttributes {
  current_maturity?: number;
  target_maturity?: number;
  owner_role?: string;
  target_date?: string;
}

/** Pick every sidecar out of a raw canon/elements/** doc pool and resolve
 *  current_maturity/target_maturity/owner_role/target_date at `atDate`,
 *  keyed by the sidecar's target id (== a capability entry's `id`, per the
 *  CAPABILITY-* primitive that entry references). */
export function resolveCapabilityAttributes(
  rawElementDocs: unknown[],
  atDate: string,
): Map<string, ResolvedCapabilityAttributes> {
  const byId = new Map<string, ResolvedCapabilityAttributes>();
  for (const doc of rawElementDocs) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
    const sidecar = parseSidecar(doc as Record<string, unknown>);
    if (!sidecar) continue;
    const resolved = resolveAttributes(sidecar, atDate);
    const entry: ResolvedCapabilityAttributes = {};
    if (typeof resolved['current_maturity'] === 'number') entry.current_maturity = resolved['current_maturity'];
    if (typeof resolved['target_maturity'] === 'number') entry.target_maturity = resolved['target_maturity'];
    if (typeof resolved['owner_role'] === 'string') entry.owner_role = resolved['owner_role'];
    if (typeof resolved['target_date'] === 'string') entry.target_date = resolved['target_date'];
    if (Object.keys(entry).length > 0) byId.set(sidecar.target, entry);
  }
  return byId;
}

/** Merge resolved sidecar values into a rendering copy of a capability node
 *  and its descendants. An inline value always wins if present — this is a
 *  display fallback for fields the document doesn't carry inline, not a
 *  migration tool. Returns a new node tree; nothing here writes it
 *  anywhere. */
export function withResolvedAttributes(
  node: CapabilityNode,
  resolved: Map<string, ResolvedCapabilityAttributes>,
): CapabilityNode {
  const r = resolved.get(node.id);
  const merged: CapabilityNode = r
    ? {
        ...node,
        current_maturity: node.current_maturity ?? r.current_maturity,
        target_maturity: node.target_maturity ?? r.target_maturity,
        owner_role: node.owner_role ?? r.owner_role,
        target_date: node.target_date ?? r.target_date,
      }
    : node;
  if (!node.children || node.children.length === 0) return merged;
  return { ...merged, children: node.children.map((c) => withResolvedAttributes(c, resolved)) };
}

/** Same merge, applied across a capability map's whole top-level tree. */
export function withResolvedCapabilityMap(
  map: CapabilityMapHeader,
  resolved: Map<string, ResolvedCapabilityAttributes>,
): CapabilityMapHeader {
  if (resolved.size === 0) return map;
  return { ...map, capabilities: map.capabilities.map((c) => withResolvedAttributes(c, resolved)) };
}
