// process_parent relation checks — 17-relations.md §3 / §5 (REL-007, REL-008)
// and endpoint TYPE (PROCESS → PROCESS), plus the in-effect edge collector
// that process-blueprint BP-014 consumes.
//
// REL-007 is single-file (from === to). REL-008 is cross-cutting over the
// admitted process_parent graph and is a warning, parallel to REL-006.

import { docId, endpointId } from './validate-repo.js';
import type { ProcessParentEdge } from '../process-blueprint/validate.js';
import type { RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

function isProcessNotation(n: unknown): boolean {
  return n === 'process';
}

function isoDate(value: unknown): string | undefined {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined;
}

/** Inclusive window: in effect at `asOf` iff valid_from ≤ asOf and (valid_to is null or asOf ≤ valid_to). */
export function relationInEffectAt(data: Record<string, unknown>, asOf: string): boolean {
  const from = isoDate(data['valid_from']);
  if (from && from > asOf) return false;
  const to = data['valid_to'];
  if (to === null || to === undefined) return true;
  const toDate = isoDate(to);
  if (!toDate) return true;
  return asOf <= toDate;
}

export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** In-effect `process_parent` edges (child → parent) among loaded REL files. */
export function collectInEffectProcessParentEdges(
  input: RepoModelInput,
  asOf: string = todayIsoDate(),
): ProcessParentEdge[] {
  const edges: ProcessParentEdge[] = [];
  for (const doc of input.relations) {
    if (!doc.data) continue;
    if (doc.data['type'] !== 'process_parent') continue;
    if (!relationInEffectAt(doc.data, asOf)) continue;
    const fromId = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
    const toId = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);
    if (!fromId || !toId) continue;
    edges.push({ from: fromId, to: toId });
  }
  return edges;
}

interface ParentRel {
  relId: string;
  fromId: string;
  toId: string;
}

function processParentRels(input: RepoModelInput): ParentRel[] {
  const out: ParentRel[] = [];
  for (const doc of input.relations) {
    if (!doc.data) continue;
    if (doc.data['type'] !== 'process_parent') continue;
    const fromId = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
    const toId = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);
    if (!fromId || !toId) continue;
    out.push({ relId: docId(doc) ?? '', fromId, toId });
  }
  return out;
}

/** REL-007 — process_parent self-reference. */
function checkSelfReference(rels: ParentRel[], findings: RepoFinding[]): void {
  for (const rel of rels) {
    if (rel.fromId === rel.toId) {
      findings.push({
        scope: PScope,
        id: rel.relId,
        ruleId: 'REL-007',
        message: `REL-007: process_parent relation '${rel.relId}' has from equal to to ('${rel.fromId}').`,
      });
    }
  }
}

/** REL-008 — cycle in the process_parent graph (warning). */
function checkCycle(rels: ParentRel[], findings: RepoFinding[]): void {
  const childrenOf = new Map<string, string[]>();
  const relByChildParent = new Map<string, string>();
  const nodes = new Set<string>();
  for (const rel of rels) {
    if (rel.fromId === rel.toId) continue;
    nodes.add(rel.fromId);
    nodes.add(rel.toId);
    const list = childrenOf.get(rel.fromId);
    if (list) list.push(rel.toId);
    else childrenOf.set(rel.fromId, [rel.toId]);
    relByChildParent.set(`${rel.fromId}\0${rel.toId}`, rel.relId);
  }

  const UNVISITED = 0;
  const VISITING = 1;
  const DONE = 2;
  const state = new Map<string, number>();
  let hit: string | undefined;

  function walk(id: string): boolean {
    const s = state.get(id) ?? UNVISITED;
    if (s === DONE) return false;
    if (s === VISITING) {
      hit = id;
      return true;
    }
    state.set(id, VISITING);
    for (const parent of childrenOf.get(id) ?? []) {
      if (nodes.has(parent) && walk(parent)) return true;
    }
    state.set(id, DONE);
    return false;
  }

  for (const id of nodes) {
    if (walk(id)) break;
  }
  if (!hit) return;

  const relId =
    [...relByChildParent.entries()].find(([key]) => key.startsWith(`${hit}\0`))?.[1] ?? hit;
  findings.push({
    scope: PScope,
    id: relId,
    ruleId: 'REL-008',
    severity: 'warning',
    message: `REL-008: process_parent graph contains a cycle involving '${hit}'.`,
  });
}

/**
 * Endpoint TYPE for process_parent: both ends must be PROCESS when they
 * resolve. Unknown endpoints stay with referential integrity; this pass only
 * fires when the element exists and is the wrong notation.
 */
function checkEndpointTypes(input: RepoModelInput, rels: ParentRel[], findings: RepoFinding[]): void {
  const elementById = new Map<string, Record<string, unknown>>();
  for (const doc of input.elements) {
    const id = docId(doc);
    if (id && doc.data) elementById.set(id, doc.data);
  }

  for (const rel of rels) {
    const from = elementById.get(rel.fromId);
    if (from && !isProcessNotation(from['notation'])) {
      findings.push({
        scope: PScope,
        id: rel.relId,
        ruleId: 'REL-002',
        message:
          `Layer-semantics: '${rel.relId}' type 'process_parent' requires from to be ` +
          `PROCESS; got notation='${from['notation']}'.`,
      });
    }
    const to = elementById.get(rel.toId);
    if (to && !isProcessNotation(to['notation'])) {
      findings.push({
        scope: PScope,
        id: rel.relId,
        ruleId: 'REL-002',
        message:
          `Layer-semantics: '${rel.relId}' type 'process_parent' requires to to be ` +
          `PROCESS; got notation='${to['notation']}'.`,
      });
    }
  }
}

export function checkProcessParentSemantics(input: RepoModelInput, findings: RepoFinding[]): void {
  const rels = processParentRels(input);
  if (rels.length === 0) return;
  checkSelfReference(rels, findings);
  checkCycle(rels, findings);
  checkEndpointTypes(input, rels, findings);
}