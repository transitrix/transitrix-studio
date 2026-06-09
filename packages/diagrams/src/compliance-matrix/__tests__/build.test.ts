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

describe('buildComplianceMatrix — jurisdiction resolution (F16)', () => {
  it('resolves Requirement.jurisdictions from derived_from → codex', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
        { id: 'REQUIREMENT-AUDIT-LOG-RETENTION-1', name: 'Audit logs', severity: 'medium',
          derived_from: ['LAW-AUDIT-2020-1', 'LAW-PERSONAL-DATA-2017-1'] },
      ],
      codex: [
        { id: 'LAW-PERSONAL-DATA-2017-1', jurisdiction: 'ge' },
        { id: 'LAW-AUDIT-2020-1', jurisdiction: 'eu' },
      ],
    }));
    const erasure = m.requirements.find(r => r.id === 'REQUIREMENT-DATA-ERASURE-1')!;
    const audit = m.requirements.find(r => r.id === 'REQUIREMENT-AUDIT-LOG-RETENTION-1')!;
    expect(erasure.jurisdictions).toEqual(['ge']);
    // Sorted, deduplicated union.
    expect(audit.jurisdictions).toEqual(['eu', 'ge']);
  });

  it('leaves jurisdictions undefined when no codex source resolves', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-INTERNAL-1', name: 'Internal', severity: 'low' },
        { id: 'REQUIREMENT-DANGLING-1', name: 'Dangling', severity: 'low',
          derived_from: ['LAW-MISSING-1'] },
      ],
      codex: [{ id: 'LAW-OTHER-1', jurisdiction: 'us' }],
    }));
    expect(m.requirements.find(r => r.id === 'REQUIREMENT-INTERNAL-1')!.jurisdictions).toBeUndefined();
    expect(m.requirements.find(r => r.id === 'REQUIREMENT-DANGLING-1')!.jurisdictions).toBeUndefined();
  });

  it('ignores codex entries with no jurisdiction (e.g. internal POLICY)', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['POLICY-INTERNAL-1'] },
      ],
      codex: [{ id: 'POLICY-INTERNAL-1' }],
    }));
    expect(m.requirements[0].jurisdictions).toBeUndefined();
  });

  it('works with no codex input (backwards-compatible)', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
      ],
    }));
    expect(m.requirements[0].jurisdictions).toBeUndefined();
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

  it('keeps only columns whose resolved jurisdiction is in the filter (F16)', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
        { id: 'REQUIREMENT-AUDIT-LOG-RETENTION-1', name: 'Audit logs', severity: 'medium',
          derived_from: ['LAW-AUDIT-2020-1'] },
      ],
      codex: [
        { id: 'LAW-PERSONAL-DATA-2017-1', jurisdiction: 'ge' },
        { id: 'LAW-AUDIT-2020-1', jurisdiction: 'eu' },
      ],
    }));
    const f = filterComplianceMatrix(m, { jurisdictions: ['ge'] });
    expect(f.requirements.map(r => r.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
    expect(f.cells[0]).toHaveLength(1);
  });

  it('drops requirements with no resolved jurisdiction when the filter is active', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
        { id: 'REQUIREMENT-INTERNAL-1', name: 'Internal', severity: 'low' },
      ],
      codex: [{ id: 'LAW-PERSONAL-DATA-2017-1', jurisdiction: 'ge' }],
    }));
    const f = filterComplianceMatrix(m, { jurisdictions: ['ge'] });
    expect(f.requirements.map(r => r.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
  });

  it('combines jurisdiction filter with severity (intersection)', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-DATA-ERASURE-1', name: 'Erasure', severity: 'high',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
        { id: 'REQUIREMENT-DATA-PORTABILITY-1', name: 'Portability', severity: 'medium',
          derived_from: ['LAW-PERSONAL-DATA-2017-1'] },
      ],
      codex: [{ id: 'LAW-PERSONAL-DATA-2017-1', jurisdiction: 'ge' }],
    }));
    const f = filterComplianceMatrix(m, { jurisdictions: ['ge'], severities: ['high'] });
    expect(f.requirements.map(r => r.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
  });

  it('empty jurisdiction array is treated as no-filter on that dimension', () => {
    const m = buildComplianceMatrix(input({
      requirements: [
        { id: 'REQUIREMENT-INTERNAL-1', name: 'Internal', severity: 'low' },
      ],
    }));
    const f = filterComplianceMatrix(m, { jurisdictions: [] });
    expect(f.requirements).toHaveLength(1);
  });
});
