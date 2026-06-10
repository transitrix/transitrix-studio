import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateScenario } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'scenarios');

const VALID_SCENARIO = {
  notation: 'scenarios',
  scenario: {
    id: 'SCN-001',
    name: 'Optimistic Growth 2027',
    status: 'Active',
    created_at: '2026-01-01',
    vision: 'Aggressive expansion scenario.',
    factors_view: [
      { factor_id: 'FAC-MARKET-001', relevance: 'High', impact: 'Revenue growth' },
      { factor_id: 'FAC-TECH-001', relevance: 'Medium' },
    ],
    goals: [{ goal_id: 'GOAL-REV-001' }],
    capabilities: [{ capability_id: 'CAP-ECOMM-001' }],
    activities: [{ activity_id: 'ACT-EXPAND-001' }],
    products: [{ product_id: 'PROD-PLATFORM-001' }],
    processes: [{ process_id: 'PROC-DELIVERY-001' }],
    applications: [{ app_id: 'APP-CRM-001' }, { app_id: 'APP-OMS-001' }],
  },
};

describe('validateScenario', () => {
  it('passes on valid input', () => {
    const r = validateScenario(VALID_SCENARIO);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('SCN-001: rejects non-object input', () => {
    const r = validateScenario(null);
    expect(r.errors[0].code).toBe('SCN-001');
  });

  it('SCN-001: rejects missing notation', () => {
    const { notation: _, ...rest } = VALID_SCENARIO;
    const r = validateScenario(rest);
    expect(r.errors.some(e => e.code === 'SCN-001')).toBe(true);
  });

  it('SCN-001: rejects wrong notation value', () => {
    const r = validateScenario({ ...VALID_SCENARIO, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'SCN-001')).toBe(true);
  });

  it('SCN-002: rejects missing scenario', () => {
    const r = validateScenario({ notation: 'scenarios' });
    expect(r.errors.some(e => e.code === 'SCN-002')).toBe(true);
  });

  it('SCN-002: rejects missing id/name/status', () => {
    const r = validateScenario({ notation: 'scenarios', scenario: {} });
    expect(r.errors.filter(e => e.code === 'SCN-002').length).toBeGreaterThanOrEqual(3);
  });

  it('SCN-003: rejects invalid status', () => {
    const scn = { ...VALID_SCENARIO.scenario, status: 'Retired' };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-003')).toBe(true);
  });

  it('SCN-003: accepts all valid statuses', () => {
    for (const status of ['Draft', 'Active', 'Archived']) {
      const scn = { ...VALID_SCENARIO.scenario, status };
      const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
      expect(r.errors.some(e => e.code === 'SCN-003')).toBe(false);
    }
  });

  it('SCN-004: rejects malformed created_at', () => {
    const scn = { ...VALID_SCENARIO.scenario, created_at: '01-01-2026' };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-004')).toBe(true);
  });

  it('SCN-004: accepts missing created_at', () => {
    const { created_at: _, ...scn } = VALID_SCENARIO.scenario;
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-004')).toBe(false);
  });

  it('SCN-005: rejects non-array factors_view', () => {
    const scn = { ...VALID_SCENARIO.scenario, factors_view: 'oops' };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-005')).toBe(true);
  });

  it('SCN-005: rejects factor missing factor_id', () => {
    const scn = { ...VALID_SCENARIO.scenario, factors_view: [{ relevance: 'High' }] };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-005')).toBe(true);
  });

  it('SCN-006: rejects invalid factor relevance', () => {
    const scn = {
      ...VALID_SCENARIO.scenario,
      factors_view: [{ factor_id: 'F1', relevance: 'Critical' }],
    };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-006')).toBe(true);
  });

  it('SCN-013: rejects duplicate factor_id', () => {
    const scn = {
      ...VALID_SCENARIO.scenario,
      factors_view: [{ factor_id: 'F1' }, { factor_id: 'F1' }],
    };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.errors.some(e => e.code === 'SCN-013')).toBe(true);
  });

  const refCases = [
    { field: 'goals',        idField: 'goal_id',       errorCode: 'SCN-007' },
    { field: 'capabilities', idField: 'capability_id', errorCode: 'SCN-008' },
    { field: 'activities',   idField: 'activity_id',   errorCode: 'SCN-009' },
    { field: 'products',     idField: 'product_id',    errorCode: 'SCN-010' },
    { field: 'processes',    idField: 'process_id',    errorCode: 'SCN-011' },
    { field: 'applications', idField: 'app_id',        errorCode: 'SCN-012' },
  ];

  for (const c of refCases) {
    it(`${c.errorCode}: rejects ${c.field}[*] missing ${c.idField}`, () => {
      const scn = { ...VALID_SCENARIO.scenario, [c.field]: [{}] };
      const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
      expect(r.errors.some(e => e.code === c.errorCode)).toBe(true);
    });

    it(`${c.errorCode}: rejects non-array ${c.field}`, () => {
      const scn = { ...VALID_SCENARIO.scenario, [c.field]: 'oops' };
      const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
      expect(r.errors.some(e => e.code === c.errorCode)).toBe(true);
    });

    it(`${c.errorCode}: rejects duplicate ${c.idField}`, () => {
      const scn = {
        ...VALID_SCENARIO.scenario,
        [c.field]: [{ [c.idField]: 'X1' }, { [c.idField]: 'X1' }],
      };
      const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
      expect(r.errors.some(e => e.code === c.errorCode)).toBe(true);
    });
  }

  it('accepts minimal scenario (id+name+status only)', () => {
    const r = validateScenario({
      notation: 'scenarios',
      scenario: { id: 'S1', name: 'Minimal', status: 'Draft' },
    });
    expect(r.valid).toBe(true);
  });

  it('accepts scenario with all reference lists empty', () => {
    const scn = {
      ...VALID_SCENARIO.scenario,
      factors_view: [],
      goals: [],
      capabilities: [],
      activities: [],
      products: [],
      processes: [],
      applications: [],
    };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.valid).toBe(true);
  });

  // Pre-release blocker regression (orchestrator review 2026-05-21).
  it('[blocker] tolerates a null element in factors_view[] without throwing', () => {
    const scn = { ...VALID_SCENARIO.scenario, factors_view: [null] };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCN-005')).toBe(true);
  });

  it('[blocker] tolerates a null element in goals[] without throwing', () => {
    const scn = { ...VALID_SCENARIO.scenario, goals: [null] };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCN-007')).toBe(true);
  });

  it('[blocker] tolerates a string element in applications[] without throwing', () => {
    const scn = { ...VALID_SCENARIO.scenario, applications: ['x'] };
    const r = validateScenario({ ...VALID_SCENARIO, scenario: scn });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCN-012')).toBe(true);
  });
});

describe('scenarios examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates tests/fixtures/notation-corpus/scenarios/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateScenario(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
