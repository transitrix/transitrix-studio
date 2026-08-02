import { describe, it, expect } from 'vitest';
import { validateNeed } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'need',
    id: 'NEED-TIMELY-OUTAGE-STATUS-1',
    name: 'Customers need to know service status within minutes of an outage starting',
    description: 'When the service is degraded or unavailable, affected customers need a reliable, timely signal.',
    stakeholder: 'STAKEHOLDER-ENTERPRISE-CUSTOMERS-1',
    zone: 'canon',
    admitted_at: '2026-07-30',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-07-30',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateNeed>[1]): string[] =>
  validateNeed(input, opts).errors.map(e => e.code);

describe('validateNeed — positive', () => {
  it('accepts a well-formed need', () => {
    const r = validateNeed(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('validateNeed — NEED-001 (shape / id grammar / required fields)', () => {
  it('flags id grammar and wrong notation', () => {
    expect(codes({ ...valid(), id: 'NEED_1' })).toContain('NEED-001');
    expect(codes({ ...valid(), notation: 'stakeholder-need' })).toContain('NEED-001');
  });

  it('flags missing admission/lifecycle fields', () => {
    const noAdmit = valid(); delete noAdmit.admitted_at;
    expect(codes(noAdmit)).toContain('NEED-001');
    const noValidTo = valid(); delete noValidTo.valid_to;
    expect(codes(noValidTo)).toContain('NEED-001');
  });

  it('flags a missing stakeholder as NEED-001', () => {
    const r = valid(); delete r.stakeholder;
    expect(codes(r)).toContain('NEED-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['NEED-001']);
  });
});

describe('validateNeed — NEED-002 (stakeholder → STAKEHOLDER)', () => {
  it('flags a stakeholder that is not a typed STAKEHOLDER id', () => {
    expect(codes({ ...valid(), stakeholder: 'ACTOR-CUSTOMERS-1' })).toContain('NEED-002');
  });

  it('accepts a well-formed STAKEHOLDER id without a catalog', () => {
    expect(codes(valid())).not.toContain('NEED-002');
  });

  it('with a catalog, flags an unresolved stakeholder and accepts a resolved one', () => {
    const missing: CanonCatalog = { typeOf: () => undefined };
    expect(codes(valid(), { catalog: missing })).toContain('NEED-002');

    const present: CanonCatalog = {
      typeOf: (id) => (id === 'STAKEHOLDER-ENTERPRISE-CUSTOMERS-1' ? 'STAKEHOLDER' : undefined),
    };
    expect(codes(valid(), { catalog: present })).not.toContain('NEED-002');
  });
});
