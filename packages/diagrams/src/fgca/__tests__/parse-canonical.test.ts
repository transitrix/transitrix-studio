import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseCanonicalFGCA, parseCanonicalFGA } from '../parse-canonical.js';

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

// The "FGCA preview blank / FGA no edges" regression (vkgeorgia/strategy#65,
// transitrix/methodology#65) was a data defect: the canonical flat shape was
// not being mapped to the internal cross-ref fields the renderer turns into
// edges. These assert the edge-driving fields are populated, so the renderer
// has something to draw — locking the fix.
describe('parseCanonicalFGCA — edge-driving fields populated', () => {
  it('maps goal.factors → goal.factor[], change.goals → change.goal_id, activity.changes → change.activity_ids', () => {
    const r = parseCanonicalFGCA(VALID);
    expect(r.valid).toBe(true);
    const parsed = r.parsed!;
    // factor → goal edge source
    expect(parsed.goals[0].factor).toHaveLength(1);
    // goal → change edge
    expect(parsed.changes[0].goal_id).not.toBe(0);
    // change → activity edge
    expect(parsed.changes[0].activity_ids).toHaveLength(1);
  });
});

describe('parseCanonicalFGA', () => {
  const VALID_FGA = {
    notation: 'fga',
    spec_version: '0.1',
    id: 'FGA-SAMPLE-1',
    name: 'Sample FGA chain',
    factors: [{ id: 'FACTOR-1', name: 'Driver' }],
    goals: [{ id: 'GOAL-1', name: 'Outcome', factors: ['FACTOR-1'] }],
    activities: [{ id: 'ACTIVITY-1', name: 'Workstream', goals: ['GOAL-1'] }],
  };

  it('accepts a valid canonical FGA document (no changes layer)', () => {
    const r = parseCanonicalFGA(VALID_FGA);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed?.factors).toHaveLength(1);
    expect(r.parsed?.goals).toHaveLength(1);
    expect(r.parsed?.activities).toHaveLength(1);
  });

  it('populates activity.goal_id from activity.goals[] (the FGA edge-driving field)', () => {
    // The "FGA nodes render, no edges" bug: activities had no resolvable
    // goal_id, so the renderer drew no goal → activity edges.
    const r = parseCanonicalFGA(VALID_FGA);
    expect(r.valid).toBe(true);
    expect(r.parsed?.activities[0].goal_id).not.toBeNull();
    expect(r.parsed?.activities[0].goal_id).not.toBe(0);
  });

  it('FGA-001: rejects wrong notation', () => {
    const r = parseCanonicalFGA({ ...VALID_FGA, notation: 'fgca' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGA-001')).toBe(true);
  });

  it('FGA-002: rejects malformed doc id', () => {
    const r = parseCanonicalFGA({ ...VALID_FGA, id: 'fga-lower-1' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGA-002')).toBe(true);
  });

  it('remaps FGCA layer codes into the FGA registry (e.g. FGA-007 for a bad id)', () => {
    const r = parseCanonicalFGA({ ...VALID_FGA, factors: [{ id: 'F-1', name: 'bad' }] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGA-007')).toBe(true);
    // No raw FGCA-prefixed code should leak through the remap.
    expect(r.errors.every((e) => !e.code.startsWith('FGCA-'))).toBe(true);
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

describe('parseCanonicalFGA — example file regression', () => {
  const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'examples', 'fga');
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];
  for (const file of files) {
    it(`accepts examples/fga/${file} and resolves every activity to a goal`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const r = parseCanonicalFGA(yaml.load(text));
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
      // Every activity must carry a goal_id, or the FGA preview draws no edges.
      expect(r.parsed!.activities.every((a) => a.goal_id != null && a.goal_id !== 0)).toBe(true);
    });
  }
});
