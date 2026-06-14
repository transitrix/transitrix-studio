import { describe, it, expect } from 'vitest';
import { validateChange } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'change',
    id: 'CHANGE-EU-CRM-1',
    name: 'Stand up EU-localised CRM and payment processing',
    goals: ['GOAL-EU-1'],
    description: 'The required delta to operate in EU markets.',
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-05-26',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateChange>[1]): string[] =>
  validateChange(input, opts).errors.map(e => e.code);

describe('validateChange — positive', () => {
  it('accepts a well-formed change', () => {
    const r = validateChange(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a minimal change with no optional fields', () => {
    const c = valid();
    delete c.goals;
    delete c.description;
    expect(validateChange(c).valid).toBe(true);
  });

  it('accepts a child change with a CHANGE parent', () => {
    const c = valid();
    c.id = 'CHANGE-EU-CRM-2';
    c.parent = 'CHANGE-EU-CRM-1';
    expect(validateChange(c).valid).toBe(true);
  });
});

describe('validateChange — CHANGE-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field', () => {
    const c = valid();
    delete c.name;
    expect(codes(c)).toContain('CHANGE-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'CHANGE-EU-CRM-001' })).toContain('CHANGE-001');
    expect(codes({ ...valid(), id: 'CHG-1' })).toContain('CHANGE-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'gap' })).toContain('CHANGE-001');
  });

  it('flags a non-array goals', () => {
    expect(codes({ ...valid(), goals: 'GOAL-EU-1' })).toContain('CHANGE-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['CHANGE-001']);
  });
});

describe('validateChange — CHANGE-002 (goals references)', () => {
  it('flags a malformed goals entry', () => {
    expect(codes({ ...valid(), goals: ['not an id'] })).toContain('CHANGE-002');
  });

  it('flags a goals entry of the wrong TYPE', () => {
    expect(codes({ ...valid(), goals: ['FACTOR-X-1'] })).toContain('CHANGE-002');
  });

  it('flags an unresolved id when a catalog is supplied', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes(valid(), { catalog })).toContain('CHANGE-002');
  });
});

describe('validateChange — CHANGE-003 (parent)', () => {
  it('flags a parent of the wrong TYPE', () => {
    expect(codes({ ...valid(), parent: 'GOAL-X-1' })).toContain('CHANGE-003');
  });

  it('flags a parent equal to self', () => {
    expect(codes({ ...valid(), parent: 'CHANGE-EU-CRM-1' })).toContain('CHANGE-003');
  });

  it('flags a malformed parent', () => {
    expect(codes({ ...valid(), parent: 'not an id' })).toContain('CHANGE-003');
  });
});
