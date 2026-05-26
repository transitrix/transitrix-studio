import { describe, it, expect } from 'vitest';
import { validateIssues } from '../validate.js';

const VALID = {
  notation: 'issues',
  issues_catalogue: {
    id: 'ISSUES-CAT-1',
    name: 'Test Register',
    updated_at: '2026-05-25',
    issues: [
      { issue_id: 'ISSUE-1', name: 'Root issue', status: 'open' },
      { issue_id: 'ISSUE-2', name: 'Sub issue', status: 'in_progress', parent: 'ISSUE-1' },
    ],
  },
};

function withIssues(issues: unknown[]): unknown {
  return { ...VALID, issues_catalogue: { ...VALID.issues_catalogue, issues } };
}

describe('validateIssues', () => {
  it('passes on valid input', () => {
    const r = validateIssues(VALID);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('ISS-000: rejects a non-object', () => {
    expect(validateIssues(null).valid).toBe(false);
    expect(validateIssues('x').errors[0].code).toBe('ISS-000');
  });

  it('ISS-000: rejects a wrong notation header', () => {
    const r = validateIssues({ ...VALID, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'ISS-000')).toBe(true);
  });

  it('ISS-000: rejects a missing issues_catalogue', () => {
    const r = validateIssues({ notation: 'issues' });
    expect(r.errors.some(e => e.code === 'ISS-000')).toBe(true);
  });

  it('ISS-001: detects a duplicate issue_id', () => {
    const r = validateIssues(withIssues([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open' },
      { issue_id: 'ISSUE-1', name: 'B', status: 'open' },
    ]));
    expect(r.errors.some(e => e.code === 'ISS-001')).toBe(true);
  });

  it('ISS-002: detects a status outside the vocabulary', () => {
    const r = validateIssues(withIssues([{ issue_id: 'ISSUE-1', name: 'A', status: 'wip' }]));
    expect(r.errors.some(e => e.code === 'ISS-002')).toBe(true);
  });

  it('ISS-003: detects a missing or empty name', () => {
    const r = validateIssues(withIssues([{ issue_id: 'ISSUE-1', name: '', status: 'open' }]));
    expect(r.errors.some(e => e.code === 'ISS-003')).toBe(true);
  });

  it('ISS-004: warns on a broken parent reference and stays valid', () => {
    const r = validateIssues(withIssues([
      { issue_id: 'ISSUE-1', name: 'Orphan', status: 'open', parent: 'ISSUE-99' },
    ]));
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'ISS-004')).toBe(true);
  });

  it('ISS-005: detects a parent cycle', () => {
    const r = validateIssues(withIssues([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open', parent: 'ISSUE-2' },
      { issue_id: 'ISSUE-2', name: 'B', status: 'open', parent: 'ISSUE-1' },
    ]));
    expect(r.errors.some(e => e.code === 'ISS-005')).toBe(true);
  });

  it('ISS-006: rejects a relates_to entry that is not an ACTIVITY-/GOAL- id', () => {
    const r = validateIssues(withIssues([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open', relates_to: ['PRODUCT-1'] },
    ]));
    expect(r.errors.some(e => e.code === 'ISS-006')).toBe(true);
  });

  it('accepts valid ACTIVITY-/GOAL- relates_to ids', () => {
    const r = validateIssues(withIssues([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open', relates_to: ['ACTIVITY-5', 'GOAL-CUST-1'] },
    ]));
    expect(r.valid).toBe(true);
  });

  it('tolerates a null element in issues[] without throwing', () => {
    const r = validateIssues(withIssues([null]));
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'ISS-003')).toBe(true);
  });
});
