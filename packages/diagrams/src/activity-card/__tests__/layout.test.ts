import { describe, it, expect } from 'vitest';
import { layoutActivityCard, ARCHIMATE_CLASS } from '../layout.js';
import type { ResolvedActivityCard } from '../types.js';

const RESOLVED: ResolvedActivityCard = {
  cardId: 'ACTIVITY_CARD-EU-PROGRAMME-1',
  cardDescription: 'Summary',
  project: {
    id: 'ACTIVITY-EU-PROGRAMME-1',
    name: 'EU MDR conformity programme',
    activity_type: 'programme',
    status: 'in_progress',
    valid_from: '2026-04-01',
    start_date: '2026-04-15',
    end_date: '2027-03-15',
  },
  milestones: [
    { id: 'MILESTONE-CERT-1', name: 'Cert', date: '2027-01-31', deliversChanges: ['CHANGE-EU-COMPLIANCE-1'] },
  ],
  motivation: {
    drivers: [{ id: 'FACTOR-EU-MDR-1', name: 'EU MDR regulation' }],
    goals: [{ id: 'GOAL-EU-MARKET-1', name: 'Access EU market', driverIds: ['FACTOR-EU-MDR-1'] }],
    changes: [{ id: 'CHANGE-EU-COMPLIANCE-1', name: 'Achieve MDR compliance', goalIds: ['GOAL-EU-MARKET-1'] }],
  },
  assessments: [
    { id: 'ASSESSMENT-MDR-1', name: 'NB capacity constrained', driverId: 'FACTOR-EU-MDR-1', observed_at: '2026-03-01' },
  ],
  childActivities: [
    { id: 'ACTIVITY-EU-CHILD-1', name: 'Notified-body engagement', start_date: '2026-05-01', end_date: '2026-12-01', owner: 'UNIT-REGULATORY' },
  ],
  goalNames: ['Access EU market'],
  stakeholders: [
    { id: 'STAKEHOLDER-OPS-1', name: 'Operations', role: 'owner' },
    { id: 'STAKEHOLDER-CEO-1', name: 'CEO', role: 'sponsor' },
  ],
  notes: 'Pre-audit scheduled for October 2026.',
};

describe('layoutActivityCard', () => {
  it('produces positive bounds', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.bounds.width).toBeGreaterThan(0);
    expect(l.bounds.height).toBeGreaterThan(0);
  });

  it('title row carries the project name', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.titleRow.name).toBe('EU MDR conformity programme');
  });

  it('renders activity type and status badges when present', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.activityTypeBadge?.label).toBe('programme');
    expect(l.statusBadge?.label).toBe('in progress');
  });

  it('badges are absent when project fields are unset', () => {
    const l = layoutActivityCard({ ...RESOLVED, project: { id: 'A', name: 'n' } });
    expect(l.activityTypeBadge).toBeUndefined();
    expect(l.statusBadge).toBeUndefined();
  });

  it('three date fields with correct labels and values', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.dateFields).toHaveLength(3);
    expect(l.dateFields[0]).toMatchObject({ label: 'Initiation', value: '2026-04-01' });
    expect(l.dateFields[1]).toMatchObject({ label: 'Planned start', value: '2026-04-15' });
    expect(l.dateFields[2]).toMatchObject({ label: 'Planned end', value: '2027-03-15' });
  });

  it('renders "—" for absent dates', () => {
    const l = layoutActivityCard({ ...RESOLVED, project: { id: 'A', name: 'n' } });
    expect(l.dateFields.map((d) => d.value)).toEqual(['—', '—', '—']);
  });

  it('four stakeholder role slots always rendered', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.stakeholderRoleSlots).toHaveLength(4);
    expect(l.stakeholderRoleSlots.map((s) => s.role)).toEqual(['Initiator', 'Owner', 'Sponsor', 'PM']);
    expect(l.stakeholderRoleSlots[0].name).toBe('—');       // no initiator
    expect(l.stakeholderRoleSlots[1].name).toBe('Operations'); // owner
    expect(l.stakeholderRoleSlots[2].name).toBe('CEO');        // sponsor
    expect(l.stakeholderRoleSlots[3].name).toBe('—');       // no PM
  });

  it('description row present when cardDescription is set', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.descriptionRow?.label).toBe('Description');
    expect(l.descriptionRow?.valueLines.join(' ')).toContain('Summary');
  });

  it('description row absent when cardDescription is empty', () => {
    const l = layoutActivityCard({ ...RESOLVED, cardDescription: undefined });
    expect(l.descriptionRow).toBeUndefined();
  });

  it('three chain sections in order: drivers, goals, changes', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.chainSections.map((s) => s.type)).toEqual(['drivers', 'goals', 'changes']);
  });

  it('chain sections carry the resolved nodes', () => {
    const l = layoutActivityCard(RESOLVED);
    const drivers = l.chainSections.find((s) => s.type === 'drivers')!;
    const goals = l.chainSections.find((s) => s.type === 'goals')!;
    const changes = l.chainSections.find((s) => s.type === 'changes')!;
    expect(drivers.nodes.map((n) => n.id)).toEqual(['FACTOR-EU-MDR-1']);
    expect(goals.nodes.map((n) => n.id)).toEqual(['GOAL-EU-MARKET-1']);
    expect(changes.nodes.map((n) => n.id)).toEqual(['CHANGE-EU-COMPLIANCE-1']);
  });

  it('empty chain sections have isEmpty=true', () => {
    const l = layoutActivityCard({
      ...RESOLVED,
      motivation: { drivers: [], goals: [], changes: [] },
      assessments: [],
    });
    expect(l.chainSections.every((s) => s.isEmpty)).toBe(true);
  });

  it('builds driver→goal and goal→change edges', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.chainEdges).toContainEqual({ sourceId: 'FACTOR-EU-MDR-1', targetId: 'GOAL-EU-MARKET-1' });
    expect(l.chainEdges).toContainEqual({ sourceId: 'GOAL-EU-MARKET-1', targetId: 'CHANGE-EU-COMPLIANCE-1' });
  });


  it('milestone ArchiMate class is set', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.milestones).toHaveLength(1);
    expect(l.milestones[0].archimateClass).toBe(ARCHIMATE_CLASS.MILESTONE);
  });

  it('child activity ArchiMate class is set', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.childActivities[0].archimateClass).toBe(ARCHIMATE_CLASS.ACTIVITY);
  });

  it('footer row present when notes is set', () => {
    const l = layoutActivityCard(RESOLVED);
    expect(l.footerRow?.label).toBe('Notes');
    expect(l.footerRow?.valueLines.join(' ')).toContain('Pre-audit');
  });

  it('footer row absent when notes is empty', () => {
    const l = layoutActivityCard({ ...RESOLVED, notes: undefined });
    expect(l.footerRow).toBeUndefined();
  });

  it('handles an empty card without throwing', () => {
    const l = layoutActivityCard({
      cardId: 'ACTIVITY_CARD-X-1',
      project: { id: 'ACTIVITY-X-1', name: 'Empty' },
      milestones: [],
      motivation: { drivers: [], goals: [], changes: [] },
      assessments: [],
      childActivities: [],
    });
    expect(l.milestones).toHaveLength(0);
    expect(l.bounds.height).toBeGreaterThan(0);
  });
});
