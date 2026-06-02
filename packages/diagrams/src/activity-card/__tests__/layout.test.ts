import { describe, it, expect } from 'vitest';
import { layoutActivityCard, ARCHIMATE_CLASS } from '../layout.js';
import type { ResolvedActivityCard } from '../types.js';

const RESOLVED: ResolvedActivityCard = {
  cardId: 'ACTIVITY_CARD-EU-PROGRAMME-1',
  cardDescription: 'Summary',
  project: {
    id: 'ACTIVITY-EU-PROGRAMME-1',
    name: 'EU MDR conformity programme',
    valid_from: '2026-04-01',
    start_date: '2026-04-15',
    end_date: '2027-03-15',
  },
  milestones: [
    { id: 'MILESTONE-CERT-1', name: 'Cert', date: '2027-01-31', deliversChanges: ['CHANGE-EU-COMPLIANCE-1'] },
  ],
  motivation: {
    factors: [{ id: 'FACTOR-EU-MDR-1', name: 'EU MDR regulation' }],
    goals: [{ id: 'GOAL-EU-MARKET-1', name: 'Access EU market', factorIds: ['FACTOR-EU-MDR-1'] }],
    changes: [{ id: 'CHANGE-EU-COMPLIANCE-1', name: 'Achieve MDR compliance', goalIds: ['GOAL-EU-MARKET-1'] }],
  },
  childActivities: [
    { id: 'ACTIVITY-EU-CHILD-1', name: 'Notified-body engagement', start_date: '2026-05-01', end_date: '2026-12-01', owner: 'UNIT-REGULATORY' },
  ],
};

describe('layoutActivityCard', () => {
  it('produces all sections with positive geometry', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.bounds.width).toBeGreaterThan(0);
    expect(l.bounds.height).toBeGreaterThan(0);
    expect(l.title.name).toBe('EU MDR conformity programme');
    expect(l.dateFields).toHaveLength(3);
    expect(l.dateFields[0]).toMatchObject({ label: 'Initiation', value: '2026-04-01' });
    expect(l.milestones).toHaveLength(1);
    expect(l.milestones[0].archimateClass).toBe(ARCHIMATE_CLASS.MILESTONE);
    expect(l.childActivities[0].archimateClass).toBe(ARCHIMATE_CLASS.ACTIVITY);
  });

  it('builds F→G and G→C edges', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.chainEdges).toContainEqual({ sourceId: 'FACTOR-EU-MDR-1', targetId: 'GOAL-EU-MARKET-1' });
    expect(l.chainEdges).toContainEqual({ sourceId: 'GOAL-EU-MARKET-1', targetId: 'CHANGE-EU-COMPLIANCE-1' });
  });

  it('renders "—" for absent dates', () => {
    const l = layoutActivityCard({ ...RESOLVED, project: { id: 'A', name: 'n' } });
    expect(l.dateFields.map((d) => d.value)).toEqual(['—', '—', '—']);
  });

  it('handles an empty card without throwing', () => {
    const l = layoutActivityCard({
      cardId: 'ACTIVITY_CARD-X-1',
      project: { id: 'ACTIVITY-X-1', name: 'Empty' },
      milestones: [],
      motivation: { factors: [], goals: [], changes: [] },
      childActivities: [],
    });
    expect(l.milestones).toHaveLength(0);
    expect(l.bounds.height).toBeGreaterThan(0);
  });
});
