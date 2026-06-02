import { describe, it, expect } from 'vitest';
import { buildComplianceMatrix, filterComplianceMatrix } from '../build.js';
import type { ComplianceMatrixInput } from '../types.js';

function input(over: Partial<ComplianceMatrixInput> = {}): ComplianceMatrixInput {
  return {
    products: [
      { id: 'PRODUCT-ECOMM-1', name: 'E-Commerce' },
      { id: 'PRODUCT-SUPPORT-1', name: 'Support' },
    ],
    requirements: [
      { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high' },
      { id: 'REQUIREMENT-AUDIT-LOG-RETENTION-1', name: 'Audit logs', severity: 'medium' },
    ],
    assertions: [
      { id: 'ASSERTION-1', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-ECOMM-1', status: 'compliant' },
    ],
    ...over,
  };
}

describe('buildComplianceMatrix', () => {
  it('sorts products as rows and requirements as columns by id', () => {
    const m = buildComplianceMatrix(input());
    expect(m.products.map(p => p.id)).toEqual(['PRODUCT-ECOMM-1', 'PRODUCT-SUPPORT-1']);
    expect(m.requirements.map(r => r.id)).toEqual([
      'REQUIREMENT-AUDIT-LOG-RETENTION-1',
      'REQUIREMENT-DATA-ERASURE-1',
    ]);
  });

  it('places an assertion status in the (product, requirement) cell and gaps elsewhere', () => {
    const m = buildComplianceMatrix(input());
    // row 0 = ECOMM; col 1 = DATA-ERASURE (after the sort)
    expect(m.cells[0][1]).toMatchObject({ status: 'compliant', assertionId: 'ASSERTION-1' });
    expect(m.cells[0][0].status).toBeUndefined(); // ECOMM × AUDIT-LOG → gap
    expect(m.cells[1][1].status).toBeUndefined(); // SUPPORT × DATA-ERASURE → gap
    expect(m.summary).toMatchObject({ products: 2, requirements: 2, assertions: 1, gaps: 3 });
  });

  it('adds a product-typed assertion subject with no product file as an unresolved row', () => {
    const m = buildComplianceMatrix(input({
      assertions: [
        { id: 'A1', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-MOBILE-1', status: 'partial' },
      ],
    }));
    const mobile = m.products.find(p => p.id === 'PRODUCT-MOBILE-1');
    expect(mobile).toMatchObject({ unresolved: true });
    const col = m.requirements.findIndex(r => r.id === 'REQUIREMENT-DATA-ERASURE-1');
    const row = m.products.findIndex(p => p.id === 'PRODUCT-MOBILE-1');
    expect(m.cells[row][col].status).toBe('partial');
  });

  it('ignores assertions whose subject is not a PRODUCT', () => {
    const m = buildComplianceMatrix(input({
      assertions: [
        { id: 'A1', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'CAPABILITY-V2', status: 'compliant' },
        { id: 'A2', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PROCESS-X-1', status: 'partial' },
      ],
    }));
    expect(m.summary.assertions).toBe(0);
    expect(m.products.map(p => p.id)).toEqual(['PRODUCT-ECOMM-1', 'PRODUCT-SUPPORT-1']);
  });
});

describe('filterComplianceMatrix', () => {
  it('trims requirement columns by severity', () => {
    const m = buildComplianceMatrix(input());
    const f = filterComplianceMatrix(m, { severities: ['high'] });
    expect(f.requirements.map(r => r.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
    expect(f.cells[0]).toHaveLength(1);
    expect(f.cells[0][0]).toMatchObject({ status: 'compliant' });
  });

  it('blanks cells whose status is filtered out, preserving the grid shape', () => {
    const m = buildComplianceMatrix(input());
    const f = filterComplianceMatrix(m, { statuses: ['non_compliant'] });
    // The compliant cell is now hidden (treated as a gap); columns unchanged.
    expect(f.requirements).toHaveLength(2);
    expect(f.cells[0][1].status).toBeUndefined();
    expect(f.summary.assertions).toBe(0);
  });

  it('is a no-op when no filter dimension is set', () => {
    const m = buildComplianceMatrix(input());
    const f = filterComplianceMatrix(m, {});
    expect(f.summary).toEqual(m.summary);
  });
});
