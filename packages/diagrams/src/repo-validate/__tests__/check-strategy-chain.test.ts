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
    model.elements.push(goal('GOAL-A', { parent: 'GOAL-B' }), goal('GOAL-B', { parent: 'GOAL-A' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', ruleId: 'GOALS-010' });
    expect(findings[0].message).toContain('cycle');
  });

  it('does not flag an acyclic parent chain', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-ROOT'), goal('GOAL-CHILD', { parent: 'GOAL-ROOT' }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('does not flag a goal whose parent is unresolved (orphan, not a cycle — GOALS-009 deferred)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-A', { parent: 'GOAL-MISSING' }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('does not flag a goal with no parent at all (v0.x transitional — GOALS-011 deferred)', () => {
    // Matches organizations/acme_corp's GOAL-CUST-1 / GOAL-OPS-1 shape: level
    // >= 1, no `parent` on the element (parent carried by the goals-tree view).
    const model = emptyModel();
    model.elements.push(goal('GOAL-BACKLOG', { type: 'Strategic Goal', level: 1 }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — ACT-006 (predecessor cycle) / ACT-007 (self-predecessor)', () => {
  it('flags a predecessor cycle', () => {
    const model = emptyModel();
    model.elements.push(
      action('ACTION-A', { predecessors: ['ACTION-B'] }),
      action('ACTION-B', { predecessors: ['ACTION-A'] }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', ruleId: 'ACT-006' });
  });

  it('does not flag an acyclic predecessor chain', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A'), action('ACTION-B', { predecessors: ['ACTION-A'] }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags an action listing itself as a predecessor (also a 1-node cycle, matching DSM findActivityCycle)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-SELF', { predecessors: ['ACTION-SELF'] }));
    const findings = validateRepoModel(model);
    const ruleIds = findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(['ACT-006', 'ACT-007']);
    expect(findings.every((f) => f.id === 'ACTION-SELF')).toBe(true);
  });

  it('does not flag an unresolved predecessor (orphan — ACT-005 deferred)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { predecessors: ['ACTION-MISSING'] }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — ACT-008 (dates)', () => {
  it('flags end_date before start_date', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { start_date: '2026-06-01', end_date: '2026-05-01' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ scope: 'repo', id: 'ACTION-A', ruleId: 'ACT-008' });
    expect(findings[0].message).toContain('before');
  });

  it('allows end_date equal to start_date (milestone)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { start_date: '2026-06-01', end_date: '2026-06-01', duration: 0 }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags a calendar-invalid date', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { start_date: '2026-02-30' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-008' });
    expect(findings[0].message).toContain('not a valid');
  });

  it('flags a malformed date string', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { end_date: '06/01/2026' }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-008' });
  });

  it('does not flag an action with no dates at all', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { duration_days: 5 }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — ACT-009 (negative numeric fields)', () => {
  it('flags a negative duration', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { duration: -3 }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-009' });
  });

  it('flags a negative duration_days (the field acme_corp actually uses)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { duration_days: -3 }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ ruleId: 'ACT-009' });
  });

  it('flags a negative labor_cost / resources_cost / effort / score independently', () => {
    const model = emptyModel();
    model.elements.push(
      action('ACTION-A', { labor_cost: -1, resources_cost: -2, effort: -3, score: -4 }),
    );
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.ruleId === 'ACT-009')).toBe(true);
  });

  it('does not flag non-negative numeric fields', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { duration_days: 30, labor_cost: 0, effort: 100, score: 5 }));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — FGCA-008..011 (strategy-chain cross-references)', () => {
  it('flags GOAL.factors referencing an undefined driver (FGCA-008)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-A', { factors: ['DRIVER-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'GOAL-A', ruleId: 'FGCA-008' });
  });

  it('accepts GOAL.factors that resolve to a driver', () => {
    const model = emptyModel();
    model.elements.push(driver('DRIVER-A'), goal('GOAL-A', { factors: ['DRIVER-A'] }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('accepts the legacy `factor` notation value for the driver cross-reference', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/01_motivation/factors/DRIVER-A.yaml', { notation: 'factor', id: 'DRIVER-A' }));
    model.elements.push(goal('GOAL-A', { factors: ['DRIVER-A'] }));
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('flags CHANGE.goals referencing an undefined goal (FGCA-009)', () => {
    const model = emptyModel();
    model.elements.push(change('CHANGE-A', { goals: ['GOAL-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'CHANGE-A', ruleId: 'FGCA-009' });
  });

  it('flags ACTION.delivers_changes referencing an undefined change (FGCA-010)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { delivers_changes: ['CHANGE-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'ACTION-A', ruleId: 'FGCA-010' });
  });

  it('flags ACTION.goals referencing an undefined goal (FGCA-011)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-A', { goals: ['GOAL-MISSING'] }));
    const findings = validateRepoModel(model);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'ACTION-A', ruleId: 'FGCA-011' });
  });

  it('accepts a fully-resolved strategy chain end to end (driver -> goal -> change -> action)', () => {
    const model = emptyModel();
    model.elements.push(
      driver('DRIVER-A'),
      goal('GOAL-A', { factors: ['DRIVER-A'] }),
      change('CHANGE-A', { goals: ['GOAL-A'] }),
      action('ACTION-A', { goals: ['GOAL-A'], delivers_changes: ['CHANGE-A'] }),
    );
    expect(validateRepoModel(model)).toEqual([]);
  });

  it('does not flag a driver/goal/change that is unreferenced (orphan — FGCA-012..014 deferred)', () => {
    const model = emptyModel();
    model.elements.push(driver('DRIVER-UNUSED'), goal('GOAL-UNUSED'), change('CHANGE-UNUSED'));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkStrategyChainSemantics — organizations/acme_corp parity shape', () => {
  it('does not flag acme_corp-shaped goals/actions/drivers/changes', () => {
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
    expect(validateRepoModel(model)).toEqual([]);
  });
});
