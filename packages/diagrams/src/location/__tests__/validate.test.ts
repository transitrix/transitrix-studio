import { describe, it, expect } from 'vitest';
import { validateLocation } from '../validate.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'location',
    id: 'LOCATION-TBILISI-1',
    name: 'Tbilisi Office',
    type: 'office',
    address: '14 Rustaveli Ave, Tbilisi 0108, Georgia',
    country_code: 'GE',
    timezone: 'Asia/Tbilisi',
    zone: 'canon',
    admitted_at: '2026-06-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2024-01-01',
    valid_to: null,
  };
}

const codes = (input: unknown): string[] =>
  validateLocation(input).errors.map(e => e.code);

describe('validateLocation — positive', () => {
  it('accepts a well-formed office location', () => {
    const r = validateLocation(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a country with no optional fields', () => {
    const a = valid();
    a.id = 'LOCATION-GE-1';
    a.name = 'Georgia';
    a.type = 'country';
    delete a.address;
    delete a.country_code;
    delete a.timezone;
    expect(validateLocation(a).valid).toBe(true);
  });

  it('accepts a virtual location', () => {
    const a = valid();
    a.id = 'LOCATION-VIRTUAL-1';
    a.name = 'Remote';
    a.type = 'virtual';
    expect(validateLocation(a).valid).toBe(true);
  });

  it('accepts a location with a valid parent reference', () => {
    expect(validateLocation({ ...valid(), parent: 'LOCATION-GE-1' }).valid).toBe(true);
  });

  it('accepts valid_to as a date string', () => {
    expect(validateLocation({ ...valid(), valid_to: '2026-12-31' }).valid).toBe(true);
  });
});

describe('validateLocation — LOC-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field (name)', () => {
    const a = valid();
    delete a.name;
    expect(codes(a)).toContain('LOC-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'LOCATION-001' })).toContain('LOC-001');
    expect(codes({ ...valid(), id: 'LOC-1' })).toContain('LOC-001');
  });

  it('flags a wrong notation tag', () => {
    expect(codes({ ...valid(), notation: 'place' })).toContain('LOC-001');
  });

  it('flags a non-canon zone', () => {
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('LOC-001');
  });

  it('flags a missing zone', () => {
    const a = valid();
    delete a.zone;
    expect(codes(a)).toContain('LOC-001');
  });

  it('flags a missing type', () => {
    const a = valid();
    delete a.type;
    expect(codes(a)).toContain('LOC-001');
  });

  it('flags a missing valid_to key', () => {
    const a = valid();
    delete a.valid_to;
    expect(codes(a)).toContain('LOC-001');
  });

  it('flags missing gate_checks', () => {
    const a = valid();
    delete a.gate_checks;
    expect(codes(a)).toContain('LOC-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['LOC-001']);
  });
});

describe('validateLocation — LOC-002 (type enum)', () => {
  it('flags a type outside the allowed enum', () => {
    expect(codes({ ...valid(), type: 'building' })).toContain('LOC-002');
    expect(codes({ ...valid(), type: 'facility' })).toContain('LOC-002');
  });
});

describe('validateLocation — LOC-003 (parent grammar)', () => {
  it('flags a parent that is not a LOCATION-… id', () => {
    expect(codes({ ...valid(), parent: 'ACTOR-OPS-1' })).toContain('LOC-003');
    expect(codes({ ...valid(), parent: 'not-an-id' })).toContain('LOC-003');
  });

  it('accepts a null or absent parent without error', () => {
    expect(codes({ ...valid(), parent: undefined })).not.toContain('LOC-003');
    const a = valid();
    delete a.parent;
    expect(codes(a)).not.toContain('LOC-003');
  });
});
