import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parseCanonicalFGCA, parseCanonicalFGA } from '../parse-canonical.js';
import { layoutFGCAPreview } from '../preview-layout.js';

const VALID = {
  notation: 'dgca',
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
  actions: [
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

  it('accepts ACTION-* ids (methodology 1.0) alongside legacy ACTIVITY-*', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      actions: [
        { id: 'ACTION-CRM-EU-1', name: 'CRM rollout', changes: ['CHANGE-1'] },
        { id: 'ACTIVITY-2', name: 'Legacy workstream', changes: ['CHANGE-1'] },
      ],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.parsed?.activities.map((a) => a.id)).toEqual(['ACTION-CRM-EU-1', 'ACTIVITY-2']);
  });

  it('defaults changes to [] when view_config.layers.changes is off (DGA-in-dgca)', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      changes: undefined,
      view_config: { layers: { changes: 'off' } },
      actions: [
        { id: 'ACTION-DISCOVERY-1', name: 'Gap assessment', goals: ['GOAL-1'] },
      ],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.parsed?.changes).toEqual([]);
    expect(r.parsed?.hideChanges).toBe(true);
  });

  it('DGA-mode preview has three columns (no Changes)', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      changes: undefined,
      view_config: { layers: { changes: 'off' } },
      actions: [
        { id: 'ACTION-DISCOVERY-1', name: 'Gap assessment', goals: ['GOAL-1'] },
      ],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    const layout = layoutFGCAPreview(r.parsed!, { hideChanges: r.parsed!.hideChanges });
    expect(layout.columns.map((c) => c.col)).toEqual(['driver', 'goal', 'activity']);
  });

  it('four-layer dgca still has a Changes column', () => {
    const r = parseCanonicalFGCA(VALID);
    expect(r.parsed?.hideChanges).toBeFalsy();
    const layout = layoutFGCAPreview(r.parsed!);
    expect(layout.columns.map((c) => c.col)).toEqual(['driver', 'goal', 'change', 'activity']);
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
      actions: [{ id: 'ACTIVITY-1', name: 'A', changes: ['CHANGE-99'] }],
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
      actions: [
        { id: 'ACTIVITY-1', name: 'A1', changes: ['CHANGE-1'] },
        { id: 'ACTIVITY-2', name: 'A2', changes: ['CHANGE-1'] },
      ],
    });
    expect(r.valid).toBe(true);
    expect(r.parsed?.changes[0].activity_ids).toHaveLength(2);
  });

  it('populates change.activity_ids from canonical delivers_changes', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      actions: [{ id: 'ACTION-1', name: 'Ship', delivers_changes: ['CHANGE-1'] }],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.parsed?.changes[0].activity_ids).toEqual(['ACTION-1']);
  });

  it('FGCA-010: rejects delivers_changes referencing an undefined change', () => {
    const r = parseCanonicalFGCA({
      ...VALID,
      actions: [{ id: 'ACTION-1', name: 'A', delivers_changes: ['CHANGE-99'] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-010')).toBe(true);
  });
});

// The "FGCA preview blank / FGA no edges" regression
// (transitrix/methodology#65) was a data defect: the canonical flat shape was
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
    expect(parsed.changes[0].goal_id).not.toBe('');
    // change → activity edge
    expect(parsed.changes[0].activity_ids).toHaveLength(1);
  });

  it('preserves canonical string IDs — not converted to sequential numbers', () => {
    const r = parseCanonicalFGCA(VALID);
    expect(r.valid).toBe(true);
    const parsed = r.parsed!;
    expect(parsed.factors[0].id).toBe('FACTOR-1');
    expect(parsed.goals[0].id).toBe('GOAL-1');
    expect(parsed.goals[0].factor![0].id).toBe('FACTOR-1');
    expect(parsed.changes[0].id).toBe('CHANGE-1');
    expect(parsed.changes[0].goal_id).toBe('GOAL-1');
    expect(parsed.changes[0].activity_ids[0]).toBe('ACTIVITY-1');
    expect(parsed.activities[0].id).toBe('ACTIVITY-1');
  });
});

describe('parseCanonicalFGA', () => {
  const VALID_FGA = {
    notation: 'dga',
    spec_version: '0.1',
    id: 'FGA-SAMPLE-1',
    name: 'Sample FGA chain',
    factors: [{ id: 'FACTOR-1', name: 'Driver' }],
    goals: [{ id: 'GOAL-1', name: 'Outcome', factors: ['FACTOR-1'] }],
    actions: [{ id: 'ACTIVITY-1', name: 'Workstream', goals: ['GOAL-1'] }],
  };

  it('accepts a valid canonical FGA document (no changes layer)', () => {
    const r = parseCanonicalFGA(VALID_FGA);
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.parsed?.factors).toHaveLength(1);
    expect(r.parsed?.goals).toHaveLength(1);
    expect(r.parsed?.activities).toHaveLength(1);
  });

  it('accepts ACTION-* ids in FGA mode', () => {
    const r = parseCanonicalFGA({
      ...VALID_FGA,
      actions: [{ id: 'ACTION-GDPR-DSR-WORKFLOW-1', name: 'DSR workflow', goals: ['GOAL-1'] }],
    });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.parsed?.activities[0].id).toBe('ACTION-GDPR-DSR-WORKFLOW-1');
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

describe('parseCanonicalFGCA — goal-scoped projections', () => {
  const docWithTwoGoals = {
    notation: 'dgca',
    spec_version: '0.1',
    id: 'FGCA-SCOPE-TEST-1',
    name: 'Two-goal fixture',
    factors: [
      { id: 'DRIVER-A-1', name: 'Driver A' },
      { id: 'DRIVER-B-1', name: 'Driver B' },
    ],
    goals: [
      { id: 'GOAL-PRIMARY-1', name: 'Primary goal', factors: ['DRIVER-A-1'] },
      { id: 'GOAL-SECONDARY-1', name: 'Secondary goal', factors: ['DRIVER-B-1'] },
    ],
    changes: [
      { id: 'CHANGE-A-1', name: 'Change for primary', goals: ['GOAL-PRIMARY-1'] },
      { id: 'CHANGE-B-1', name: 'Change for secondary', goals: ['GOAL-SECONDARY-1'] },
    ],
    actions: [
      { id: 'ACTION-AB-1', name: 'Action serving both', goals: ['GOAL-PRIMARY-1', 'GOAL-SECONDARY-1'] },
      { id: 'ACTION-B-1', name: 'Action serving secondary only', goals: ['GOAL-SECONDARY-1'] },
    ],
  };

  it('suppresses FGCA-011 when action references out-of-scope goal that exists', () => {
    const outOfScopeGoals = new Set(['GOAL-SECONDARY-1']);
    const r = parseCanonicalFGCA(docWithTwoGoals, outOfScopeGoals);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    // ACTION-AB-1 references GOAL-SECONDARY-1 which is out-of-scope, but shouldn't error
    expect(r.errors.filter((e) => e.code === 'FGCA-011')).toHaveLength(0);
  });

  it('sets scopeCaption=true when out-of-scope goals are referenced', () => {
    const outOfScopeGoals = new Set(['GOAL-SECONDARY-1']);
    const r = parseCanonicalFGCA(docWithTwoGoals, outOfScopeGoals);
    expect(r.scopeCaption).toBe(true);
  });

  it('suppresses FGCA-009 when change references out-of-scope goal that exists', () => {
    // Create a change that serves an out-of-scope goal
    const doc = {
      ...docWithTwoGoals,
      changes: [
        { id: 'CHANGE-CROSS-1', name: 'Change serving both goals', goals: ['GOAL-PRIMARY-1', 'GOAL-SECONDARY-1'] },
      ],
    };
    const outOfScopeGoals = new Set(['GOAL-SECONDARY-1']);
    const r = parseCanonicalFGCA(doc, outOfScopeGoals);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors.filter((e) => e.code === 'FGCA-009')).toHaveLength(0);
  });

  it('does not set scopeCaption when all referenced goals are in-scope', () => {
    // When every goal referenced by actions/changes is in the selected set
    const selectedDoc = {
      notation: 'dgca',
      spec_version: '0.1',
      id: 'FGCA-SINGLE-GOAL-1',
      name: 'Single-goal selection',
      factors: [{ id: 'DRIVER-A-1', name: 'Driver A' }],
      goals: [{ id: 'GOAL-PRIMARY-1', name: 'Primary goal', factors: ['DRIVER-A-1'] }],
      changes: [{ id: 'CHANGE-A-1', name: 'Change for primary', goals: ['GOAL-PRIMARY-1'] }],
      actions: [{ id: 'ACTION-A-1', name: 'Action serving primary', goals: ['GOAL-PRIMARY-1'] }],
    };
    const outOfScopeGoals = new Set<string>();
    const r = parseCanonicalFGCA(selectedDoc, outOfScopeGoals);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.scopeCaption).toBe(false);
  });

  it('still reports FGCA-011 when action references a goal that does not exist at all', () => {
    const docMissingGoal = {
      ...docWithTwoGoals,
      actions: [
        { id: 'ACTION-X-1', name: 'Action with bad ref', goals: ['GOAL-NONEXISTENT-1'] },
      ],
    };
    const outOfScopeGoals = new Set(['GOAL-SECONDARY-1']);
    const r = parseCanonicalFGCA(docMissingGoal, outOfScopeGoals);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'FGCA-011')).toBe(true);
  });

  it('suppresses FGCA-008 when goal references out-of-scope factor that exists', () => {
    const docWithCrossFactor = {
      ...docWithTwoGoals,
      goals: [
        { id: 'GOAL-PRIMARY-1', name: 'Primary goal', factors: ['DRIVER-A-1', 'DRIVER-B-1'] },
        { id: 'GOAL-SECONDARY-1', name: 'Secondary goal', factors: ['DRIVER-B-1'] },
      ],
    };
    const outOfScopeFactors = new Set(['DRIVER-B-1']);
    const r = parseCanonicalFGCA(docWithCrossFactor, undefined, outOfScopeFactors);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.errors.filter((e) => e.code === 'FGCA-008')).toHaveLength(0);
  });
});

describe('parseCanonicalFGCA — example file regression', () => {
  const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'dgca');
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];
  for (const file of files) {
    it(`accepts tests/fixtures/notation-corpus/dgca/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsedYaml = yaml.load(text);
      const r = parseCanonicalFGCA(parsedYaml);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});

describe('parseCanonicalFGA — example file regression', () => {
  const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'dga');
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.transitrix.yaml'))
    : [];
  for (const file of files) {
    it(`accepts tests/fixtures/notation-corpus/dga/${file} and resolves every activity to a goal`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const r = parseCanonicalFGA(yaml.load(text));
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
      // Every activity must carry a goal_id, or the FGA preview draws no edges.
      expect(r.parsed!.activities.every((a) => a.goal_id != null && a.goal_id !== 0 && a.goal_id !== '')).toBe(true);
    });
  }
});
