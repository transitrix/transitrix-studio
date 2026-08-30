import { describe, it, expect } from 'vitest';
import { validateRepoModel } from '../validate-repo.js';
import type { RepoDoc, RepoModelInput } from '../types.js';

function el(path: string, data: Record<string, unknown> | null, parseError?: string): RepoDoc {
  return { path, data, parseError };
}

function emptyModel(): RepoModelInput {
  return { elements: [], relations: [] };
}

function goal(id: string, extra: Record<string, unknown> = {}): RepoDoc {
  return el(`canon/elements/01_motivation/goals/${id}.yaml`, { notation: 'goal', id, name: id, ...extra });
}

function action(id: string, extra: Record<string, unknown> = {}): RepoDoc {
  return el(`canon/elements/05_implementation/actions/${id}.yaml`, { notation: 'action', id, name: id, ...extra });
}

function driver(id: string, extra: Record<string, unknown> = {}): RepoDoc {
  return el(`canon/elements/01_motivation/factors/${id}.yaml`, { notation: 'driver', id, name: id, ...extra });
}

function change(id: string, extra: Record<string, unknown> = {}): RepoDoc {
  return el(`canon/elements/05_implementation/changes/${id}.yaml`, { notation: 'change', id, name: id, ...extra });
}

describe('checkStrategyChainSemantics — GOALS-010 (parent cycle)', () => {
  it('flags a two-goal parent cycle', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-A-1', { parent: 'GOAL-B-1' }), goal('GOAL-B-1', { parent: 'GOAL-A-1' }));
    const findings = validateRepoModel(model);
    const errors = findings.filter((f) => f.severity !== 'warning');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ scope: 'repo', ruleId: 'GOALS-010' });
    expect(errors[0].message).toContain('cycle');
    // Both goals are unreferenced by any change/action — DGCA-REPO-013 warnings.
    expect(findings.filter((f) => f.ruleId === 'DGCA-REPO-013')).toHaveLength(2);
  });

  it('does not flag an acyclic parent chain (beyond the expected unreferenced-goal warnings)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-ROOT-1'), goal('GOAL-CHILD-1', { parent: 'GOAL-ROOT-1' }));
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
    expect(findings.every((f) => f.ruleId === 'DGCA-REPO-013')).toBe(true);
  });

  it('flags GOALS-009 for a goal whose parent is unresolved (orphan, not a cycle — warning)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-A-1', { parent: 'GOAL-MISSING' }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ scope: 'repo', id: 'GOAL-A-1', ruleId: 'GOALS-009', severity: 'warning' }),
    );
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('flags GOALS-011 for a level >= 1 goal with no parent at all (backlog — warning)', () => {
    // Matches organizations/acme_corp's GOAL-CUST-1 / GOAL-OPS-1 shape: level
    // >= 1, no `parent` on the element (parent carried by the goals-tree view).
    const model = emptyModel();
    model.elements.push(goal('GOAL-BACKLOG-1', { type: 'Strategic Goal', level: 1 }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ scope: 'repo', id: 'GOAL-BACKLOG-1', ruleId: 'GOALS-011', severity: 'warning' }),
    );
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('does not flag GOALS-009/011 for a level-0 (root) goal with no parent', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-ROOT-1', { type: 'Strategy', level: 0 }));
    const findings = validateRepoModel(model);
    expect(findings.some((f) => f.ruleId === 'GOALS-009' || f.ruleId === 'GOALS-011')).toBe(false);
  });
});

describe('checkStrategyChainSemantics — ACT-006 (predecessor cycle) / ACT-007 (self-predecessor)', () => {
  it('flags a predecessor cycle', () => {
    const model = emptyModel();
    model.elements.push(
      action('ACTION-A-1', { predecessors: ['ACTION-B-1'] }),
      action('ACTION-B-1', { predecessors: ['ACTION-A-1'] }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', ruleId: 'ACT-006' });
  });

  it('does not flag an acyclic predecessor chain', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1'), action('ACTION-B-1', { predecessors: ['ACTION-A-1'] }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags an action listing itself as a predecessor (also a 1-node cycle, matching DSM findActivityCycle)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-SELF-1', { predecessors: ['ACTION-SELF-1'] }));
    const findings = validateRepoModel(model);
    const ruleIds = findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(['ACT-006', 'ACT-007']);
    expect(findings.every((f) => f.id === 'ACTION-SELF-1')).toBe(true);
  });

  it('flags ACT-005 for an unresolved predecessor (orphan — warning)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { predecessors: ['ACTION-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ scope: 'repo', id: 'ACTION-A-1', ruleId: 'ACT-005', severity: 'warning' }),
    ]);
  });

  it('flags ACT-005 for an unresolved parent (orphan — warning)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { parent: 'ACTION-MISSING' }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ scope: 'repo', id: 'ACTION-A-1', ruleId: 'ACT-005', severity: 'warning' }),
    ]);
  });

  it('does not flag ACT-005 for a resolved predecessor/parent', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-ROOT-1'), action('ACTION-CHILD-1', { parent: 'ACTION-ROOT-1', predecessors: ['ACTION-ROOT-1'] }));
    expect(validateRepoModel(model).filter((f) => f.ruleId === 'ACT-005')).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — ACT-008 (dates)', () => {
  it('flags end_date before start_date', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { start_date: '2026-06-01', end_date: '2026-05-01' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'ACTION-A-1', ruleId: 'ACT-008' });
    expect(findings[0].message).toContain('before');
  });

  it('allows end_date equal to start_date (milestone)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { start_date: '2026-06-01', end_date: '2026-06-01', duration: 0 }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags a calendar-invalid date', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { start_date: '2026-02-30' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-008' });
    expect(findings[0].message).toContain('not a valid');
  });

  it('flags a malformed date string', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { end_date: '06/01/2026' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-008' });
  });

  it('does not flag an action with no dates at all', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { duration_days: 5 }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — ACT-009 (negative numeric fields)', () => {
  it('flags a negative duration', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { duration: -3 }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-009' });
  });

  it('flags a negative duration_days (the field acme_corp actually uses)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { duration_days: -3 }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-009' });
  });

  it('flags a negative labor_cost / resources_cost / effort / score independently', () => {
    const model = emptyModel();
    model.elements.push(
      action('ACTION-A-1', { labor_cost: -1, resources_cost: -2, effort: -3, score: -4 }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.ruleId === 'ACT-009')).toBe(true);
  });

  it('does not flag non-negative numeric fields', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { duration_days: 30, labor_cost: 0, effort: 100, score: 5 }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — DGCA-REPO-008..011 (strategy-chain cross-references)', () => {
  it('flags GOAL.factors referencing an undefined driver (DGCA-REPO-008)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-A-1', { factors: ['DRIVER-MISSING'] }));
    const findings = validateRepoModel(model);
    const errors = findings.filter((f) => f.severity !== 'warning');
    expect(errors).toEqual([expect.objectContaining({ id: 'GOAL-A-1', ruleId: 'DGCA-REPO-008' })]);
    // GOAL-A is also unreferenced by any change/action — DGCA-REPO-013 warning.
    expect(findings.filter((f) => f.ruleId === 'DGCA-REPO-013')).toHaveLength(1);
  });

  it('accepts GOAL.factors that resolve to a driver (beyond the expected unreferenced-goal warning)', () => {
    const model = emptyModel();
    model.elements.push(driver('DRIVER-A'), goal('GOAL-A-1', { factors: ['DRIVER-A'] }));
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
    expect(findings).toEqual([
      expect.objectContaining({ id: 'GOAL-A-1', ruleId: 'DGCA-REPO-013', severity: 'warning' }),
    ]);
  });

  it('accepts the legacy `factor` notation value for the driver cross-reference', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/01_motivation/factors/DRIVER-A.yaml', { notation: 'factor', id: 'DRIVER-A' }));
    model.elements.push(goal('GOAL-A-1', { factors: ['DRIVER-A'] }));
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('flags CHANGE.goals referencing an undefined goal (DGCA-REPO-009)', () => {
    const model = emptyModel();
    model.elements.push(change('CHANGE-A', { goals: ['GOAL-MISSING'] }));
    const findings = validateRepoModel(model);
    const errors = findings.filter((f) => f.severity !== 'warning');
    expect(errors).toEqual([expect.objectContaining({ id: 'CHANGE-A', ruleId: 'DGCA-REPO-009' })]);
    // CHANGE-A is also unreferenced by any action — DGCA-REPO-014 warning.
    expect(findings.filter((f) => f.ruleId === 'DGCA-REPO-014')).toHaveLength(1);
  });

  it('flags ACTION.delivers_changes referencing an undefined change (DGCA-REPO-010)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { delivers_changes: ['CHANGE-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'ACTION-A-1', ruleId: 'DGCA-REPO-010' });
  });

  it('flags ACTION.goals referencing an undefined goal (DGCA-REPO-011)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A-1', { goals: ['GOAL-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'ACTION-A-1', ruleId: 'DGCA-REPO-011' });
  });

  it('accepts a fully-resolved strategy chain end to end (driver -> goal -> change -> action)', () => {
    const model = emptyModel();
    model.elements.push(
      driver('DRIVER-A'),
      goal('GOAL-A-1', { factors: ['DRIVER-A'] }),
      change('CHANGE-A', { goals: ['GOAL-A-1'] }),
      action('ACTION-A-1', { goals: ['GOAL-A-1'], delivers_changes: ['CHANGE-A'] }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags DGCA-REPO-012..014 for a driver/goal/change that is unreferenced (orphan — warning)', () => {
    const model = emptyModel();
    model.elements.push(driver('DRIVER-UNUSED'), goal('GOAL-UNUSED-1'), change('CHANGE-UNUSED'));
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'DRIVER-UNUSED', ruleId: 'DGCA-REPO-012', severity: 'warning' }),
        expect.objectContaining({ id: 'GOAL-UNUSED-1', ruleId: 'DGCA-REPO-013', severity: 'warning' }),
        expect.objectContaining({ id: 'CHANGE-UNUSED', ruleId: 'DGCA-REPO-014', severity: 'warning' }),
      ]),
    );
    expect(findings).toHaveLength(3);
  });
});

describe('checkStrategyChainSemantics — organizations/acme_corp parity shape', () => {
  it('flags no error-severity finding on acme_corp-shaped goals/actions/drivers/changes', () => {
    // Mirrors organizations/acme_corp's real fixture: goals with no inline
    // `parent` (carried by the goals-tree view), actions using `duration_days`
    // with `predecessors` and `delivers_changes`, drivers/changes resolving.
    const model = emptyModel();
    model.elements.push(
      driver('DRIVER-COMP-1'),
      goal('GOAL-OPS-1', { type: 'Strategic Goal', level: 1, factors: ['DRIVER-COMP-1'] }),
      goal('GOAL-CUST-1', { type: 'Strategic Goal', level: 1 }),
      change('CHANGE-ONBOARD-1', { goals: ['GOAL-CUST-1'] }),
      action('ACTION-DESIGN-1', { duration_days: 10 }),
      action('ACTION-BUILD-1', { duration_days: 30, predecessors: ['ACTION-DESIGN-1'], delivers_changes: ['CHANGE-ONBOARD-1'] }),
      action('ACTION-LAUNCH-1', { duration_days: 5, predecessors: ['ACTION-BUILD-1'], delivers_changes: ['CHANGE-ONBOARD-1'] }),
    );
    const findings = validateRepoModel(model);
    // No blocking findings — the ERROR-tier parity bar this fixture has always held.
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
    // Warning tier: GOAL-OPS-1/GOAL-CUST-1 are level >= 1 with no inline
    // `parent` (GOALS-011 — expected, ported deliberately at warning severity);
    // GOAL-OPS-1 is not referenced by any change/action's `goals` (DGCA-REPO-013) —
    // only GOAL-CUST-1 is (via CHANGE-ONBOARD-1.goals).
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'GOAL-OPS-1', ruleId: 'GOALS-011', severity: 'warning' }),
        expect.objectContaining({ id: 'GOAL-CUST-1', ruleId: 'GOALS-011', severity: 'warning' }),
        expect.objectContaining({ id: 'GOAL-OPS-1', ruleId: 'DGCA-REPO-013', severity: 'warning' }),
      ]),
    );
    expect(findings).toHaveLength(3);
  });
});
