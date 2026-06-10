import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateProcessMap } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'process-map');

const VALID_MAP = {
  notation: 'process-map',
  process_map: {
    id: 'PM-ENT-001',
    name: 'Enterprise Process Landscape',
    updated_at: '2026-05-08',
    groups: [
      {
        id: 'GRP-OPERATING',
        name: 'Operating Processes',
        type: 'operating',
        processes: [
          { process_id: 'PROC-ORD-FULFILL-001', name: 'Order Fulfilment', status: 'Active', maturity: 2 },
          { process_id: 'PROC-CUST-ONBOARD-001', name: 'Customer Onboarding', status: 'Draft' },
        ],
      },
      {
        id: 'GRP-SUPPORTING',
        name: 'Supporting Processes',
        type: 'supporting',
        processes: [
          { process_id: 'PROC-HR-RECRUIT-001', name: 'Recruitment', status: 'Active' },
        ],
      },
    ],
  },
};

describe('validateProcessMap', () => {
  it('passes on valid input', () => {
    const r = validateProcessMap(VALID_MAP);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('PMAP-001: rejects non-object input', () => {
    const r = validateProcessMap(null);
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('PMAP-001');
  });

  it('PMAP-001: rejects missing notation', () => {
    const { notation: _, ...rest } = VALID_MAP;
    const r = validateProcessMap(rest);
    expect(r.errors.some(e => e.code === 'PMAP-001')).toBe(true);
  });

  it('PMAP-001: rejects wrong notation value', () => {
    const r = validateProcessMap({ ...VALID_MAP, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'PMAP-001')).toBe(true);
  });

  it('PMAP-002: rejects missing process_map', () => {
    const r = validateProcessMap({ notation: 'process-map' });
    expect(r.errors.some(e => e.code === 'PMAP-002')).toBe(true);
  });

  it('PMAP-002: rejects missing id/name/updated_at', () => {
    const r = validateProcessMap({ notation: 'process-map', process_map: { groups: [] } });
    expect(r.errors.filter(e => e.code === 'PMAP-002').length).toBeGreaterThanOrEqual(3);
  });

  it('PMAP-002: rejects non-array groups', () => {
    const map = { ...VALID_MAP.process_map, groups: 'oops' };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-002')).toBe(true);
  });

  it('PMAP-003: rejects group missing id/name/type', () => {
    const map = { ...VALID_MAP.process_map, groups: [{ processes: [] }] };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.filter(e => e.code === 'PMAP-003').length).toBeGreaterThanOrEqual(3);
  });

  it('PMAP-004: rejects invalid group type', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'X', type: 'random', processes: [] }],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-004')).toBe(true);
  });

  it('PMAP-004: accepts all valid group types', () => {
    for (const type of ['operating', 'supporting', 'management']) {
      const map = {
        ...VALID_MAP.process_map,
        groups: [{ id: 'g1', name: 'X', type, processes: [] }],
      };
      const r = validateProcessMap({ ...VALID_MAP, process_map: map });
      expect(r.errors.some(e => e.code === 'PMAP-004')).toBe(false);
    }
  });

  it('PMAP-005: rejects process missing process_id/name/status', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'G', type: 'operating', processes: [{}] }],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.filter(e => e.code === 'PMAP-005').length).toBeGreaterThanOrEqual(3);
  });

  it('PMAP-006: rejects invalid status', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'G', type: 'operating', processes: [
        { process_id: 'p1', name: 'X', status: 'Retired' },
      ]}],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-006')).toBe(true);
  });

  it('PMAP-007: rejects out-of-range maturity', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'G', type: 'operating', processes: [
        { process_id: 'p1', name: 'X', status: 'Active', maturity: 6 },
      ]}],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-007')).toBe(true);
  });

  it('PMAP-007: accepts maturity 1-5', () => {
    for (const maturity of [1, 2, 3, 4, 5]) {
      const map = {
        ...VALID_MAP.process_map,
        groups: [{ id: 'g1', name: 'G', type: 'operating', processes: [
          { process_id: 'p1', name: 'X', status: 'Active', maturity },
        ]}],
      };
      const r = validateProcessMap({ ...VALID_MAP, process_map: map });
      expect(r.errors.some(e => e.code === 'PMAP-007')).toBe(false);
    }
  });

  it('PMAP-008: rejects malformed updated_at', () => {
    const map = { ...VALID_MAP.process_map, updated_at: '13-05-2026' };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-008')).toBe(true);
  });

  it('PMAP-009: rejects duplicate process_id across groups', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [
        { id: 'g1', name: 'A', type: 'operating', processes: [{ process_id: 'P1', name: 'X', status: 'Active' }] },
        { id: 'g2', name: 'B', type: 'supporting', processes: [{ process_id: 'P1', name: 'Y', status: 'Active' }] },
      ],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-009')).toBe(true);
  });

  it('PMAP-010: rejects duplicate group id', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [
        { id: 'gdup', name: 'A', type: 'operating', processes: [] },
        { id: 'gdup', name: 'B', type: 'supporting', processes: [] },
      ],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.errors.some(e => e.code === 'PMAP-010')).toBe(true);
  });

  it('accepts empty groups array', () => {
    const map = { ...VALID_MAP.process_map, groups: [] };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.valid).toBe(true);
  });

  it('accepts group with no processes field', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'G', type: 'operating' }],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.valid).toBe(true);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it('[blocker] tolerates a null element in groups[] without throwing', () => {
    const map = { ...VALID_MAP.process_map, groups: [null] };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PMAP-003')).toBe(true);
  });

  it('[blocker] tolerates a null element in processes[] without throwing', () => {
    const map = {
      ...VALID_MAP.process_map,
      groups: [{ id: 'g1', name: 'G', type: 'operating', processes: [null] }],
    };
    const r = validateProcessMap({ ...VALID_MAP, process_map: map });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'PMAP-005')).toBe(true);
  });
});

describe('process-map examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates tests/fixtures/notation-corpus/process-map/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateProcessMap(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
