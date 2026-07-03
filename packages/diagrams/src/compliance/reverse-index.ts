// Reverse-index builder (vkgeorgia/strategy#84 Phase 3).

import type { ComplianceIndex, ComplianceIndexInput, IndexAssertion, IndexRequirement } from './types.js';

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Builds the reverse indexes used by every compliance view. Pure; the input
 * arrays are read, not mutated. Requirements with no `derived_from` simply do
 * not appear under any law; assertions are indexed by both their requirement
 * (`about`) and their subject.
 */
export function buildComplianceIndex(input: ComplianceIndexInput): ComplianceIndex {
  const requirementById = new Map<string, IndexRequirement>();
  const requirementsByLaw = new Map<string, IndexRequirement[]>();
  const assertionsByRequirement = new Map<string, IndexAssertion[]>();
  const assertionsBySubject = new Map<string, IndexAssertion[]>();
  const requirementsByParent = new Map<string, IndexRequirement[]>();

  for (const r of input.requirements) {
    requirementById.set(r.id, r);
    for (const law of r.derived_from ?? []) push(requirementsByLaw, law, r);
    if (r.parent) push(requirementsByParent, r.parent, r);
  }
  for (const a of input.assertions) {
    push(assertionsByRequirement, a.about, a);
    push(assertionsBySubject, a.subject, a);
  }

  return { requirementById, requirementsByLaw, assertionsByRequirement, assertionsBySubject, requirementsByParent };
}
