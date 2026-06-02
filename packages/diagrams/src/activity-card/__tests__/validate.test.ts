import { describe, it, expect } from 'vitest';
import { validateActivityCard } from '../validate.js';

const VALID = {
  notation: 'activity-card',
  spec_version: '0.1',
  activity_card: {
    id: 'ACTIVITY_CARD-EU-PROGRAMME-1',
    project: 'ACTIVITY-EU-PROGRAMME-1',
    description: 'Executive summary.',
    milestones: [
      {
        id: 'MILESTONE-EU-CONFORMITY-CERT-1',
        name: 'Certification obtained',
        date: '2027-01-31',
        delivers_changes: ['CHANGE-EU-COMPLIANCE-1'],
      },
    ],
  },
};

describe('validateActivityCard', () => {
  it('accepts a well-formed card', () => {
    const r = validateActivityCard(VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validateActivityCard('x').valid).toBe(false);
    expect(validateActivityCard(null).valid).toBe(false);
  });

  it('HDR-001 on missing notation', () => {
    const { notation: _drop, ...rest } = VALID;
    const r = validateActivityCard(rest);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'HDR-001')).toBe(true);
  });

  it('HDR-002 on wrong notation', () => {
    const r = validateActivityCard({ ...VALID, notation: 'activities' });
    expect(r.errors.some((e) => e.code === 'HDR-002')).toBe(true);
  });

  it('AC-001 on missing activity_card block', () => {
    const r = validateActivityCard({ notation: 'activity-card' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'AC-001')).toBe(true);
  });

  it('AC-002 on malformed card id', () => {
    const r = validateActivityCard({ ...VALID, activity_card: { ...VALID.activity_card, id: 'CARD-1' } });
    expect(r.errors.some((e) => e.code === 'AC-002')).toBe(true);
  });

  it('PC-001 on missing project', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: { ...VALID.activity_card, project: undefined },
    });
    expect(r.errors.some((e) => e.code === 'PC-001')).toBe(true);
  });

  it('PC-001 on malformed project id', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: { ...VALID.activity_card, project: 'GOAL-1' },
    });
    expect(r.errors.some((e) => e.code === 'PC-001')).toBe(true);
  });

  it('AC-003 on milestone missing required fields', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: { ...VALID.activity_card, milestones: [{ id: 'MILESTONE-X-1' }] },
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'AC-003')).toBe(true);
  });

  it('AC-004 on malformed milestone id', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: {
        ...VALID.activity_card,
        milestones: [{ id: 'MS-1', name: 'x', date: '2027-01-01' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'AC-004')).toBe(true);
  });

  it('AC-004 on duplicate milestone id', () => {
    const m = { id: 'MILESTONE-X-1', name: 'x', date: '2027-01-01' };
    const r = validateActivityCard({
      ...VALID,
      activity_card: { ...VALID.activity_card, milestones: [m, { ...m }] },
    });
    expect(r.errors.some((e) => e.code === 'AC-004' && /Duplicate/.test(e.message))).toBe(true);
  });

  it('AC-005 on bad milestone date format', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: {
        ...VALID.activity_card,
        milestones: [{ id: 'MILESTONE-X-1', name: 'x', date: '31/01/2027' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'AC-005')).toBe(true);
  });

  it('AC-006 on malformed delivers_changes entry', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: {
        ...VALID.activity_card,
        milestones: [{ id: 'MILESTONE-X-1', name: 'x', date: '2027-01-01', delivers_changes: ['GOAL-1'] }],
      },
    });
    expect(r.errors.some((e) => e.code === 'AC-006')).toBe(true);
  });

  it('accepts a card with no milestones', () => {
    const r = validateActivityCard({
      ...VALID,
      activity_card: { id: 'ACTIVITY_CARD-X-1', project: 'ACTIVITY-X-1' },
    });
    expect(r.valid).toBe(true);
  });
});
