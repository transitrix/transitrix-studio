import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateCapabilityMap } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'capability-map');

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
    const authored = structuredClone(VALID_MAP);
    const resolved = new Map<string, {current_maturity: number}>();
    function separate(nodes: any[]) {
      for (const node of nodes) {
        resolved.set(node.id, {current_maturity: node.current_maturity});
        for (const field of ['current_maturity', 'target_maturity', 'target_date']) delete node[field];
        if (node.children) separate(node.children);
      }
    }
    separate(authored.capability_map.capabilities);
    const r = validateCapabilityMap(authored, {resolvedAttributes: resolved});
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('SCHEMA_INVALID: rejects non-object input', () => {
    const r = validateCapabilityMap(null);
    expect(r.errors[0].code).toBe('SCHEMA_INVALID');
  });

  it('HDR-001: rejects missing notation', () => {
    const { notation: _, ...rest } = VALID_MAP;
    const r = validateCapabilityMap(rest);
    expect(r.errors.some(e => e.code === 'HDR-001')).toBe(true);
  });

  it('HDR-002: rejects wrong notation value', () => {
    const r = validateCapabilityMap({ ...VALID_MAP, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'HDR-002')).toBe(true);
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

  it('SCHEMA_INVALID: rejects capability missing id/name/current_maturity', () => {
    const map = { ...VALID_MAP.capability_map, capabilities: [{}] };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map }, {resolvedAttributes: new Map()});
    expect(r.errors.filter(e => e.code === 'SCHEMA_INVALID').length).toBeGreaterThanOrEqual(3);
  });

  it('SCHEMA_INVALID: rejects invalid type', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', type: 'core', current_maturity: 2 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: accepts type domain/supporting', () => {
    for (const type of ['domain', 'supporting']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id: 'V1', name: 'X', type, current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(false);
    }
  });

  it('SCHEMA_INVALID: rejects current_maturity out of range', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 6 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects non-integer current_maturity', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2.5 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects target_maturity out of range', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, target_maturity: 0 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects malformed assessment_date', () => {
    const map = { ...VALID_MAP.capability_map, assessment_date: '08-05-2026' };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects malformed target_date on a node', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, target_date: 'tomorrow' }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects duplicate capability id across the tree', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [
        { id: 'V1', name: 'A', current_maturity: 2, children: [{ id: 'V1', name: 'B', current_maturity: 1 }] },
      ],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: rejects malformed capability id', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'X1', name: 'A', current_maturity: 2 }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('SCHEMA_INVALID: accepts V/H ids with dotted levels', () => {
    for (const id of ['V1', 'V1.2', 'V1.2.3', 'H1', 'H1.2', 'H10.20.30']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id, name: 'A', current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(false);
    }
  });

  it('SCHEMA_INVALID: accepts the canonical CAPABILITY- prefix', () => {
    for (const id of ['CAPABILITY-V1', 'CAPABILITY-V1.2', 'CAPABILITY-V1.2.3', 'CAPABILITY-H1', 'CAPABILITY-H1.2']) {
      const map = {
        ...VALID_MAP.capability_map,
        capabilities: [{ id, name: 'A', current_maturity: 2 }],
      };
      const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
      expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(false);
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
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
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
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('[blocker] tolerates a null child capability without throwing', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, children: [null] }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  // DSM rule codes (api02/internal/importer/capabilities.go), ported alongside
  // the pre-existing CMAP-*/native codes above — see the module header note.
  it('HDR-001: rejects missing notation without a duplicate schema finding', () => {
    const { notation: _, ...rest } = VALID_MAP;
    const r = validateCapabilityMap(rest);
    expect(r.errors.map(e => e.code)).toEqual(['HDR-001']);
  });

  it('HDR-002: rejects wrong notation value without a duplicate schema finding', () => {
    const r = validateCapabilityMap({ ...VALID_MAP, notation: 'goals' });
    expect(r.errors.map(e => e.code)).toEqual(['HDR-002']);
  });

  it('does not flag HDR-001/002 on valid input', () => {
    const r = validateCapabilityMap(VALID_MAP);
    expect(r.errors.some(e => e.code === 'HDR-001' || e.code === 'HDR-002')).toBe(false);
  });

  it('LIFECYCLE-001: rejects a malformed valid_from', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, valid_from: '01/01/2026' }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'LIFECYCLE-001')).toBe(true);
  });

  it('LIFECYCLE-001: rejects a malformed valid_to', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{ id: 'V1', name: 'X', current_maturity: 2, valid_to: 'not-a-date' }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'LIFECYCLE-001')).toBe(true);
  });

  it('LIFECYCLE-004: rejects valid_to before valid_from', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{
        id: 'V1', name: 'X', current_maturity: 2,
        valid_from: '2026-06-01', valid_to: '2026-01-01',
      }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'LIFECYCLE-004')).toBe(true);
  });

  it('accepts a well-formed valid_from/valid_to lifecycle, including on nested children', () => {
    const map = {
      ...VALID_MAP.capability_map,
      capabilities: [{
        id: 'V1', name: 'X', current_maturity: 2,
        valid_from: '2026-01-01', valid_to: null,
        children: [{ id: 'V1.1', name: 'Y', current_maturity: 2, valid_from: '2026-01-01', valid_to: '2027-12-31' }],
      }],
    };
    const r = validateCapabilityMap({ ...VALID_MAP, capability_map: map });
    expect(r.errors.some(e => e.code === 'LIFECYCLE-001' || e.code === 'LIFECYCLE-004')).toBe(false);
  });

  it('does not require valid_from/valid_to at all (absent is not an error)', () => {
    const r = validateCapabilityMap(VALID_MAP);
    expect(r.errors.some(e => e.code === 'LIFECYCLE-001' || e.code === 'LIFECYCLE-004')).toBe(false);
  });
});

describe('capability-map examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`reports historical inline sidecar fields in ${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateCapabilityMap(parsed);
      expect(r.errors.length).toBeGreaterThan(0);
      expect(r.errors.every(e => e.code === 'VERSIONED-004')).toBe(true);
      expect(r.valid).toBe(false);
    });
  }
});
