// Requirement traceability + hierarchy builder.
//
// Two halves, both origin-agnostic per 15-requirement.md §2.1:
//
//   1. Trace chain — `derived_from` sources → the REQUIREMENT / CONSTRAINT
//      itself → any ASSERTION targeting it (`about`) → the asserted `subject`
//      + `realised_via` elements. Assertion coverage applies to REQUIREMENT
//      only (16-assertion.md §1); CONSTRAINT trace shows sources + hierarchy
//      only.
//
//   2. Hierarchy — the `parent` chain (ancestors, root last) plus the direct
//      children (elements whose `parent` names this one). Same-TYPE only per
//      15-requirement.md §2.4; the chain terminates at the first missing or
//      cyclic parent so a broken model still renders something useful.
//
// Pure: takes the reverse index + a name-resolution map + optional codex list;
// no IO. `ComplianceCodexDoc` comes from the scanner so we get jurisdiction
// alongside the codex id in the sources block.

import type {
  ComplianceIndex,
  IndexRequirement,
  RequirementTrace,
  TraceAssertionRow,
  TraceElementCatalog,
  TraceElementRef,
  TraceSourceRef,
} from './types.js';
import type { ComplianceCodexDoc } from './classify.js';

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function resolveElement(id: string, catalog: TraceElementCatalog): TraceElementRef {
  const name = catalog.nameById.get(id);
  return name ? { id, name } : { id };
}

/**
 * Walk the `parent` chain upward from `requirement`, stopping at the first
 * missing or already-seen parent (cycle guard). Returns immediate parent first,
 * root last. Empty array when the element has no `parent`.
 */
function collectAncestors(
  requirement: IndexRequirement,
  index: ComplianceIndex,
): IndexRequirement[] {
  const out: IndexRequirement[] = [];
  const seen = new Set<string>([requirement.id]);
  let current: IndexRequirement | undefined = requirement;
  while (current?.parent && !seen.has(current.parent)) {
    seen.add(current.parent);
    const next = index.requirementById.get(current.parent);
    if (!next) break;
    out.push(next);
    current = next;
  }
  return out;
}

/**
 * Builds the REQUIREMENT / CONSTRAINT traceability view.
 *
 * @param requirementId typed id of the element to trace
 * @param index         reverse index built by `buildComplianceIndex`
 * @param catalog       name-resolution map for subject / realised_via refs
 * @param codex         optional codex artefact list (from the scanner); when
 *                      supplied, `sources[].codex` is populated with the
 *                      resolved codex artefact for jurisdiction display
 */
export function buildRequirementTrace(
  requirementId: string,
  index: ComplianceIndex,
  catalog: TraceElementCatalog,
  codex: ComplianceCodexDoc[] = [],
): RequirementTrace {
  const requirement: IndexRequirement =
    index.requirementById.get(requirementId) ?? { id: requirementId, name: requirementId };

  const codexById = new Map<string, ComplianceCodexDoc>();
  for (const c of codex) codexById.set(c.id, c);

  const sources: TraceSourceRef[] = (requirement.derived_from ?? []).map(sid => {
    const c = codexById.get(sid);
    return c ? { id: sid, codex: c } : { id: sid };
  });

  const rawAssertions = index.assertionsByRequirement.get(requirementId) ?? [];
  const assertions: TraceAssertionRow[] = [...rawAssertions]
    .sort(byId)
    .map(assertion => ({
      assertion,
      subject: resolveElement(assertion.subject, catalog),
      realisedVia: (assertion.realised_via ?? []).map(rid => resolveElement(rid, catalog)),
    }));

  const ancestors = collectAncestors(requirement, index);
  const children = [...(index.requirementsByParent.get(requirementId) ?? [])].sort(byId);

  return { requirement, sources, assertions, ancestors, children };
}

/**
 * Convenience: build a `TraceElementCatalog` from the scanned canon's product
 * and subject buckets. Requirements/assertions are excluded — they are indexed
 * separately by `buildComplianceIndex`; the catalog is only for resolving the
 * elements a trace references (subjects + realised_via).
 */
export function buildTraceElementCatalog(
  products: Array<{ id: string; name: string }>,
  subjects: Array<{ id: string; name: string }>,
): TraceElementCatalog {
  const nameById = new Map<string, string>();
  for (const p of products) nameById.set(p.id, p.name);
  for (const s of subjects) nameById.set(s.id, s.name);
  return { nameById };
}
