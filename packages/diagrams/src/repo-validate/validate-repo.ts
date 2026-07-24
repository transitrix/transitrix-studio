// Repo-scope validator (vkgeorgia/transitrix-studio#141).
//
// Pure port of the whole-repo checks owned by the methodology's
// `.validators/lint.py`, run over the shared TypeScript model instead of Python.
// Parity reference: the `acme_corp` worked example, which `lint.py` passes with
// zero findings — this validator must also produce zero findings on it.
//
// Ported checks (mirroring lint.py's phases):
//   1. YAML syntax        (phase 1) — unparseable canon file -> finding.
//   2. ID uniqueness                — same `id` defined in >1 file -> finding.
//                                     (lint.py silently last-wins; we surface it,
//                                      but acme_corp has no duplicates, so parity
//                                      holds on the reference fixture.)
//   3. Atomicity          (phase 3) — element file carrying a `relations:` key.
//   4. Referential integ. (phase 4) — relation endpoint not resolving to a known
//                                     element id. We resolve the canonical
//                                     `from`/`to` keys (the real relation schema)
//                                     and also accept lint.py's `source`/`target`.
//   5. Semantic rules     (phase 5) — ArchiMate layer-semantics. lint.py ships
//                                     this as a no-op stub; ported faithfully as a
//                                     no-op (see `checkLayerSemantics`). Deferred
//                                     until the methodology defines the rules.
//   6. Policy             (phase 6) — element marked Active/Production with no
//                                     owner.
//
// Findings stay `{ scope, id, message }` — no severity, no target/category
// taxonomy (deferred per the ADR).

import { checkStrategyChainSemantics } from './check-strategy-chain.js';
import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

/** Statuses that, per lint.py's policy check, require an owner. */
const OWNER_REQUIRED_STATUSES = new Set(['Active', 'Production']);

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read a string `id` from a parsed doc, or `null` if absent/non-string.
 *  Mirrors lint.py, which only treats a doc as an element/relation when it has
 *  a top-level `id` (sidecars such as versioned-attribute files have no `id`
 *  and are ignored). Exported for reuse by `resolve-model.ts`, which needs the
 *  same id/endpoint reading rules to stay in lockstep with this validator. */
export function docId(doc: RepoDoc): string | null {
  if (!doc.data) return null;
  const id = doc.data['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Resolve a relation endpoint, which may be a bare id string or a `{ id }`
 *  mapping (lint.py accepts both). Returns the id string or `null`. */
export function endpointId(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  if (isRecord(value)) {
    const id = value['id'];
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return null;
}

/** Phase 1 — unparseable canon files surface as findings. */
function checkSyntax(docs: RepoDoc[], findings: RepoFinding[]): void {
  for (const doc of docs) {
    if (doc.parseError) {
      findings.push({
        scope: PScope,
        id: '',
        message: `YAML syntax error in ${doc.path}: ${doc.parseError}`,
      });
    }
  }
}

/** Phase 2 (as a check) — the same id defined in more than one file. */
function checkIdUniqueness(input: RepoModelInput, findings: RepoFinding[]): void {
  const filesById = new Map<string, string[]>();
  for (const doc of [...input.elements, ...input.relations]) {
    const id = docId(doc);
    if (!id) continue;
    const list = filesById.get(id);
    if (list) list.push(doc.path);
    else filesById.set(id, [doc.path]);
  }
  for (const [id, files] of filesById) {
    if (files.length > 1) {
      findings.push({
        scope: PScope,
        id,
        message: `Duplicate id '${id}' defined in ${files.length} files: ${files.join(', ')}`,
      });
    }
  }
}

/** Phase 3 — relations must live in their own files, not inline on elements. */
function checkAtomicity(input: RepoModelInput, findings: RepoFinding[]): void {
  for (const doc of input.elements) {
    const id = docId(doc);
    if (id && doc.data && 'relations' in doc.data) {
      findings.push({
        scope: PScope,
        id,
        message:
          `Atomicity violation: element '${id}' (${doc.path}) contains a ` +
          `'relations' section. Move relations to separate files under canon/relations/.`,
      });
    }
  }
}

/** Phase 4 — every relation endpoint must resolve to a known element id. */
function checkReferentialIntegrity(input: RepoModelInput, findings: RepoFinding[]): void {
  const elementIds = new Set<string>();
  for (const doc of input.elements) {
    const id = docId(doc);
    if (id) elementIds.add(id);
  }

  for (const doc of input.relations) {
    if (!doc.data) continue;
    const relId = docId(doc) ?? '';
    // Canonical relation schema uses `from`/`to`; `source`/`target` accepted for
    // lint.py compatibility.
    const fromId = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
    const toId = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);

    if (fromId && !elementIds.has(fromId)) {
      findings.push({
        scope: PScope,
        id: relId,
        message: `Referential integrity: relation '${relId || doc.path}' endpoint '${fromId}' (from) does not resolve to a known element.`,
      });
    }
    if (toId && !elementIds.has(toId)) {
      findings.push({
        scope: PScope,
        id: relId,
        message: `Referential integrity: relation '${relId || doc.path}' endpoint '${toId}' (to) does not resolve to a known element.`,
      });
    }
  }
}

/** Phase 5 — ArchiMate layer-semantics on relations and elements.
 *
 * Enforces endpoint-type constraints for relation kinds whose methodology
 * semantics are formally defined. Rules added here must have a corresponding
 * entry in methodology `notations/elements/17-relations.md`; do not add
 * speculative rules.
 *
 * Implemented relation kinds:
 *   unit_located_at — ACTOR(business_unit) → LOCATION        (21-locations.md)
 *   located_at      — ACTOR(person|business_unit) → LOCATION (canonical form)
 *   offers          — ACTOR(business_unit)|ROLE → BUSINESS_SERVICE (25-business-services.md)
 *   realizes        — BUSINESS_SERVICE → CAPABILITY           (25-business-services.md)
 *   hosts           — NODE → TECHNOLOGY_SERVICE               (25-nodes.md / 26-technology-services.md)
 *   uses            — APPLICATION → TECHNOLOGY_SERVICE        (26-technology-services.md)
 *
 * Implemented element checks:
 *   TSVC-003        — TECHNOLOGY_SERVICE.node must resolve to NODE notation
 *                     (26-technology-services.md §5)
 *
 * Implemented element checks:
 *   INT-002 — INTEGRATION(interface_semantics: true) source/target → APPLICATION
 *             (ELEMENT_PRIMITIVES.md §7.8.1)
 *
 * lint.py ships this as a no-op stub; Studio is ahead of the Python tool here.
 * These findings are non-blocking for cross-tool parity — they surface only in
 * the TypeScript validator path (CLI `validate --scope=repo`). */
function checkLayerSemantics(input: RepoModelInput, findings: RepoFinding[]): void {
  const elementById = new Map<string, Record<string, unknown>>();
  for (const doc of input.elements) {
    const id = docId(doc);
    if (id && doc.data) elementById.set(id, doc.data);
  }

  for (const doc of input.relations) {
    if (!doc.data) continue;
    const relId = docId(doc) ?? '';
    const relType = doc.data['type'];
    if (typeof relType !== 'string') continue;

    const fromId = endpointId(doc.data['from']) ?? endpointId(doc.data['source']);
    const toId = endpointId(doc.data['to']) ?? endpointId(doc.data['target']);

    if (relType === 'unit_located_at') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (from && (from['notation'] !== 'actor' || from['type'] !== 'business_unit')) {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'unit_located_at' requires from to be ` +
              `ACTOR(business_unit); got notation='${from['notation']}', type='${from['type']}'.`,
          });
        }
      }
      if (toId) {
        const to = elementById.get(toId);
        if (to && to['notation'] !== 'location') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'unit_located_at' requires to to be a LOCATION; ` +
              `got notation='${to['notation']}'.`,
          });
        }
      }
    } else if (relType === 'located_at') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (
          from &&
          (from['notation'] !== 'actor' ||
            (from['type'] !== 'person' && from['type'] !== 'business_unit'))
        ) {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'located_at' requires from to be ` +
              `ACTOR(person|business_unit); got notation='${from['notation']}', type='${from['type']}'.`,
          });
        }
      }
      if (toId) {
        const to = elementById.get(toId);
        if (to && to['notation'] !== 'location') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'located_at' requires to to be a LOCATION; ` +
              `got notation='${to['notation']}'.`,
          });
        }
      }
    } else if (relType === 'offers') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (
          from &&
          from['notation'] !== 'actor' &&
          from['notation'] !== 'role'
        ) {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'offers' requires from to be ` +
              `ACTOR(business_unit) or ROLE; got notation='${from['notation']}'.`,
          });
        }
      }
      if (toId) {
        const to = elementById.get(toId);
        if (to && to['notation'] !== 'business-service') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'offers' requires to to be a BUSINESS_SERVICE; ` +
              `got notation='${to['notation']}'.`,
          });
        }
      }
    } else if (relType === 'realizes') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (from && from['notation'] !== 'business-service') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'realizes' requires from to be ` +
              `BUSINESS_SERVICE; got notation='${from['notation']}'.`,
          });
        }
      }
    } else if (relType === 'hosts') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (from && from['notation'] !== 'node') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'hosts' requires from to be a NODE; ` +
              `got notation='${from['notation']}'.`,
          });
        }
      }
      if (toId) {
        const to = elementById.get(toId);
        if (to && to['notation'] !== 'technology-service') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'hosts' requires to to be a TECHNOLOGY_SERVICE; ` +
              `got notation='${to['notation']}'.`,
          });
        }
      }
    } else if (relType === 'uses') {
      if (fromId) {
        const from = elementById.get(fromId);
        if (from && from['notation'] !== 'application') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'uses' requires from to be an APPLICATION; ` +
              `got notation='${from['notation']}'.`,
          });
        }
      }
      if (toId) {
        const to = elementById.get(toId);
        if (to && to['notation'] !== 'technology-service') {
          findings.push({
            scope: PScope,
            id: relId,
            message:
              `Layer-semantics: '${relId}' type 'uses' requires to to be a TECHNOLOGY_SERVICE; ` +
              `got notation='${to['notation']}'.`,
          });
        }
      }
    }
  }

  // TSVC-003 — TECHNOLOGY_SERVICE.node must resolve to a NODE-notation element.
  for (const doc of input.elements) {
    if (!doc.data) continue;
    if (doc.data['notation'] !== 'technology-service') continue;
    const nodeRef = doc.data['node'];
    if (typeof nodeRef !== 'string' || nodeRef.trim() === '') continue;

    const svcId = docId(doc) ?? '';
    const resolved = elementById.get(nodeRef);
    if (resolved && resolved['notation'] !== 'node') {
      findings.push({
        scope: PScope,
        id: svcId,
        ruleId: 'TSVC-003',
        message:
          `TSVC-003: TECHNOLOGY_SERVICE '${svcId}' node '${nodeRef}' ` +
          `must resolve to a NODE element; got notation='${resolved['notation']}'.`,
      });
    }
  }

  // INT-002 — INTEGRATION elements with interface_semantics: true must have
  // source and target that resolve to APPLICATION-notation elements.
  for (const doc of input.elements) {
    if (!doc.data) continue;
    if (doc.data['notation'] !== 'integration') continue;
    if (doc.data['interface_semantics'] !== true) continue;

    const intId = docId(doc) ?? '';
    for (const field of ['source', 'target'] as const) {
      const endpointId = doc.data[field];
      if (typeof endpointId !== 'string' || endpointId.trim() === '') continue;
      const resolved = elementById.get(endpointId);
      if (resolved && resolved['notation'] !== 'application') {
        findings.push({
          scope: PScope,
          id: intId,
          ruleId: 'INT-002',
          message:
            `INT-002: INTEGRATION '${intId}' interface_semantics endpoint '${endpointId}' ` +
            `(${field}) must resolve to an APPLICATION element; got notation='${resolved['notation']}'.`,
        });
      }
    }
  }
}

/** Phase 6 — an element that is Active/Production must declare an owner. */
function checkPolicy(input: RepoModelInput, findings: RepoFinding[]): void {
  for (const doc of input.elements) {
    const id = docId(doc);
    if (!id || !doc.data) continue;
    const metadata = doc.data['metadata'];
    if (!isRecord(metadata)) continue;
    const status = metadata['status'];
    const owner = metadata['owner'];
    if (typeof status === 'string' && OWNER_REQUIRED_STATUSES.has(status) && !owner) {
      findings.push({
        scope: PScope,
        id,
        message: `Policy: element '${id}' has status '${status}' but no owner assigned.`,
      });
    }
  }
}

/**
 * Run all repo-scope checks over a loaded canon model and return the findings.
 * Pure: no IO, deterministic order (syntax, uniqueness, atomicity, referential,
 * semantics, policy, strategy-chain). Reaches parity with `lint.py` on the
 * `acme_corp` fixture (zero findings on a clean tree from the original
 * lint.py-ported phases).
 */
export function validateRepoModel(input: RepoModelInput): RepoFinding[] {
  const findings: RepoFinding[] = [];
  checkSyntax([...input.elements, ...input.relations], findings);
  // A syntax error means the model is not reliably loaded; skip the graph checks
  // and report the syntax problems first (mirrors lint.py, which bails after
  // phase 1 on syntax errors).
  if (findings.length > 0) return findings;

  checkIdUniqueness(input, findings);
  checkAtomicity(input, findings);
  checkReferentialIntegrity(input, findings);
  checkLayerSemantics(input, findings);
  checkPolicy(input, findings);
  // Phase 7 — strategy-chain semantic rules ported from DSM's Go Validate*
  // functions (GOALS-010, ACT-006..009, FGCA-008..011).
  checkStrategyChainSemantics(input, findings);
  return findings;
}
