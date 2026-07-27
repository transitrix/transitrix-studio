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

describe('checkElementHygiene — GOAL-ELEM-002 (id)', () => {
  it('flags a missing id', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/01_motivation/goals/x.yaml', { notation: 'goal', name: 'X' }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(expect.objectContaining({ ruleId: 'GOAL-ELEM-002' }));
    expect(findings.find((f) => f.ruleId === 'GOAL-ELEM-002')?.severity).toBeUndefined();
  });

  it('warns on a malformed id (non-fatal)', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-X'));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: 'GOAL-X', ruleId: 'GOAL-ELEM-002', severity: 'warning' }),
    );
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('does not flag a well-formed id', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-REVENUE-1'));
    expect(validateRepoModel(model).some((f) => f.ruleId === 'GOAL-ELEM-002')).toBe(false);
  });
});

describe('checkElementHygiene — GOAL-ELEM-003 (name)', () => {
  it('flags a missing name', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/01_motivation/goals/GOAL-REVENUE-1.yaml', { notation: 'goal', id: 'GOAL-REVENUE-1' }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: 'GOAL-REVENUE-1', ruleId: 'GOAL-ELEM-003' }),
    );
  });

  it('does not flag a goal with name set', () => {
    const model = emptyModel();
    model.elements.push(goal('GOAL-REVENUE-1'));
    expect(validateRepoModel(model).some((f) => f.ruleId === 'GOAL-ELEM-003')).toBe(false);
  });
});

describe('checkElementHygiene — ACTION-001 (id/name)', () => {
  it('flags a missing id', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/05_implementation/actions/x.yaml', { notation: 'action', name: 'X' }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(expect.objectContaining({ ruleId: 'ACTION-001' }));
  });

  it('flags a missing name', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/05_implementation/actions/ACTION-BUILD-1.yaml', { notation: 'action', id: 'ACTION-BUILD-1' }));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: 'ACTION-BUILD-1', ruleId: 'ACTION-001' }),
    );
  });

  it('warns on a malformed id (non-fatal)', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-X'));
    const findings = validateRepoModel(model);
    expect(findings).toContainEqual(
      expect.objectContaining({ id: 'ACTION-X', ruleId: 'ACTION-001', severity: 'warning' }),
    );
    expect(findings.filter((f) => f.severity !== 'warning')).toEqual([]);
  });

  it('does not flag a well-formed action', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-BUILD-1'));
    expect(validateRepoModel(model)).toEqual([]);
  });
});

describe('checkElementHygiene — ACTION-002 (type vocabulary)', () => {
  it('flags an unrecognised type', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-BUILD-1', { type: 'Sprint' }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ id: 'ACTION-BUILD-1', ruleId: 'ACTION-002' }),
    ]);
  });

  it('accepts each vocabulary entry, including the Strategic Initiative alias', () => {
    for (const type of ['Initiative', 'Strategic Initiative', 'Programme', 'Project', 'Task']) {
      const model = emptyModel();
      model.elements.push(action('ACTION-BUILD-1', { type }));
      expect(validateRepoModel(model)).toEqual([]);
    }
  });
});

describe('checkElementHygiene — ACTION-005 (deprecated aliases)', () => {
  it('warns on the deprecated "activity" notation, without a duplicate ACTION-001 finding', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/05_implementation/actions/ACTION-BUILD-1.yaml', {
      notation: 'activity', id: 'ACTION-BUILD-1', name: 'Build',
    }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ id: 'ACTION-BUILD-1', ruleId: 'ACTION-005', severity: 'warning' }),
    ]);
  });

  it('warns on the deprecated ACTIVITY- id prefix', () => {
    const model = emptyModel();
    model.elements.push(el('canon/elements/05_implementation/actions/ACTIVITY-BUILD-1.yaml', {
      notation: 'action', id: 'ACTIVITY-BUILD-1', name: 'Build',
    }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ id: 'ACTIVITY-BUILD-1', ruleId: 'ACTION-005', severity: 'warning' }),
    ]);
  });

  it('warns on the deprecated activity_type field and still validates its vocabulary', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-BUILD-1', { activity_type: 'Task' }));
    const findings = validateRepoModel(model);
    expect(findings).toEqual([
      expect.objectContaining({ id: 'ACTION-BUILD-1', ruleId: 'ACTION-005', severity: 'warning' }),
    ]);
  });

  it('flags ACTION-002 through the deprecated activity_type field when the value is not in the vocabulary', () => {
    const model = emptyModel();
    model.elements.push(action('ACTION-BUILD-1', { activity_type: 'Sprint' }));
    const findings = validateRepoModel(model);
    const ruleIds = findings.map((f) => f.ruleId).sort();
    expect(ruleIds).toEqual(['ACTION-002', 'ACTION-005']);
  });
});

describe('checkElementHygiene — organizations/acme_corp parity shape', () => {
  it('flags no finding on acme_corp-shaped goal/action elements', () => {
    const model = emptyModel();
    model.elements.push(
      goal('GOAL-REVENUE-1', { type: 'Strategy', level: 0 }),
      action('ACTION-BUILD-1', { duration_days: 30, predecessors: ['ACTION-DESIGN-1'] }),
      action('ACTION-DESIGN-1', { duration_days: 10 }),
    );
    const findings = validateRepoModel(model);
    expect(findings.filter((f) => f.ruleId?.startsWith('GOAL-ELEM') || f.ruleId?.startsWith('ACTION-'))).toEqual([]);
  });
});
