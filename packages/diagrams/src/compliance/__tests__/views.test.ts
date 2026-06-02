import { describe, it, expect } from 'vitest';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildLawTree, buildProductView } from '../views.js';
import type { ComplianceIndexInput } from '../types.js';

const input: ComplianceIndexInput = {
  requirements: [
    { id: 'REQUIREMENT-A-1', name: 'A', severity: 'high', derived_from: ['LAW-X-1'] },
    { id: 'REQUIREMENT-B-1', name: 'B', severity: 'low', derived_from: ['LAW-X-1', 'REGULATION-Y-1'] },
    { id: 'REQUIREMENT-C-1', name: 'C' }, // internal-only, no law
  ],
  assertions: [
    { id: 'ASSERTION-2', about: 'REQUIREMENT-A-1', subject: 'PRODUCT-M-1', status: 'compliant' },
    { id: 'ASSERTION-1', about: 'REQUIREMENT-A-1', subject: 'CAPABILITY-V2', status: 'under_review' },
    { id: 'ASSERTION-3', about: 'REQUIREMENT-B-1', subject: 'PRODUCT-M-1', status: 'partial' },
  ],
};

describe('buildComplianceIndex', () => {
  const idx = buildComplianceIndex(input);
  it('indexes requirements by the laws they derive from', () => {
    expect(idx.requirementsByLaw.get('LAW-X-1')?.map(r => r.id)).toEqual(['REQUIREMENT-A-1', 'REQUIREMENT-B-1']);
    expect(idx.requirementsByLaw.get('REGULATION-Y-1')?.map(r => r.id)).toEqual(['REQUIREMENT-B-1']);
    expect(idx.requirementsByLaw.has('LAW-NONE-1')).toBe(false);
  });
  it('indexes assertions by requirement and by subject', () => {
    expect(idx.assertionsByRequirement.get('REQUIREMENT-A-1')?.map(a => a.id).sort()).toEqual(['ASSERTION-1', 'ASSERTION-2']);
    expect(idx.assertionsBySubject.get('PRODUCT-M-1')?.map(a => a.id).sort()).toEqual(['ASSERTION-2', 'ASSERTION-3']);
  });
});

describe('buildLawTree', () => {
  const idx = buildComplianceIndex(input);
  it('lists requirements derived from the law, each with its id-sorted assertions', () => {
    const tree = buildLawTree('LAW-X-1', idx);
    expect(tree.requirements.map(r => r.requirement.id)).toEqual(['REQUIREMENT-A-1', 'REQUIREMENT-B-1']);
    expect(tree.requirements[0].assertions.map(a => a.id)).toEqual(['ASSERTION-1', 'ASSERTION-2']);
    expect(tree.requirements[0].assertions.map(a => a.status)).toEqual(['under_review', 'compliant']);
  });
  it('returns an empty tree for an unknown law', () => {
    expect(buildLawTree('LAW-NONE-1', idx).requirements).toEqual([]);
  });
});

describe('buildProductView', () => {
  const idx = buildComplianceIndex(input);
  it('lists the requirements the product is asserted against, with status, requirement-id-sorted', () => {
    const view = buildProductView('PRODUCT-M-1', idx);
    expect(view.requirements.map(r => r.requirement.id)).toEqual(['REQUIREMENT-A-1', 'REQUIREMENT-B-1']);
    expect(view.requirements.map(r => r.assertion.status)).toEqual(['compliant', 'partial']);
    expect(view.requirements[0].requirement.name).toBe('A');
  });
  it('falls back to the id as name when the requirement is not in the scan (dangling about)', () => {
    const idx2 = buildComplianceIndex({
      requirements: [],
      assertions: [{ id: 'ASSERTION-9', about: 'REQUIREMENT-GONE-1', subject: 'PRODUCT-M-1', status: 'n_a' }],
    });
    const view = buildProductView('PRODUCT-M-1', idx2);
    expect(view.requirements[0].requirement).toEqual({ id: 'REQUIREMENT-GONE-1', name: 'REQUIREMENT-GONE-1' });
  });
  it('returns an empty view for a product with no assertions', () => {
    expect(buildProductView('PRODUCT-NONE-1', idx).requirements).toEqual([]);
  });
});
