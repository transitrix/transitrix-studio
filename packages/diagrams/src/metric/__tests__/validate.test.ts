import { describe, it, expect } from 'vitest';
import { validateMetric } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'metric',
    id: 'METRIC-CHECKOUT-CONVERSION-1',
    name: 'Checkout conversion rate',
    description: 'Share of started checkouts that complete successfully.',
    measures: ['GOAL-CHECKOUT-SIMPLIFICATION-1'],
    unit: 'percent',
    target: 68,
    direction_of_good: 'higher_is_better',
    owner_role: 'ROLE-ECOMMERCE-LEAD-1',
    zone: 'canon',
    admitted_at: '2026-07-30',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-07-30',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateMetric>[1]): string[] =>
  validateMetric(input, opts).errors.map(e => e.code);

describe('validateMetric — positive', () => {
  it('accepts a well-formed metric', () => {
    const r = validateMetric(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateMetric — METRIC-001 (shape / id grammar / required fields)', () => {
  it('flags id grammar and wrong notation', () => {
    expect(codes({ ...valid(), id: 'MET-1' })).toContain('METRIC-001');
    expect(codes({ ...valid(), notation: 'indicator' })).toContain('METRIC-001');
  });

  it('flags missing admission/lifecycle fields', () => {
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('METRIC-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('METRIC-001');
  });

  it('flags each missing required per-type field', () => {
    for (const f of ['measures', 'unit', 'target', 'direction_of_good', 'owner_role']) {
      const r = valid();
      delete r[f];
      expect(codes(r), f).toContain('METRIC-001');
    }
  });

  it('flags a non-numeric target', () => {
    expect(codes({ ...valid(), target: '68' })).toContain('METRIC-001');
  });

  it('flags an empty measures list as METRIC-001', () => {
    expect(codes({ ...valid(), measures: [] })).toContain('METRIC-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['METRIC-001']);
  });
});

describe('validateMetric — METRIC-002 (measures → GOAL | CAPABILITY | PROCESS)', () => {
  it('flags a measures entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), measures: ['PRODUCT-X-1'] })).toContain('METRIC-002');
  });

  it('accepts GOAL, CAPABILITY, and PROCESS entries', () => {
    expect(codes({ ...valid(), measures: ['GOAL-X-1'] })).not.toContain('METRIC-002');
    expect(codes({ ...valid(), measures: ['CAPABILITY-V1'] })).not.toContain('METRIC-002');
    expect(codes({ ...valid(), measures: ['PROCESS-X-1'] })).not.toContain('METRIC-002');
  });

  it('with a catalog, flags an unresolved measures entry', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid() }, { catalog })).toContain('METRIC-002');
  });
});

describe('validateMetric — METRIC-003 (direction_of_good enum)', () => {
  it('flags an out-of-enum value', () => {
    expect(codes({ ...valid(), direction_of_good: 'bigger_is_better' })).toContain('METRIC-003');
  });

  it('accepts every direction_of_good value', () => {
    for (const v of ['higher_is_better', 'lower_is_better', 'on_target']) {
      expect(codes({ ...valid(), direction_of_good: v })).not.toContain('METRIC-003');
    }
  });
});

describe('validateMetric — METRIC-004 (owner_role → ROLE)', () => {
  it('flags an owner_role that is not a typed ROLE id', () => {
    expect(codes({ ...valid(), owner_role: 'ACTOR-X-1' })).toContain('METRIC-004');
  });

  it('accepts a well-formed ROLE id without a catalog', () => {
    expect(codes({ ...valid(), owner_role: 'ROLE-X-1' })).not.toContain('METRIC-004');
  });

  it('with a catalog, flags an unresolved owner_role', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid() }, { catalog })).toContain('METRIC-004');
  });
});
