import { describe, it, expect } from 'vitest';
import { validateFGCADoc } from '../validate.js';

const VALID_DOC = {
  notation: 'fgca',
  factors: [{ id: 1, name: 'Market pressure' }],
  goals: [{ id: 1, name: 'Grow revenue', factor: [{ id: 1 }] }],
  changes: [{ id: 1, name: 'Launch product', goal_id: 1, activity_ids: [1] }],
  activities: [{ id: 1, name: 'Market research', goal_id: 1 }],
};

describe('validateFGCADoc', () => {
  it('accepts a valid document', () => {
    const result = validateFGCADoc(VALID_DOC);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validateFGCADoc('string').valid).toBe(false);
    expect(validateFGCADoc(null).valid).toBe(false);
    expect(validateFGCADoc(42).valid).toBe(false);
  });

  it('errors on missing notation field', () => {
    const { notation: _, ...without } = VALID_DOC;
    const result = validateFGCADoc(without);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('MISSING_NOTATION');
  });

  it('errors on wrong notation value', () => {
    const result = validateFGCADoc({ ...VALID_DOC, notation: 'goals' });
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('WRONG_NOTATION');
  });

  it('errors when factors array is missing', () => {
    const { factors: _, ...without } = VALID_DOC;
    const result = validateFGCADoc({ ...without, notation: 'fgca' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'factors')).toBe(true);
  });

  it('errors when goals array is missing', () => {
    const { goals: _, ...without } = VALID_DOC;
    const result = validateFGCADoc({ ...without, notation: 'fgca' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'goals')).toBe(true);
  });

  it('errors when changes array is missing', () => {
    const { changes: _, ...without } = VALID_DOC;
    const result = validateFGCADoc({ ...without, notation: 'fgca' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'changes')).toBe(true);
  });

  it('errors when activities array is missing', () => {
    const { activities: _, ...without } = VALID_DOC;
    const result = validateFGCADoc({ ...without, notation: 'fgca' });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'activities')).toBe(true);
  });

  it('errors on empty factor name', () => {
    const result = validateFGCADoc({ ...VALID_DOC, factors: [{ id: 1, name: '' }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'EMPTY_NAME')).toBe(true);
  });

  it('errors on empty goal name', () => {
    const result = validateFGCADoc({ ...VALID_DOC, goals: [{ id: 1, name: '  ', factor: [] }] });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'EMPTY_NAME')).toBe(true);
  });

  it('warns on broken factor reference in goal', () => {
    const result = validateFGCADoc({
      ...VALID_DOC,
      goals: [{ id: 1, name: 'Goal', factor: [{ id: 99 }] }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'BROKEN_REF' && w.message.includes('factor 99'))).toBe(true);
  });

  it('warns on broken goal reference in change', () => {
    const result = validateFGCADoc({
      ...VALID_DOC,
      changes: [{ id: 1, name: 'Change', goal_id: 99, activity_ids: [] }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'BROKEN_REF' && w.message.includes('goal 99'))).toBe(true);
  });

  it('warns on broken activity reference in change', () => {
    const result = validateFGCADoc({
      ...VALID_DOC,
      changes: [{ id: 1, name: 'Change', goal_id: 1, activity_ids: [99] }],
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.code === 'BROKEN_REF' && w.message.includes('activity 99'))).toBe(true);
  });

  it('accepts a document with empty arrays', () => {
    const result = validateFGCADoc({
      notation: 'fgca',
      factors: [],
      goals: [],
      changes: [],
      activities: [],
    });
    expect(result.valid).toBe(true);
  });

  it('accepts optional spec_version field', () => {
    const result = validateFGCADoc({ ...VALID_DOC, spec_version: '0.1' });
    expect(result.valid).toBe(true);
  });
});
