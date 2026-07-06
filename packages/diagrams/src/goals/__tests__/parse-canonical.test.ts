import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseCanonicalGoals } from '../parse-canonical.js';

const VALID = {
  notation: 'goals',
  spec_version: '0.1',
  id: 'GOALS-SAMPLE-1',
  name: 'Sample goals tree',
  goal_types: [
    { name: 'Strategy', level: 0 },
    { name: 'Project', level: 1 },
  ],
  goals: [
    { id: 'GOAL-1', name: 'Root', type: 'Strategy', level: 0 },
    { id: 'GOAL-2', name: 'Child', type: 'Project', level: 1, parent: 'GOAL-1' },
  ],
};

describe('parseCanonicalGoals', () => {
  it('accepts a valid canonical document', () => {
    const r = parseCanonicalGoals(VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed?.goals).toHaveLength(2);
  });

  it('GOALS-001: rejects non-object input', () => {
    expect(parseCanonicalGoals(null).errors[0].code).toBe('GOALS-001');
  });

  it('GOALS-001: rejects wrong notation', () => {
    const r = parseCanonicalGoals({ ...VALID, notation: 'fga' });
    expect(r.errors.some((e) => e.code === 'GOALS-001')).toBe(true);
  });

  it('GOALS-002: rejects malformed doc id', () => {
    const r = parseCanonicalGoals({ ...VALID, id: 'goals-1' });
    expect(r.errors.some((e) => e.code === 'GOALS-002')).toBe(true);
  });

  it('GOALS-003: rejects missing name', () => {
    const { name: _, ...rest } = VALID;
    const r = parseCanonicalGoals(rest);
    expect(r.errors.some((e) => e.code === 'GOALS-003')).toBe(true);
  });

  it('GOALS-004: rejects empty goal_types', () => {
    const r = parseCanonicalGoals({ ...VALID, goal_types: [] });
    expect(r.errors.some((e) => e.code === 'GOALS-004')).toBe(true);
  });

  it('GOALS-007: rejects malformed goal id', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [{ id: 'goal-1', name: 'A', type: 'Strategy', level: 0 }],
    });
    expect(r.errors.some((e) => e.code === 'GOALS-007')).toBe(true);
  });

  it('GOALS-007: rejects duplicate goal ids', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [
        { id: 'GOAL-1', name: 'A', type: 'Strategy', level: 0 },
        { id: 'GOAL-1', name: 'B', type: 'Strategy', level: 0 },
      ],
    });
    expect(r.errors.some((e) => e.code === 'GOALS-007')).toBe(true);
  });

  it('GOALS-008: rejects goal.type not in goal_types', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [{ id: 'GOAL-1', name: 'A', type: 'Unknown', level: 0 }],
    });
    expect(r.errors.some((e) => e.code === 'GOALS-008')).toBe(true);
  });

  it('GOALS-008: rejects goal.level mismatched with goal_types', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [{ id: 'GOAL-1', name: 'A', type: 'Strategy', level: 5 }],
    });
    expect(r.errors.some((e) => e.code === 'GOALS-008')).toBe(true);
  });

  it('GOALS-009: warns on broken parent ref', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [
        { id: 'GOAL-1', name: 'Root', type: 'Strategy', level: 0 },
        { id: 'GOAL-2', name: 'Orphan', type: 'Project', level: 1, parent: 'GOAL-99' },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.code === 'GOALS-009')).toBe(true);
  });

  it('GOALS-010: detects parent-chain cycle', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [
        { id: 'GOAL-1', name: 'A', type: 'Strategy', level: 0, parent: 'GOAL-2' },
        { id: 'GOAL-2', name: 'B', type: 'Strategy', level: 0, parent: 'GOAL-1' },
      ],
    });
    expect(r.errors.some((e) => e.code === 'GOALS-010')).toBe(true);
  });

  it('GOALS-011: warns when non-root goal has no parent', () => {
    const r = parseCanonicalGoals({
      ...VALID,
      goals: [{ id: 'GOAL-1', name: 'A', type: 'Project', level: 1 }],
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.code === 'GOALS-011')).toBe(true);
  });

  it('maps canonical IDs to internal numeric ids; parent_id is the parent\'s mapped id', () => {
    const r = parseCanonicalGoals(VALID);
    expect(r.parsed?.goals[0].id).toBe(1);
    expect(r.parsed?.goals[0].canonical_id).toBe('GOAL-1');
    expect(r.parsed?.goals[0].parent_id).toBe(0);
    expect(r.parsed?.goals[1].id).toBe(2);
    expect(r.parsed?.goals[1].canonical_id).toBe('GOAL-2');
    expect(r.parsed?.goals[1].parent_id).toBe(1);
  });
});

describe('parseCanonicalGoals — example file regression', () => {
  const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'goals');
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];
  for (const file of files) {
    it(`accepts tests/fixtures/notation-corpus/goals/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsedYaml = yaml.load(text);
      const r = parseCanonicalGoals(parsedYaml);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
