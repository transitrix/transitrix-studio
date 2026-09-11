import { describe, expect, it } from 'vitest';
import { completionPercentState } from '../completion-percent.js';
import { renderFgcaSvg } from '../render-fgca.js';
import { parseCanonicalFGCA, parseCanonicalFGA } from '../../fgca/parse-canonical.js';

const now = Date.parse('2026-09-11T00:00:00Z');
describe('completion percentage contract', () => {
  it('uses the seven-day boundary and preserves zero', () => {
    expect(completionPercentState({ percent: 0, computedAt: '2026-09-04T00:00:00Z' }, true, true, now)).toEqual({ label: '0%', stale: false });
    expect(completionPercentState({ percent: 63, computedAt: '2026-09-03T23:59:59Z' }, true, true, now)).toEqual({ label: '63%', stale: true });
    expect(completionPercentState(undefined, true)).toEqual({ label: '–%', stale: false });
    expect(completionPercentState(undefined, false)).toBeUndefined();
    expect(completionPercentState({ percent: 63, computedAt: new Date(now).toISOString() }, true, false)).toBeUndefined();
  });
  for (const notation of ['dgca', 'dga']) {
    it(`${notation} uses tracker links independently of goals and renders validated progress`, () => {
      const input = { notation, id: `${notation.toUpperCase()}-TEST-1`, name: 'Test',
        factors: [{ id: 'DRIVER-TEST-1', name: 'Driver', type: 'external' }],
        goals: [{ id: 'GOAL-TEST-1', name: 'Goal', factors: ['DRIVER-TEST-1'] }], changes: [],
        actions: [
          { id: 'ACTION-TEST-1', name: 'Action', goals: ['GOAL-TEST-1'] },
          { id: 'ACTION-TEST-2', name: 'Linked', goals: ['GOAL-TEST-1'], link: 'https://example.com/tasks/2' },
        ],
      };
      const parse = notation === 'dgca' ? parseCanonicalFGCA : parseCanonicalFGA;
      const result = parse(input, undefined, undefined, new Map([['ACTION-TEST-2', { percent: 63, computedAt: '2000-01-01T00:00:00Z' }]]));
      expect(result.valid, JSON.stringify(result.errors)).toBe(true);
      const svg = renderFgcaSvg(result.parsed!, { hideChanges: notation === 'dga', showCompletionPercent: true });
      expect(svg).toMatch(/opacity="0.5"[^>]*>63%<\/text>/);
      expect(svg).not.toContain('>–%<');
      const absent = renderFgcaSvg(parse(input).parsed!, { hideChanges: notation === 'dga', showCompletionPercent: true });
      expect(absent.match(/>–%</g)).toHaveLength(1);
      expect(renderFgcaSvg(result.parsed!, { showCompletionPercent: false })).not.toContain('>63%<');
    });
  }
});
