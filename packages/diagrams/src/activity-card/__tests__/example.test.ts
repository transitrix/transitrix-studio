// Conformance test for the shipped worked example. Exercises the full
// validate → resolve → layout pipeline against the real co-located example
// files under `tests/fixtures/notation-corpus/activity-card/`, so the success signal of #134 is
// pinned and any drift in the example or the resolver is caught by CI.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateActivityCard } from '../validate.js';
import { resolveActivityCard } from '../resolver.js';
import { layoutActivityCard } from '../layout.js';
import type { ActivityCardDoc } from '../types.js';

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../tests/fixtures/notation-corpus/activity-card',
);
const load = (f: string): unknown => yaml.load(readFileSync(path.join(dir, f), 'utf-8'));

describe('activity-card worked example (eu-programme)', () => {
  it('validates, resolves, and lays out the success-signal card', () => {
    const card = load('eu-programme.activity-card.transitrix.yaml');
    const activitiesDocs = [load('eu-programme.activities.transitrix.yaml')];
    const fgcaDocs = [load('eu-programme.fgca.transitrix.yaml')];

    const v = validateActivityCard(card);
    expect(v.valid, JSON.stringify(v.errors)).toBe(true);

    const r = resolveActivityCard(card as ActivityCardDoc, { activitiesDocs, fgcaDocs });
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
    expect(r.warnings, JSON.stringify(r.warnings)).toHaveLength(0);

    const c = r.resolved!;
    expect(c.project.name).toBe('EU MDR conformity programme');
    expect(c.project.valid_from).toBe('2026-04-01');
    expect(c.project.start_date).toBe('2026-04-15');
    expect(c.project.end_date).toBe('2027-03-15');
    expect(c.milestones.map((m) => m.id)).toEqual([
      'MILESTONE-EU-CONFORMITY-CERT-1',
      'MILESTONE-EU-MARKET-LAUNCH-1',
    ]);
    expect(c.motivation.factors.map((f) => f.id)).toEqual(['FACTOR-EU-MDR-1']);
    expect(c.motivation.goals.map((g) => g.id)).toEqual(['GOAL-EU-MARKET-1']);
    expect(c.motivation.changes.map((x) => x.id)).toEqual(['CHANGE-EU-COMPLIANCE-1']);
    expect(c.childActivities).toHaveLength(4);

    const layout = layoutActivityCard(c);
    expect(layout.bounds.height).toBeGreaterThan(0);
    expect(layout.chainEdges).toContainEqual({ sourceId: 'FACTOR-EU-MDR-1', targetId: 'GOAL-EU-MARKET-1' });
    expect(layout.chainEdges).toContainEqual({ sourceId: 'GOAL-EU-MARKET-1', targetId: 'CHANGE-EU-COMPLIANCE-1' });
  });
});
