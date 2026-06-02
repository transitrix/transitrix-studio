// Single-law tree + single-product view builders (vkgeorgia/strategy#84 Phase 3).

import type {
  ComplianceIndex,
  IndexRequirement,
  LawTree,
  ProductView,
} from './types.js';

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Law → Requirements → Assertions. Requirements are those whose `derived_from`
 * names `lawId`; each carries the assertions targeting it. An unknown law (no
 * requirement derives from it) yields an empty tree.
 */
export function buildLawTree(lawId: string, index: ComplianceIndex): LawTree {
  const requirements = [...(index.requirementsByLaw.get(lawId) ?? [])].sort(byId);
  return {
    lawId,
    requirements: requirements.map(requirement => ({
      requirement,
      assertions: [...(index.assertionsByRequirement.get(requirement.id) ?? [])].sort(byId),
    })),
  };
}

/**
 * Product → the Requirements it has an assertion about, with each assertion's
 * status. The requirement is resolved from the index; a dangling `about`
 * (assertion references a requirement not in the scan) falls back to a stub
 * carrying the id as its name, so the binding still shows.
 */
export function buildProductView(productId: string, index: ComplianceIndex): ProductView {
  const assertions = [...(index.assertionsBySubject.get(productId) ?? [])];
  const requirements = assertions
    .map(assertion => {
      const requirement: IndexRequirement =
        index.requirementById.get(assertion.about) ?? { id: assertion.about, name: assertion.about };
      return { requirement, assertion };
    })
    .sort((a, b) => byId(a.requirement, b.requirement));
  return { productId, requirements };
}
