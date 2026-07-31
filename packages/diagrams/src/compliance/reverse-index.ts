// Reverse-index builder (Phase 3).

import type {
  ComplianceIndex,
  ComplianceIndexInput,
  IndexAssertion,
  IndexRequirement,
  IndexVerification,
  IndexNeed,
  IndexValidation,
} from './types.js';

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * Builds the reverse indexes used by every compliance view. Pure; the input
 * arrays are read, not mutated. Requirements with no `derived_from` simply do
 * not appear under any law; assertions are indexed by both their requirement
 * (`about`) and their subject; verifications are indexed by their requirement
 * (`verifies`) — an independent catalogue from assertions (27-verification.md §4).
 * Needs are indexed by id; requirements are additionally indexed by the NEED
 * they `serves` (15-requirement.md §2.7), and validations by the NEED they
 * `validate` (28-validation.md §2) — both feed the NEED-side coverage rules
 * (ELEMENT_PRIMITIVES.md §9).
 */
export function buildComplianceIndex(input: ComplianceIndexInput): ComplianceIndex {
  const requirementById = new Map<string, IndexRequirement>();
  const requirementsByLaw = new Map<string, IndexRequirement[]>();
  const assertionsByRequirement = new Map<string, IndexAssertion[]>();
  const assertionsBySubject = new Map<string, IndexAssertion[]>();
  const requirementsByParent = new Map<string, IndexRequirement[]>();
  const verificationsByRequirement = new Map<string, IndexVerification[]>();
  const needById = new Map<string, IndexNeed>();
  const requirementsByNeed = new Map<string, IndexRequirement[]>();
  const validationsByNeed = new Map<string, IndexValidation[]>();

  for (const r of input.requirements) {
    requirementById.set(r.id, r);
    for (const law of r.derived_from ?? []) push(requirementsByLaw, law, r);
    if (r.parent) push(requirementsByParent, r.parent, r);
    if (r.serves) push(requirementsByNeed, r.serves, r);
  }
  for (const a of input.assertions) {
    push(assertionsByRequirement, a.about, a);
    push(assertionsBySubject, a.subject, a);
  }
  for (const v of input.verifications ?? []) {
    push(verificationsByRequirement, v.verifies, v);
  }
  for (const n of input.needs ?? []) {
    needById.set(n.id, n);
  }
  for (const v of input.validations ?? []) {
    push(validationsByNeed, v.validates, v);
  }

  return {
    requirementById, requirementsByLaw, assertionsByRequirement, assertionsBySubject,
    requirementsByParent, verificationsByRequirement,
    needById, requirementsByNeed, validationsByNeed,
  };
}
