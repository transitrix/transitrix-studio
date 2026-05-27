import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateCapabilityMap } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'examples', 'capability-map');

const VALID_MAP = {
  notation: 'capability-map',
  capability_map: {
    id: 'CM-BUSINESS-001',
    name: 'Business Capabilities Map',
    assessment_date: '2026-05-08',
    capabilities: [
      {
        id: 'V1',
        name: 'Order Management',
        type: 'domain',
        current_maturity: 2,
        target_maturity: 3,
        target_date: '2026-12-31',
        children: [
          { id: 'V1.1', name: 'Order Intake', current_maturity: 3 },
          { id: 'V1.2', name: 'Order Fulfilment', current_maturity: 2, target_maturity: 3 },
        ],
      },
      {
        id: 'H1',
        name: 'Master Data Management',
        type: 'supporting',
        current_maturity: 1,
        target_maturity: 3,
      },
    ],
  },
};

describe('validateCapabilityMap', () => {
  it('passes on valid input', () => {
    const r = validateCapabilityMap(VALID_MAP);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('CMAP-001: rejects non-object input', () => {
    const r = validateCapabilityMap(null);
    expect(r.errors[0].code).toBe('CMAP-001');
  });

  it('CMAP-001: rejects missing notation', () => {
    const { notation: _, ...rest } = VALID_MAP;
    const r = validateCapabilityMap(rest);
    expect(r.errors.some(e => e.code === 'CMAP-001')).toBe(true);
  });

  it('CMAP-001: rejects wrong notation value', () => {
    const r = validateCapabilityMap({ ...VALID_MAP, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'CMAP-001')).toBe(true);
  });

  it('CMAP-002: rejects missing capability_map', () => {
    const r = validateCapabilityMap({ notation: 'capability-map' });
    expect(r.errors.some(e => e.code === 'CMAP-002')).toBe(true);
  });

  it('CMAP-002: rejects missing id/name/assessment_date', () => {
    const r = validateCapabilityMap({ notation: 'capability-map', capability_map: { capabilities: [] } });
    expect(r.errors.filter(e => e.code === 'CMAP-002').length).toBeGreaterThanOrEqual(3);
  });

  it('CMAP-002: rejects non-array capabilities', () => {
    const map = { ...VALID_MAP.capability_map, capabilities: 'oops' };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-002')).toBe(true);
  });

  it('CMAP-003: rejects capability missing id/name/current_maturity', () => {
    const map = { ...VALID_MAP.capability_map, capabilities: [{}] };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.filter(e => e.code === 'CMAP-003').length).toBeGreaterThanOrEqual(3);
  });

  it('CMAP-004: rejects invalid type', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', type: 'core', current_maturity: 2 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-004')).toBe(true);
  });

  it('CMAP-004: accepts type domain/supporting', () => {
    for (const type of ['domain', 'supporting']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id: 'V1', name: 'X', type, current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'CMAP-004')).toBe(false);
    }
  });

  it('CMAP-005: rejects current_maturity out of range', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 6 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-005')).toBe(true);
  });

  it('CMAP-005: rejects non-integer current_maturity', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2.5 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-005')).toBe(true);
  });

  it('CMAP-006: rejects target_maturity out of range', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, target_maturity: 0 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-006')).toBe(true);
  });

  it('CMAP-007: rejects malformed assessment_date', () => {
    const map = { ...VALID_MAP.capability_map, assessment_date: '08-05-2026' };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-007')).toBe(true);
  });

  it('CMAP-007: rejects malformed target_date on a node', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, target_date: 'tomorrow' }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-007')).toBe(true);
  });

  it('CMAP-008: rejects duplicate capability id across the tree', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [
        { id: 'V1', name: 'A', current_maturity: 2, children: [{ id: 'V1', name: 'B', current_maturity: 1 }] },
      ],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-008')).toBe(true);
  });

  it('CMAP-009: rejects malformed capability id', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'X1', name: 'A', current_maturity: 2 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-009')).toBe(true);
  });

  it('CMAP-009: accepts V/H ids with dotted levels', () => {
    for (const id of ['V1', 'V1.2', 'V1.2.3', 'H1', 'H1.2', 'H10.20.30']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id, name: 'A', current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'CMAP-009')).toBe(false);
    }
  });

  it('CMAP-009: accepts the canonical CAPABILITY- prefix', () => {
    for (const id of ['CAPABILITY-V1', 'CAPABILITY-V1.2', 'CAPABILITY-V1.2.3', 'CAPABILITY-H1', 'CAPABILITY-H1.2']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id, name: 'A', current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'CMAP-009')).toBe(false);
    }
  });

  it('validates children recursively', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{
        id: 'V1', name: 'Root', current_maturity: 2,
        children: [{ id: 'BAD_ID', name: 'X', current_maturity: 7 }],
      }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'CMAP-009')).toBe(true);
    expect(r.errors.some(e => e.code === 'CMAP-005')).toBe(true);
  });

  it('accepts empty capabilities array', () => {
    const map = { ...VALID_MAP.capability_map, capabilities: [] };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.valid).toBe(true);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it('[blocker] tolerates a null element in capabilities[] without throwing', () => {
    const map = { ...VALID_MAP.capability_map, capabilities: [null] };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'CMAP-003')).toBe(true);
  });

  it('[blocker] tolerates a null child capability without throwing', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, children: [null] }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'CMAP-003')).toBe(true);
  });
});

describe('capability-map examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates examples/capability-map/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateCapabilityMap(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
