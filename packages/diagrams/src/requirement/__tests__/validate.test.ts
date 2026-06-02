import { describe, it, expect } from 'vitest';
import { validateRequirement } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function valid(): Record<string, unknown> {
  return {
    notation: 'requirement',
    id: 'REQUIREMENT-DATA-ERASURE-1',
    name: 'Personal-data erasure within 30 days',
    description: 'The controller must erase personal data within 30 days of a verified request.',
    severity: 'high',
    zone: 'canon',
    admitted_at: '2026-05-28',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2017-05-01',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateRequirement>[1]): string[] =>
  validateRequirement(input, opts).errors.map(e => e.code);

describe('validateRequirement — positive', () => {
  it('accepts a well-formed requirement', () => {
    const r = validateRequirement(valid());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('accepts an internal-only requirement with no derived_from', () => {
    const r = valid();
    delete r.derived_from;
    r.severity = 'medium';
    expect(validateRequirement(r).valid).toBe(true);
  });
});

describe('validateRequirement — REQ-001 (shape / id grammar)', () => {
  it('flags a missing required field', () => {
    const r = valid();
    delete r.name;
    expect(codes(r)).toContain('REQ-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...valid(), id: 'REQUIREMENT-DATA-ERASURE-001' })).toContain('REQ-001'); // leading zero
    expect(codes({ ...valid(), id: 'REQ-1' })).toContain('REQ-001'); // wrong TYPE
    expect(codes({ ...valid(), id: 'requirement-data-1' })).toContain('REQ-001'); // lowercase TYPE
  });

  it('flags a wrong notation tag and a non-canon zone', () => {
    expect(codes({ ...valid(), notation: 'req' })).toContain('REQ-001');
    expect(codes({ ...valid(), zone: 'sandbox' })).toContain('REQ-001');
  });

  it('flags a missing valid_to key (distinct from a null value)', () => {
    const r = valid();
    delete r.valid_to;
    expect(codes(r)).toContain('REQ-001');
    expect(validateRequirement({ ...valid(), valid_to: null }).valid).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['REQ-001']);
    expect(codes('x')).toEqual(['REQ-001']);
    expect(codes(['a'])).toEqual(['REQ-001']);
  });
});

describe('validateRequirement — REQ-002 (derived_from resolution)', () => {
  it('flags a well-formed allowed-type ref that does not resolve in the catalog', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes({ ...valid(), derived_from: ['LAW-PERSONAL-DATA-2017-1'] }, { catalog })).toContain('REQ-002');
  });

  it('flags a malformed derived_from entry (cannot resolve)', () => {
    expect(codes({ ...valid(), derived_from: ['not an id'] })).toContain('REQ-002');
  });

  it('does not flag REQ-002 without a catalog for a well-formed allowed-type ref', () => {
    expect(codes({ ...valid(), derived_from: ['LAW-PERSONAL-DATA-2017-1'] })).not.toContain('REQ-002');
  });
});

describe('validateRequirement — REQ-003 (derived_from TYPE)', () => {
  it('flags a derived_from TYPE outside LAW/REGULATION/POLICY/INTERNAL_STANDARD', () => {
    expect(codes({ ...valid(), derived_from: ['PRODUCT-MOBILE-1'] })).toContain('REQ-003');
  });

  it('accepts each permitted derived_from TYPE', () => {
    for (const id of ['LAW-X-1', 'REGULATION-X-1', 'POLICY-X-1', 'INTERNAL_STANDARD-X-1']) {
      expect(codes({ ...valid(), derived_from: [id] })).not.toContain('REQ-003');
    }
  });
});
