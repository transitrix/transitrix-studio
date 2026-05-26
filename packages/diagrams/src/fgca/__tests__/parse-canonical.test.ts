import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseCanonicalFGCA } from '../parse-canonical.js';

const VALID = {
  notation: 'fgca',
  spec_version: '0.1',
  id: 'FGCA-SAMPLE-1',
  name: 'Sample FGCA chain',
  factors: [
    { id: 'FACTOR-1', name: 'Driver one', type: 'external' },
  ],
  goals: [
    { id: 'GOAL-1', name: 'Outcome one', factors: ['FACTOR-1'] },
  ],
  changes: [
    { id: 'CHANGE-1', name: 'Transformation', goals: ['GOAL-1'] },
  ],
  activities: [
    { id: 'ACTIVITY-1', name: 'Workstream', changes: ['CHANGE-1'] },
  ],
};

describe('parseCanonicalFGCA', () => {
  it('accepts a valid canonical document', () => {
    const r = parseCanonicalFGCA(VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed).toBeDefined();
    expect(r.parsed?.factors).toHaveLength(1);
    expect(r.parsed?.goals).toHaveLength(1);
    expect(r.parsed?.changes).toHaveLength(1);
    expect(r.parsed?.activities).toHaveLength(1);
  });

  it('FGCA-001: rejects non-object input', () => {
    expect(parseCanonicalFGCA(null).errors[0].code).toBe('FGCA-001');
    expect(parseCanonicalFGCA('string').errors[0].code).toBe('FGCA-001');
  });

  it('FGCA-001: rejects wrong notation', () => {
    const r = parseCanonicalFGCA({ ...VALID, notation: 'fga' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-001')).toBe(true);
  });

  it('FGCA-002: rejects malformed doc id', () => {
    const r = parseCanonicalFGCA({ ...VALID, id: 'fgca-lowercase-1' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-002')).toBe(true);
  });

  it('FGCA-003: rejects missing name', () => {
    const { name: _, ...rest } = VALID;
    const r = parseCanonicalFGCA(rest);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-003')).toBe(true);
  });

  it('FGCA-004: rejects missing factors array', () => {
    const { factors: _, ...rest } = VALID;
    const r = parseCanonicalFGCA(rest);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-004')).toBe(true);
  });

  it('FGCA-006: rejects duplicate IDs within a layer', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      factors: [
        { id: 'FACTOR-1', name: 'A' },
        { id: 'FACTOR-1', name: 'B' },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-006')).toBe(true);
  });

  it('FGCA-007: rejects malformed factor id', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      factors: [{ id: 'F-1', name: 'A' }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-007')).toBe(true);
  });

  it('FGCA-008: rejects goal.factors[] referencing undefined factor', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      goals: [{ id: 'GOAL-1', name: 'A', factors: ['FACTOR-99'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-008')).toBe(true);
  });

  it('FGCA-009: rejects change.goals[] referencing undefined goal', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      changes: [{ id: 'CHANGE-1', name: 'A', goals: ['GOAL-99'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-009')).toBe(true);
  });

  it('FGCA-010: rejects activity.changes[] referencing undefined change', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      activities: [{ id: 'ACTIVITY-1', name: 'A', changes: ['CHANGE-99'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-010')).toBe(true);
  });

  it('FGCA-015: rejects factor.references_constraint with malformed ID', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      factors: [{ id: 'FACTOR-1', name: 'A', references_constraint: ['BAD-1'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-015')).toBe(true);
  });

  it('accepts factor.references_constraint with valid CONSTRAINT ID', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      factors: [{ id: 'FACTOR-1', name: 'A', references_constraint: ['CONSTRAINT-GDPR-1'] }],
    });
    expect(r.valid).toBe(true);
  });

  it('populates internal change.activity_ids from canonical activity.changes (reversed direction)', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      changes: [{ id: 'CHANGE-1', name: 'C', goals: ['GOAL-1'] }],
      activities: [
        { id: 'ACTIVITY-1', name: 'A1', changes: ['CHANGE-1'] },
        { id: 'ACTIVITY-2', name: 'A2', changes: ['CHANGE-1'] },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.parsed?.changes[0].activity_ids).toHaveLength(2);
  });
});

describe('parseCanonicalFGCA — example file regression', () => {
  const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'examples', 'fgca');
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];
  for (const file of files) {
    it(`accepts examples/fgca/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsedYaml = yaml.load(text);
      const r = parseCanonicalFGCA(parsedYaml);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
