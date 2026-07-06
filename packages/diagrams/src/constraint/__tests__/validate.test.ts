import { describe, it, expect } from 'vitest';
import { validateConstraint } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'constraint',
    id: 'CONSTRAINT-GDPR-RESIDENCY-1',
    name: 'EU customer personal data must be stored within EU/EEA jurisdictions',
    statement: 'Personal data of EU customers MUST NOT be persisted outside EU / EEA jurisdictions.',
    status: 'active',
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2018-05-25',
    valid_to: null,
    severity: 'mandatory',
    owner_role: 'ROLE-DPO-1',
    applies_to: ['APPLICATION-CRM-1'],
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateConstraint>[1]): string[] =>
  validateConstraint(input, opts).errors.map((e) => e.code);

describe('validateConstraint — positive', () => {
  it('accepts a well-formed constraint', () => {
    const r = validateConstraint(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });
});

describe('validateConstraint — CONST-001', () => {
  it('flags missing required fields and wrong notation', () => {
    const r = valid();
    delete r.statement;
    expect(codes(r)).toContain('CONST-001');
    expect(codes({ ...valid(), notation: 'requirement' })).toContain('CONST-001');
    expect(codes({ ...valid(), id: 'CONSTRAINT-001' })).toContain('CONST-001');
  });
});

describe('validateConstraint — CONST-002/003', () => {
  it('flags invalid status and severity', () => {
    expect(codes({ ...valid(), status: 'enabled' })).toContain('CONST-002');
    expect(codes({ ...valid(), severity: 'critical' })).toContain('CONST-003');
  });
});

describe('validateConstraint — CONST-004/005 (catalog)', () => {
  it('flags unresolved applies_to and owner_role with catalog', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes(valid(), { catalog })).toContain('CONST-004');
    expect(codes(valid(), { catalog })).toContain('CONST-005');
  });

  it('does not flag CONST-004 without catalog for well-formed applies_to', () => {
    expect(codes(valid())).not.toContain('CONST-004');
  });

  it('resolves applies_to when catalogue admits the target', () => {
    const catalog: CanonCatalog = {
      typeOf: (id) => (id === 'APPLICATION-CRM-1' ? 'APPLICATION' : id === 'ROLE-DPO-1' ? 'ROLE' : undefined),
    };
    expect(validateConstraint(valid(), { catalog }).valid).toBe(true);
  });
});
