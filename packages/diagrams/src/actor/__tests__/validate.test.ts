import { describe, it, expect } from 'vitest';
import { validateActor } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'actor',
    id: 'ACTOR-OPS-1',
    name: 'Operations',
    type: 'business_unit',
    description: 'The operations organisation.',
    contact: 'ops@acme.example',
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

const codes = (input: unknown): string[] =>
  validateActor(input).errors.map(e => e.code);

describe('validateActor — positive', () => {
  it('accepts a well-formed business_unit actor', () => {
    const r = validateActor(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a person actor with no optional fields', () => {
    const a = valid();
    a.id = 'ACTOR-JANE-DOE-1';
    a.name = 'Jane Doe';
    a.type = 'person';
    delete a.description;
    delete a.contact;
    expect(validateActor(a).valid).toBe(true);
  });

  it('accepts a system actor with external_ref', () => {
    const a = valid();
    a.id = 'ACTOR-ORDER-MGMT-SYS-1';
    a.name = 'Order Management System';
    a.type = 'system';
    a.external_ref = 'https://oms.acme.example/api';
    expect(validateActor(a).valid).toBe(true);
  });
});

describe('validateActor — ACTOR-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field', () => {
    const a = valid();
    delete a.name;
    expect(codes(a)).toContain('ACTOR-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'ACTOR-OPS-001' })).toContain('ACTOR-001');
    expect(codes({ ...valid(), id: 'A-1' })).toContain('ACTOR-001');
  });

  it('flags a wrong notation tag and non-canon zone', () => {
    expect(codes({ ...valid(), notation: 'business_actor' })).toContain('ACTOR-001');
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('ACTOR-001');
  });

  it('flags a missing type', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).toContain('ACTOR-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('ACTOR-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['ACTOR-001']);
  });
});

describe('validateActor — ACTOR-002 (type enum)', () => {
  it('flags a type outside {person, business_unit, system}', () => {
    expect(codes({ ...valid(), type: 'organisation' })).toContain('ACTOR-002');
  });
});

describe('validateActor — ACTOR-003 (engagement fields forbidden inline)', () => {
  it('flags inline employment', () => {
    expect(codes({ ...valid(), employment: 'REL-EMP-1' })).toContain('ACTOR-003');
  });

  it('flags inline unit_parent', () => {
    expect(codes({ ...valid(), unit_parent: 'ACTOR-PARENT-1' })).toContain('ACTOR-003');
  });

  it('flags inline roles', () => {
    expect(codes({ ...valid(), roles: ['ROLE-OPS-1'] })).toContain('ACTOR-003');
  });

  it('flags inline owner', () => {
    expect(codes({ ...valid(), owner: 'ACTOR-OPS-1' })).toContain('ACTOR-003');
  });

  it('flags inline located_at (location belongs in a REL file)', () => {
    expect(codes({ ...valid(), located_at: 'LOCATION-TBILISI-1' })).toContain('ACTOR-003');
  });

  it('flags inline unit_located_at (location belongs in a REL file)', () => {
    expect(codes({ ...valid(), unit_located_at: 'LOCATION-TBILISI-1' })).toContain('ACTOR-003');
  });
});
