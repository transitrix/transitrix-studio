import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import yaml from 'js-yaml';
import { coerceDatesToIsoStrings } from '../yaml-normalize.js';
import { validateActivities } from '../activities/index.js';

describe('coerceDatesToIsoStrings', () => {
  it('replaces top-level Date with ISO YYYY-MM-DD string', () => {
    const out = coerceDatesToIsoStrings(new Date(Date.UTC(2026, 5, 1))); // 2026-06-01 UTC
    expect(out).toBe('2026-06-01');
  });

  it('replaces Date values inside nested arrays of objects', () => {
    const input = {
      activities: [
        { id: 'A-001', start_date: new Date(Date.UTC(2026, 5, 1)), end_date: new Date(Date.UTC(2026, 5, 5)) },
        { id: 'A-002', start_date: '2026-06-06' },
      ],
    };
    coerceDatesToIsoStrings(input);
    expect(input.activities[0].start_date).toBe('2026-06-01');
    expect(input.activities[0].end_date).toBe('2026-06-05');
    expect(input.activities[1].start_date).toBe('2026-06-06');
  });

  it('walks objects recursively', () => {
    const input = {
      project: { start_date: new Date(Date.UTC(2026, 0, 15)) },
    };
    coerceDatesToIsoStrings(input);
    expect(input.project.start_date).toBe('2026-01-15');
  });

  it('leaves non-Date values untouched', () => {
    const input = {
      notation: 'activities',
      activities: [{ id: 'A-001', duration: 3, start_date: '2026-06-01' }],
    };
    const out = coerceDatesToIsoStrings(input);
    expect(out).toBe(input);
    expect(input.activities[0].start_date).toBe('2026-06-01');
    expect(input.activities[0].duration).toBe(3);
  });

  it('handles null, undefined, and primitive scalars', () => {
    expect(coerceDatesToIsoStrings(null)).toBe(null);
    expect(coerceDatesToIsoStrings(undefined)).toBe(undefined);
    expect(coerceDatesToIsoStrings('hello')).toBe('hello');
    expect(coerceDatesToIsoStrings(42)).toBe(42);
    expect(coerceDatesToIsoStrings(true)).toBe(true);
  });

  it('handles arrays that contain bare Date elements', () => {
    const arr = [new Date(Date.UTC(2026, 5, 1)), 'x', { d: new Date(Date.UTC(2026, 5, 2)) }];
    coerceDatesToIsoStrings(arr);
    expect(arr[0]).toBe('2026-06-01');
    expect(arr[1]).toBe('x');
    expect((arr[2] as { d: unknown }).d).toBe('2026-06-02');
  });
});

describe('coerceDatesToIsoStrings — js-yaml integration', () => {
  it('quoted ISO dates are preserved untouched', () => {
    const text = [
      'notation: action',
      'actions:',
      '  - id: "A-001"',
      '    name: "Quoted dates"',
      '    duration: 3',
      '    start_date: "2026-06-01"',
      '    end_date: "2026-06-03"',
      '',
    ].join('\n');
    const parsed = yaml.load(text) as { actions: { start_date: unknown; end_date: unknown }[] };
    coerceDatesToIsoStrings(parsed);
    expect(parsed.actions[0].start_date).toBe('2026-06-01');
    expect(parsed.actions[0].end_date).toBe('2026-06-03');
    const v = validateActivities(parsed);
    expect(v.valid).toBe(true);
  });

  it('bare ISO dates are coerced to ISO strings and pass validation', () => {
    const text = [
      'notation: action',
      'actions:',
      '  - id: "A-001"',
      '    name: "Bare dates"',
      '    duration: 3',
      '    start_date: 2026-06-01',
      '    end_date: 2026-06-03',
      '',
    ].join('\n');
    const parsed = yaml.load(text) as { actions: { start_date: unknown; end_date: unknown }[] };
    // Without coercion, js-yaml returns Date instances and the validator
    // would emit ACT-008 because typeof !== 'string'. Sanity-check that
    // assumption before normalisation.
    expect(parsed.actions[0].start_date).toBeInstanceOf(Date);
    coerceDatesToIsoStrings(parsed);
    expect(parsed.actions[0].start_date).toBe('2026-06-01');
    expect(parsed.actions[0].end_date).toBe('2026-06-03');
    const v = validateActivities(parsed);
    expect(v.valid).toBe(true);
  });
});

// The issue calls out the timezone trap: a Date built from a bare ISO
// date is midnight UTC, but if we used `getFullYear / getMonth / getDate`
// instead of the UTC variants, a non-UTC process timezone would shift the
// day. Pin a non-UTC TZ for this block so the regression bites if anyone
// later swaps to local-time accessors.
describe('coerceDatesToIsoStrings — non-UTC timezone', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    // Pacific/Auckland is UTC+12/+13 — the most aggressive eastward shift
    // available without DST gymnastics. If local-time accessors are used,
    // `2026-06-01` parsed as midnight UTC reads back as `2026-06-01 12:00
    // local`, which is still the right day — so use a westward TZ for the
    // real test below. Auckland is here as a sanity case.
    process.env.TZ = 'Pacific/Auckland';
  });
  afterAll(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('does not drift the day forward in an eastward timezone', () => {
    const text = 'd: 2026-06-01\n';
    const parsed = yaml.load(text) as { d: unknown };
    coerceDatesToIsoStrings(parsed);
    expect(parsed.d).toBe('2026-06-01');
  });
});

describe('coerceDatesToIsoStrings — westward (negative offset) timezone', () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    // Pacific/Honolulu is UTC-10, no DST. Midnight UTC `2026-06-01` reads
    // back as `2026-05-31 14:00 local`. Local-time accessors would yield
    // `2026-05-31` — wrong by one day. UTC accessors yield `2026-06-01`.
    process.env.TZ = 'Pacific/Honolulu';
  });
  afterAll(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('does not drift the day backward in a westward timezone', () => {
    const text = 'd: 2026-06-01\n';
    const parsed = yaml.load(text) as { d: unknown };
    coerceDatesToIsoStrings(parsed);
    expect(parsed.d).toBe('2026-06-01');
  });
});
