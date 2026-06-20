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

// ── Canon element store (one element per object) ─────────────────────────────
const PROJECT = {
  notation: 'activity',
  id: 'ACTIVITY-EU-PROGRAMME-1',
  name: 'EU MDR conformity programme',
  valid_from: '2026-04-01',
  valid_to: null,
  start_date: '2026-04-15',
  end_date: '2027-03-15',
  delivers_changes: ['CHANGE-EU-COMPLIANCE-1'],
};
const CHILD = {
  notation: 'activity',
  id: 'ACTIVITY-EU-CHILD-1',
  name: 'Notified-body engagement',
  parent: 'ACTIVITY-EU-PROGRAMME-1',
  start_date: '2026-05-01',
  end_date: '2026-12-01',
  owner: 'ACTOR-REGULATORY-1',
};
const UNRELATED = {
  notation: 'activity',
  id: 'ACTIVITY-UNRELATED-1',
  name: 'Other',
  parent: 'ACTIVITY-SOMETHING-ELSE-1',
};
const FACTOR = { notation: 'factor', id: 'FACTOR-EU-MDR-1', name: 'EU MDR regulation' };
const GOAL = { notation: 'goal', id: 'GOAL-EU-MARKET-1', name: 'Access EU market', factors: ['FACTOR-EU-MDR-1'] };
const CHANGE = {
  notation: 'change',
  id: 'CHANGE-EU-COMPLIANCE-1',
  name: 'Achieve MDR compliance',
  goals: ['GOAL-EU-MARKET-1'],
};

const STAKEHOLDER = {
  notation: 'stakeholder',
  id: 'STAKEHOLDER-OPS-1',
  name: 'Operations',
  type: 'internal',
  interest: 'high',
  influence: 'medium',
};

// ── Canon relation store ─────────────────────────────────────────────────────
// The project's goal link is a first-class `activity_goal` relation, not an
// inline `goals:` field on the activity element.
const REL_GOAL = {
  notation: 'relation',
  id: 'REL-EU-PROGRAMME-GOAL-1',
  type: 'activity_goal',
  from: 'ACTIVITY-EU-PROGRAMME-1',
  to: 'GOAL-EU-MARKET-1',
  valid_from: '2026-04-01',
  valid_to: null,
};
const REL_STAKEHOLDER = {
  notation: 'relation',
  id: 'REL-EU-PROGRAMME-STAKE-OPS-1',
  type: 'activity_stakeholder',
  from: 'ACTIVITY-EU-PROGRAMME-1',
  to: 'STAKEHOLDER-OPS-1',
  role: 'sponsor',
  valid_from: '2026-04-01',
  valid_to: null,
};

const elements = [PROJECT, CHILD, UNRELATED, FACTOR, GOAL, CHANGE, STAKEHOLDER];
const relations = [REL_GOAL, REL_STAKEHOLDER];
const sources = { elements, relations };

describe('resolveActivityCard', () => {
  it('resolves a full card from elements + relations', () => {
    const r = resolveActivityCard(CARD, sources);
    expect(r.valid, JSON.stringify(r.errors)).toBe(true);
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
    // project goal text field = the directly-served goal name
    expect(c.goalNames).toEqual(['Access EU market']);
    // stakeholders resolved from the activity_stakeholder relation (with role)
    expect(c.stakeholders).toEqual([
      { id: 'STAKEHOLDER-OPS-1', name: 'Operations', type: 'internal', interest: 'high', influence: 'medium', role: 'sponsor' },
    ]);
  });

  it('resolves stakeholder role from the activity_stakeholder relation', () => {
    const relWithRole = { ...REL_STAKEHOLDER, role: 'project_manager' };
    const r = resolveActivityCard(CARD, { elements, relations: [REL_GOAL, relWithRole] });
    expect(r.valid).toBe(true);
    expect(r.resolved!.stakeholders[0].role).toBe('project_manager');
  });

  it('resolves stakeholder without role when relation has no role field', () => {
    const relNoRole = { ...REL_STAKEHOLDER, role: undefined };
    const r = resolveActivityCard(CARD, { elements, relations: [REL_GOAL, relNoRole] });
    expect(r.valid).toBe(true);
    expect(r.resolved!.stakeholders[0].role).toBeUndefined();
  });

  it('resolves no stakeholders (empty list) when none are linked', () => {
    const r = resolveActivityCard(CARD, { elements, relations: [REL_GOAL] });
    expect(r.valid).toBe(true);
    expect(r.resolved!.stakeholders).toEqual([]);
    expect(r.warnings.some((w) => w.code === 'PC-001')).toBe(false);
  });

  it('ignores an ended (valid_to set) activity_stakeholder relation', () => {
    const ended = { ...REL_STAKEHOLDER, valid_to: '2026-12-31' };
    const r = resolveActivityCard(CARD, { elements, relations: [REL_GOAL, ended] });
    expect(r.resolved!.stakeholders).toEqual([]);
  });

  it('warns but still lists a stakeholder whose element is missing from canon', () => {
    const r = resolveActivityCard(CARD, {
      elements: [PROJECT, CHILD, FACTOR, GOAL, CHANGE],
      relations: [REL_GOAL, REL_STAKEHOLDER],
    });
    expect(r.valid).toBe(true);
    expect(r.resolved!.stakeholders).toEqual([{ id: 'STAKEHOLDER-OPS-1', name: 'STAKEHOLDER-OPS-1', role: 'sponsor' }]);
    expect(r.warnings.some((w) => w.code === 'PC-001')).toBe(true);
  });

  it('falls back to the inline goals field when no activity_goal relation exists', () => {
    const projectWithInline = { ...PROJECT, goals: ['GOAL-EU-MARKET-1'] };
    const r = resolveActivityCard(CARD, {
      elements: [projectWithInline, CHILD, FACTOR, GOAL, CHANGE],
      relations: [],
    });
    expect(r.valid).toBe(true);
    expect(r.resolved!.motivation.goals.map((g) => g.id)).toEqual(['GOAL-EU-MARKET-1']);
  });

  it('PC-001 when the project activity element is absent', () => {
    const r = resolveActivityCard(CARD, { elements: [FACTOR, GOAL, CHANGE], relations });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'PC-001')).toBe(true);
  });

  it('resolves activity_type and status from the Activity element', () => {
    const r = resolveActivityCard(CARD, {
      elements: [{ ...PROJECT, activity_type: 'programme', status: 'on_track' }, CHILD, FACTOR, GOAL, CHANGE],
      relations,
    });
    expect(r.valid).toBe(true);
    expect(r.resolved!.project.activity_type).toBe('programme');
    expect(r.resolved!.project.status).toBe('on_track');
  });

  it('accepts any activity_type value without error (card works at all levels)', () => {
    for (const t of ['programme', 'project', 'workstream', 'task', 'initiative']) {
      const r = resolveActivityCard(CARD, {
        elements: [{ ...PROJECT, activity_type: t }, CHILD, FACTOR, GOAL, CHANGE],
        relations,
      });
      expect(r.errors.some((e) => e.code === 'PC-002'), `should not error for type "${t}"`).toBe(false);
    }
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
    const r = resolveActivityCard(CARD, {
      elements: [{ ...PROJECT, valid_to: '2026-12-31' }, CHILD, FACTOR, GOAL, CHANGE],
      relations,
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.code === 'PC-004')).toBe(true);
  });

  it('LIFECYCLE-001 when valid_from is missing', () => {
    const r = resolveActivityCard(CARD, {
      elements: [{ ...PROJECT, valid_from: undefined }, CHILD, FACTOR, GOAL, CHANGE],
      relations,
    });
    expect(r.errors.some((e) => e.code === 'LIFECYCLE-001')).toBe(true);
  });

  it('LIFECYCLE-003 when valid_to precedes valid_from', () => {
    const r = resolveActivityCard(CARD, {
      elements: [{ ...PROJECT, valid_to: '2025-01-01' }, CHILD, FACTOR, GOAL, CHANGE],
      relations,
    });
    expect(r.errors.some((e) => e.code === 'LIFECYCLE-003')).toBe(true);
  });

  it('warns and omits when a change element is not found in canon', () => {
    const r = resolveActivityCard(CARD, { elements: [PROJECT, CHILD, FACTOR, GOAL], relations });
    expect(r.valid).toBe(true);
    expect(r.resolved!.motivation.changes).toHaveLength(0);
    expect(r.warnings.some((w) => w.code === 'PC-001')).toBe(true);
  });

  it('does not crash on malformed element/relation docs', () => {
    const r = resolveActivityCard(CARD, {
      elements: [null, 'x', PROJECT, 42, { notation: 'goal', id: null }],
      relations: [null, 'x', { notation: 'relation' }],
    });
    expect(r.valid).toBe(true);
  });
});
