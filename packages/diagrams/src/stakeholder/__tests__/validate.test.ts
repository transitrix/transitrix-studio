import { describe, it, expect } from 'vitest';
import { validateStakeholder } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'stakeholder',
    id: 'STAKEHOLDER-DPA-1',
    name: 'Data Protection Authority',
    type: 'external',
    actor: 'ACTOR-DPA-1',
    concern: 'Lawful processing and timely erasure of personal data.',
    interest: 'high',
    influence: 'high',
    description: 'External oversight stakeholder.',
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2018-05-25',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateStakeholder>[1]): string[] =>
  validateStakeholder(input, opts).errors.map(e => e.code);

describe('validateStakeholder — positive', () => {
  it('accepts a well-formed external stakeholder', () => {
    const r = validateStakeholder(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a minimal internal stakeholder with no optional profile fields', () => {
    const s = valid();
    s.id = 'STAKEHOLDER-OPS-1';
    s.name = 'Operations';
    s.type = 'internal';
    s.actor = 'ACTOR-OPS-1';
    delete s.concern;
    delete s.interest;
    delete s.influence;
    delete s.description;
    expect(validateStakeholder(s).valid).toBe(true);
  });

  it('accepts when the catalog resolves the actor', () => {
    const catalog: CanonCatalog = { typeOf: id => (id === 'ACTOR-DPA-1' ? 'ACTOR' : undefined) };
    expect(validateStakeholder(valid(), { catalog }).valid).toBe(true);
  });
});

describe('validateStakeholder — STAKE-001 (shape / id grammar / levels)', () => {
  it('flags a missing required envelope field', () => {
    const s = valid();
    delete s.name;
    expect(codes(s)).toContain('STAKE-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'STAKEHOLDER-DPA-001' })).toContain('STAKE-001');
    expect(codes({ ...valid(), id: 'STAKE-1' })).toContain('STAKE-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'stakeholders' })).toContain('STAKE-001');
  });

  it('flags an interest / influence value outside {high, medium, low}', () => {
    expect(codes({ ...valid(), interest: 'critical' })).toContain('STAKE-001');
    expect(codes({ ...valid(), influence: 'none' })).toContain('STAKE-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['STAKE-001']);
  });
});

describe('validateStakeholder — STAKE-002 (actor binding)', () => {
  it('flags a missing actor', () => {
    const s = valid();
    delete s.actor;
    expect(codes(s)).toContain('STAKE-002');
  });

  it('flags an actor of the wrong TYPE', () => {
    expect(codes({ ...valid(), actor: 'ROLE-OPS-1' })).toContain('STAKE-002');
  });

  it('flags an actor that does not resolve when a catalog is supplied', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes(valid(), { catalog })).toContain('STAKE-002');
  });

  it('flags an actor whose catalog TYPE is not ACTOR', () => {
    const catalog: CanonCatalog = { typeOf: () => 'ROLE' };
    expect(codes(valid(), { catalog })).toContain('STAKE-002');
  });
});

describe('validateStakeholder — STAKE-003 (type enum)', () => {
  it('flags a type outside {internal, external}', () => {
    expect(codes({ ...valid(), type: 'partner' })).toContain('STAKE-003');
  });
});
