import { describe, it, expect } from 'vitest';
import { resolveActivityCard } from '../resolver.js';
import type { ActivityCardDoc } from '../types.js';

const CARD: ActivityCardDoc = {
  notation: 'activity-card',
  spec_version: '0.1',
  activity_card: {
    id: 'ACTIVITY_CARD-EU-PROGRAMME-1',
    project: 'ACTIVITY-EU-PROGRAMME-1',
    description: 'Executive summary.',
    milestones: [
      { id: 'MILESTONE-CERT-1', name: 'Cert', date: '2027-01-31', delivers_changes: ['CHANGE-EU-COMPLIANCE-1'] },
    ],
  },
};

const ACTIVITIES_DOC = {
  notation: 'activities',
  activities: [
    {
      id: 'ACTIVITY-EU-PROGRAMME-1',
      name: 'EU MDR conformity programme',
      activity_type: 'Project',
      valid_from: '2026-04-01',
      valid_to: null,
      start_date: '2026-04-15',
      end_date: '2027-03-15',
      goals: ['GOAL-EU-MARKET-1'],
      delivers_changes: ['CHANGE-EU-COMPLIANCE-1'],
    },
    {
      id: 'ACTIVITY-EU-CHILD-1',
      name: 'Notified-body engagement',
      parent: 'ACTIVITY-EU-PROGRAMME-1',
      start_date: '2026-05-01',
      end_date: '2026-12-01',
      owner: 'UNIT-REGULATORY',
    },
    { id: 'ACTIVITY-UNRELATED-1', name: 'Other', parent: 'ACTIVITY-SOMETHING-ELSE-1' },
  ],
};

const FGCA_DOC = {
  notation: 'fgca',
  id: 'FGCA-EU-1',
  name: 'EU chain',
  factors: [{ id: 'FACTOR-EU-MDR-1', name: 'EU MDR regulation' }],
  goals: [{ id: 'GOAL-EU-MARKET-1', name: 'Access EU market', factors: ['FACTOR-EU-MDR-1'] }],
  changes: [{ id: 'CHANGE-EU-COMPLIANCE-1', name: 'Achieve MDR compliance', goals: ['GOAL-EU-MARKET-1'] }],
};

const sources = { activitiesDocs: [ACTIVITIES_DOC], fgcaDocs: [FGCA_DOC] };

describe('resolveActivityCard', () => {
  it('resolves a full card', () => {
    const r = resolveActivityCard(CARD, sources);
    expect(r.valid).toBe(true);
    const c = r.resolved!;
    expect(c.project.name).toBe('EU MDR conformity programme');
    expect(c.project.valid_from).toBe('2026-04-01');
    expect(c.project.start_date).toBe('2026-04-15');
    expect(c.milestones).toHaveLength(1);
    expect(c.motivation.factors.map((f) => f.id)).toEqual(['FACTOR-EU-MDR-1']);
    expect(c.motivation.goals.map((g) => g.id)).toEqual(['GOAL-EU-MARKET-1']);
    expect(c.motivation.changes.map((ch) => ch.id)).toEqual(['CHANGE-EU-COMPLIANCE-1']);
    // only the activity whose parent = the project
    expect(c.childActivities.map((a) => a.id)).toEqual(['ACTIVITY-EU-CHILD-1']);
  });

  it('PC-001 when the project activity is absent', () => {
    const r = resolveActivityCard(CARD, { activitiesDocs: [], fgcaDocs: [FGCA_DOC] });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'PC-001')).toBe(true);
  });

  it('PC-002 when the activity is not a Project', () => {
    const acts = {
      ...ACTIVITIES_DOC,
      activities: [{ ...ACTIVITIES_DOC.activities[0], activity_type: 'Task' }],
    };
    const r = resolveActivityCard(CARD, { activitiesDocs: [acts], fgcaDocs: [FGCA_DOC] });
    expect(r.errors.some((e) => e.code === 'PC-002')).toBe(true);
  });

  it('PC-003 when a milestone change is not in the project changes', () => {
    const card: ActivityCardDoc = {
      ...CARD,
      activity_card: {
        ...CARD.activity_card,
        milestones: [{ id: 'MILESTONE-X-1', name: 'x', date: '2027-01-01', delivers_changes: ['CHANGE-NOT-THERE-1'] }],
      },
    };
    const r = resolveActivityCard(card, sources);
    expect(r.errors.some((e) => e.code === 'PC-003')).toBe(true);
  });

  it('PC-004 warns when a milestone falls outside the lifecycle window', () => {
    const acts = {
      ...ACTIVITIES_DOC,
      activities: [{ ...ACTIVITIES_DOC.activities[0], valid_to: '2026-12-31' }],
    };
    const r = resolveActivityCard(CARD, { activitiesDocs: [acts], fgcaDocs: [FGCA_DOC] });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.code === 'PC-004')).toBe(true);
  });

  it('LIFECYCLE-001 when valid_from is missing', () => {
    const acts = {
      ...ACTIVITIES_DOC,
      activities: [{ ...ACTIVITIES_DOC.activities[0], valid_from: undefined }],
    };
    const r = resolveActivityCard(CARD, { activitiesDocs: [acts], fgcaDocs: [FGCA_DOC] });
    expect(r.errors.some((e) => e.code === 'LIFECYCLE-001')).toBe(true);
  });

  it('LIFECYCLE-003 when valid_to precedes valid_from', () => {
    const acts = {
      ...ACTIVITIES_DOC,
      activities: [{ ...ACTIVITIES_DOC.activities[0], valid_to: '2025-01-01' }],
    };
    const r = resolveActivityCard(CARD, { activitiesDocs: [acts], fgcaDocs: [FGCA_DOC] });
    expect(r.errors.some((e) => e.code === 'LIFECYCLE-003')).toBe(true);
  });

  it('warns and omits when a change is not found in any FGCA doc', () => {
    const r = resolveActivityCard(CARD, { activitiesDocs: [ACTIVITIES_DOC], fgcaDocs: [] });
    expect(r.valid).toBe(true);
    expect(r.resolved!.motivation.changes).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'PC-001')).toBe(true);
  });

  it('does not crash on malformed sibling docs', () => {
    const r = resolveActivityCard(CARD, {
      activitiesDocs: [null, 'x', { activities: [null, 42, ACTIVITIES_DOC.activities[0]] }],
      fgcaDocs: [null, { goals: [null] }],
    });
    expect(r.valid).toBe(true);
  });
});
