import { describe, it, expect } from 'vitest';
import { validateFactor } from '../validate.js';
import type { CanonCatalog } from '../../typed-id.js';

function validExternal(): Record<string, unknown> {
  return {
    notation: 'factor',
    id: 'FACTOR-EU-REG-1',
    name: 'EU regulatory window',
    type: 'external',
    category: 'legal',
    description: 'Standing external driver — the EU regulatory regime.',
    references_constraint: ['CONSTRAINT-GDPR-RESIDENCY-1'],
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-05-26',
    valid_to: null,
  };
}

function validInternal(): Record<string, unknown> {
  return {
    notation: 'factor',
    id: 'FACTOR-COMP-1',
    name: 'Support response time',
    type: 'internal',
    description: 'Standing internal driver.',
    zone: 'canon',
    admitted_at: '2026-05-29',
    admitted_by: 'v.korobeinikov',
    gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
    valid_from: '2026-05-26',
    valid_to: null,
  };
}

const codes = (input: unknown, opts?: Parameters<typeof validateFactor>[1]): string[] =>
  validateFactor(input, opts).errors.map(e => e.code);

describe('validateFactor — positive', () => {
  it('accepts a well-formed external PESTLE factor', () => {
    const r = validateFactor(validExternal());
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
  });

  it('accepts a well-formed internal factor (no PESTLE category)', () => {
    expect(validateFactor(validInternal()).valid).toBe(true);
  });

  it('accepts a minimal factor with no optional fields', () => {
    const f = validInternal();
    delete f.type;
    delete f.description;
    expect(validateFactor(f).valid).toBe(true);
  });
});

describe('validateFactor — FACTOR-001 (shape / id grammar)', () => {
  it('flags a missing required envelope field', () => {
    const f = validExternal();
    delete f.admitted_by;
    expect(codes(f)).toContain('FACTOR-001');
  });

  it('flags an id that violates the grammar', () => {
    expect(codes({ ...validExternal(), id: 'FACTOR-EU-REG-001' })).toContain('FACTOR-001');
    expect(codes({ ...validExternal(), id: 'FAC-1' })).toContain('FACTOR-001');
    expect(codes({ ...validExternal(), id: 'factor-1' })).toContain('FACTOR-001');
  });

  it('flags a wrong notation tag and a non-canon zone', () => {
    expect(codes({ ...validExternal(), notation: 'driver' })).toContain('FACTOR-001');
    expect(codes({ ...validExternal(), zone: 'sandbox' })).toContain('FACTOR-001');
  });

  it('flags a missing valid_to key (distinct from a null value)', () => {
    const f = validExternal();
    delete f.valid_to;
    expect(codes(f)).toContain('FACTOR-001');
  });

  it('rejects a non-object', () => {
    expect(codes(null)).toEqual(['FACTOR-001']);
    expect(codes(['a'])).toEqual(['FACTOR-001']);
  });
});

describe('validateFactor — FACTOR-002 (type enum)', () => {
  it('flags a type value outside {external, internal}', () => {
    expect(codes({ ...validExternal(), type: 'driver' })).toContain('FACTOR-002');
  });
});

describe('validateFactor — FACTOR-003 (PESTLE category)', () => {
  it('flags a category outside PESTLE', () => {
    expect(codes({ ...validExternal(), category: 'cosmic' })).toContain('FACTOR-003');
  });

  it('flags PESTLE category on an internal factor', () => {
    const f = validInternal();
    f.category = 'legal';
    expect(codes(f)).toContain('FACTOR-003');
  });

  it('accepts each permitted PESTLE category on an external factor', () => {
    for (const cat of ['political', 'economic', 'social', 'technological', 'legal', 'environmental']) {
      const f = validExternal();
      f.category = cat;
      expect(codes(f)).not.toContain('FACTOR-003');
    }
  });
});

describe('validateFactor — FACTOR-004 (references_constraint)', () => {
  it('flags a malformed references_constraint entry', () => {
    expect(codes({ ...validExternal(), references_constraint: ['not an id'] })).toContain('FACTOR-004');
  });

  it('flags a references_constraint entry of the wrong TYPE', () => {
    expect(codes({ ...validExternal(), references_constraint: ['GOAL-X-1'] })).toContain('FACTOR-004');
  });

  it('flags an unresolved id when a catalog is supplied', () => {
    const catalog: CanonCatalog = { typeOf: () => undefined };
    expect(codes(validExternal(), { catalog })).toContain('FACTOR-004');
  });

  it('does not flag without a catalog for a well-formed CONSTRAINT id', () => {
    expect(codes(validExternal())).not.toContain('FACTOR-004');
  });
});
