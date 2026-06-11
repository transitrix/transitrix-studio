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

import type { RepoDoc, RepoFinding, RepoModelInput } from './types.js';

const PScope: RepoFinding['scope'] = 'repo';

/** Statuses that, per lint.py's policy check, require an owner. */
const OWNER_REQUIRED_STATUSES = new Set(['Active', 'Production']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Read a string `id` from a parsed doc, or `null` if absent/non-string.
 *  Mirrors lint.py, which only treats a doc as an element/relation when it has
 *  a top-level `id` (sidecars such as versioned-attribute files have no `id`
 *  and are ignored). */
function docId(doc: RepoDoc): string | null {
  if (!doc.data) return null;
  const id = doc.data['id'];
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Resolve a relation endpoint, which may be a bare id string or a `{ id }`
 *  mapping (lint.py accepts both). Returns the id string or `null`. */
function endpointId(value: unknown): string | null {
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

/** Phase 5 — ArchiMate layer-semantics on relations.
 *
 * lint.py ships `_check_semantic_rules` as a no-op stub (`pass`). It is ported
 * here faithfully as a no-op so repo-scope validation reaches parity with
 * lint.py on the reference fixture. Real layer-semantics rules are DEFERRED
 * until the methodology defines them; when it does, they land here (a relation
 * whose `type` is illegal between its endpoints' ArchiMate layers). Kept as a
 * named hook so the intent — and the gap — is explicit rather than missing. */
function checkLayerSemantics(_input: RepoModelInput, _findings: RepoFinding[]): void {
  // Intentionally empty — parity with lint.py's stubbed phase 5. Do not add
  // rules here without coordinating the methodology semantics canon.
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
 * semantics, policy). Reaches parity with `lint.py` on the `acme_corp` fixture
 * (zero findings on a clean tree).
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
  return findings;
}
