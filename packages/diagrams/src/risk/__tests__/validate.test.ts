import { describe, it, expect } from 'vitest';
import { validateRisk } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'risk',
    id: 'RISK-VENDOR-OUTAGE-1',
    name: 'Primary payment-gateway vendor suffers an extended outage',
    description: 'The organisation\'s sole payment-gateway integration has no failover provider.',
    likelihood: 'medium',
    impact: 'high',
    residual: 'medium',
    owner_role: 'ROLE-PAYMENTS-LEAD-1',
    threatens: ['DRIVER-CHECKOUT-AVAILABILITY-1'],
    treated_by: ['REQUIREMENT-PAYMENT-FAILOVER-1'],
    zone: 'canon',
    admitted_at: '2026-07-30',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-07-30',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateRisk>[1]): string[] =>
  validateRisk(input, opts).errors.map(e => e.code);
const warnCodes = (input: unknown, opts?: Parameters<typeof validateRisk>[1]): string[] =>
  validateRisk(input, opts).warnings.map(w => w.code);

describe('validateRisk — positive', () => {
  it('accepts a well-formed risk', () => {
    const r = validateRisk(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateRisk — RISK-001 (shape / id grammar / required fields)', () => {
  it('flags id grammar and wrong notation', () => {
    expect(codes({ ...valid(), id: 'RSK-1' })).toContain('RISK-001');
    expect(codes({ ...valid(), notation: 'hazard' })).toContain('RISK-001');
  });

  it('flags missing admission/lifecycle fields', () => {
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('RISK-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('RISK-001');
  });

  it('flags each missing required per-type field', () => {
    for (const f of ['likelihood', 'impact', 'residual', 'owner_role', 'threatens']) {
      const r = valid();
      delete r[f];
      expect(codes(r), f).toContain('RISK-001');
    }
  });

  it('flags an empty threatens list as RISK-001', () => {
    expect(codes({ ...valid(), threatens: [] })).toContain('RISK-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['RISK-001']);
  });
});

describe('validateRisk — RISK-002 (likelihood/impact/residual enum)', () => {
  it('flags an out-of-enum value for each field', () => {
    expect(codes({ ...valid(), likelihood: 'extreme' })).toContain('RISK-002');
    expect(codes({ ...valid(), impact: 'extreme' })).toContain('RISK-002');
    expect(codes({ ...valid(), residual: 'extreme' })).toContain('RISK-002');
  });

  it('accepts every level value', () => {
    for (const v of ['low', 'medium', 'high']) {
      expect(codes({ ...valid(), likelihood: v, impact: v, residual: v })).not.toContain('RISK-002');
    }
  });
});

describe('validateRisk — RISK-003 (threatens resolution)', () => {
  it('flags a malformed threatens entry', () => {
    expect(codes({ ...valid(), threatens: ['not an id'] })).toContain('RISK-003');
  });

  it('accepts any resolvable TYPE without a catalog', () => {
    expect(codes({ ...valid(), threatens: ['GOAL-CHECKOUT-1'] })).not.toContain('RISK-003');
  });

  it('with a catalog, flags an unresolved threatens entry', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid() }, { catalog })).toContain('RISK-003');
  });
});

describe('validateRisk — RISK-004 (treated_by → REQUIREMENT | CONSTRAINT)', () => {
  it('is not checked when treated_by is absent', () => {
    const r = valid(); delete r.treated_by;
    expect(codes(r)).not.toContain('RISK-004');
  });

  it('flags a treated_by entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), treated_by: ['GOAL-X-1'] })).toContain('RISK-004');
  });

  it('accepts REQUIREMENT and CONSTRAINT treated_by entries', () => {
    expect(codes({ ...valid(), treated_by: ['REQUIREMENT-X-1'] })).not.toContain('RISK-004');
    expect(codes({ ...valid(), treated_by: ['CONSTRAINT-X-1'] })).not.toContain('RISK-004');
  });

  it('with a catalog, flags an unresolved treated_by entry', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid() }, { catalog })).toContain('RISK-004');
  });
});

describe('validateRisk — RISK-COVERAGE-001 (untreated risk, warning)', () => {
  it('warns when treated_by is absent', () => {
    const r = valid(); delete r.treated_by;
    expect(warnCodes(r)).toContain('RISK-COVERAGE-001');
  });

  it('warns when treated_by is empty', () => {
    expect(warnCodes({ ...valid(), treated_by: [] })).toContain('RISK-COVERAGE-001');
  });

  it('does not warn when treated_by is non-empty', () => {
    expect(warnCodes(valid())).not.toContain('RISK-COVERAGE-001');
  });
});
