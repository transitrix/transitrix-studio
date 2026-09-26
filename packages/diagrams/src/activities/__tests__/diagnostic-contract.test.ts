import { describe, expect, it } from 'vitest';
import { validateActivities } from '../validate.js';
import { validateRepoModel } from '../../repo-validate/validate-repo.js';

function findings(fields: Record<string, unknown>, version?: string) {
  const action = { notation: 'action', id: 'ACTION-1', name: 'Example', ...fields };
  const canonical = validateRepoModel({ methodologyVersion: version,
    elements: [{ path: 'canon/elements/ACTION-1.yaml', data: action }], relations: [] });
  const inline = validateActivities({ notation: 'action', actions: [action] }, { methodologyVersion: version });
  return [canonical.map(f => f.ruleId), inline.errors.map(f => f.code)];
}

describe('ACTION diagnostic contract in canonical and inline forms', () => {
  for (const field of ['duration', 'duration_days', 'labor_cost', 'resources_cost', 'effort', 'score']) {
    it(`${field} respects the catalogue version boundary`, () => {
      for (const version of [undefined, '6.0.0', '6.9.0', '7.0.0-rc.0']) {
        for (const codes of findings({ [field]: -1, spec_version: '7.0.0' }, version)) expect(codes).not.toContain('ACTION-011');
      }
      for (const codes of findings({ [field]: -1 }, '7.0.0')) expect(codes).toContain('ACTION-011');
      for (const codes of findings({ [field]: 0 }, '7.0.0')) expect(codes).not.toContain('ACTION-011');
    });
    it(`${field} rejects strings, booleans and nonfinite numbers`, () => {
      for (const value of ['2', false, Infinity, NaN, {}, []]) {
        for (const codes of findings({ [field]: value }, '6.0.0')) expect(codes).toContain('SCHEMA_INVALID');
      }
    });
  }
  it('preserves independent aliases, nullable durations and signed sort', () => {
    for (const codes of findings({ duration: 2, duration_days: -1, sort: -2 }, '7.0.0')) expect(codes.filter(c => c === 'ACTION-011')).toHaveLength(1);
    for (const codes of findings({ duration: null, duration_days: null, sort: -2 }, '7.0.0')) expect(codes).not.toContain('SCHEMA_INVALID');
    for (const codes of findings({ duration: 0.5, duration_days: 1.5, labor_cost: 0.5, score: 2 }, '7.0.0')) expect(codes).not.toContain('SCHEMA_INVALID');
  });
  it('requires integer scores, nonnull costs and an array of predecessor IDs', () => {
    for (const fields of [{ score: 2.5 }, { score: null }, { effort: null }, { predecessors: {} }, { predecessors: [2] }]) {
      for (const codes of findings(fields, '6.0.0')) expect(codes).toContain('SCHEMA_INVALID');
    }
  });
  it('rejects calendar-invalid dates in both forms', () => {
    for (const value of ['2026-02-30', ['2026-01-01'], 20260101, '']) {
      for (const codes of findings({ start_date: value })) expect(codes).toContain('ACTION-010');
    }
  });
  it('retains a visible unresolved-reference warning without inventing a cycle', () => {
    const result = validateActivities({ notation: 'action', actions: [{ id: 'ACTION-1', name: 'Example', predecessors: ['ACTION-2'] }] });
    expect(result.valid).toBe(true);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'ACTION-007' }));
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: 'ACT-009' }));
  });
});
