import { describe, it, expect } from 'vitest';
import {
  checkScopeRoot,
  checkChainScope,
  SCOPE_MISSING_ROOT_CODE,
  SCOPE_MISSING_CHAIN_CODE,
  type Scope,
} from '../scope.js';

describe('checkScopeRoot', () => {
  it('returns null for non-root scopes', () => {
    expect(checkScopeRoot({ mode: 'all' }, [1, 2])).toBeNull();
    expect(checkScopeRoot({ mode: 'level', maxLevel: 1 }, [1, 2])).toBeNull();
  });

  it('returns null when the root id is present (numeric ids compared as strings)', () => {
    const scope: Scope = { mode: 'root', rootGoalId: '2' };
    expect(checkScopeRoot(scope, [1, 2, 3])).toBeNull();
  });

  it('returns a SCOPE-001 warning when the root id is absent', () => {
    const scope: Scope = { mode: 'root', rootGoalId: '99' };
    const w = checkScopeRoot(scope, [1, 2, 3]);
    expect(w).not.toBeNull();
    expect(w!.code).toBe(SCOPE_MISSING_ROOT_CODE);
    expect(w!.message).toContain('99');
  });

  it('handles string goal ids', () => {
    expect(checkScopeRoot({ mode: 'root', rootGoalId: 'g1' }, ['g1', 'g2'])).toBeNull();
    expect(checkScopeRoot({ mode: 'root', rootGoalId: 'gX' }, ['g1', 'g2'])).not.toBeNull();
  });
});

describe('checkChainScope', () => {
  const ids = {
    drivers: ['D1'],
    goals: ['G1'],
    changes: ['C1'],
    activities: ['A1'],
  };

  it('returns null when every selected id is present', () => {
    expect(checkChainScope({ mode: 'chain', driverId: 'D1', goalId: 'G1' }, ids)).toBeNull();
  });

  it('returns SCOPE-002 when a selected id is absent', () => {
    const w = checkChainScope({ mode: 'chain', goalId: 'GX' }, ids);
    expect(w).not.toBeNull();
    expect(w!.code).toBe(SCOPE_MISSING_CHAIN_CODE);
    expect(w!.message).toContain('GX');
  });

  it('ignores a change filter when hideChanges is set', () => {
    expect(checkChainScope({ mode: 'chain', changeId: 'CX' }, ids, true)).toBeNull();
  });
});
