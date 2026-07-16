import { describe, it, expect } from 'vitest';
import { isObject, str, strArray, descendantsOf, parentChainDepth, stripEnvelope } from '../canon-resolver-utils.js';

describe('isObject', () => {
  it('accepts plain objects, rejects arrays/null/primitives', () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject('x')).toBe(false);
    expect(isObject(42)).toBe(false);
  });
});

describe('str', () => {
  it('returns the trimmed string for a non-blank string', () => {
    expect(str('  Task  ')).toBe('Task');
    expect(str('Task')).toBe('Task');
  });

  it('returns undefined for blank strings and non-strings', () => {
    expect(str('')).toBeUndefined();
    expect(str('   ')).toBeUndefined();
    expect(str(42)).toBeUndefined();
    expect(str(null)).toBeUndefined();
    expect(str(undefined)).toBeUndefined();
  });
});

describe('strArray', () => {
  it('filters to non-blank strings only', () => {
    expect(strArray(['a', '', '  ', 'b', 42, null])).toEqual(['a', 'b']);
  });

  it('returns an empty array for non-arrays', () => {
    expect(strArray('not an array')).toEqual([]);
    expect(strArray(undefined)).toEqual([]);
  });
});

describe('descendantsOf', () => {
  const all = new Map<string, Record<string, unknown>>([
    ['ROOT', { id: 'ROOT' }],
    ['CHILD-1', { id: 'CHILD-1', parent: 'ROOT' }],
    ['CHILD-2', { id: 'CHILD-2', parent: 'ROOT' }],
    ['GRANDCHILD-1', { id: 'GRANDCHILD-1', parent: 'CHILD-1' }],
    ['UNRELATED', { id: 'UNRELATED' }],
  ]);

  it('includes the root and every transitive descendant, excludes unrelated nodes', () => {
    const result = descendantsOf('ROOT', all);
    expect([...result].sort()).toEqual(['CHILD-1', 'CHILD-2', 'GRANDCHILD-1', 'ROOT']);
  });

  it('returns just the root when it has no children', () => {
    expect([...descendantsOf('UNRELATED', all)]).toEqual(['UNRELATED']);
  });

  it('does not infinite-loop on a self-referencing cycle', () => {
    const cyclic = new Map<string, Record<string, unknown>>([
      ['A', { id: 'A', parent: 'B' }],
      ['B', { id: 'B', parent: 'A' }],
    ]);
    expect([...descendantsOf('A', cyclic)].sort()).toEqual(['A', 'B']);
  });
});

describe('parentChainDepth', () => {
  const all = new Map<string, Record<string, unknown>>([
    ['ROOT', { id: 'ROOT' }],
    ['CHILD', { id: 'CHILD', parent: 'ROOT' }],
    ['GRANDCHILD', { id: 'GRANDCHILD', parent: 'CHILD' }],
    ['ORPHAN-REF', { id: 'ORPHAN-REF', parent: 'DOES-NOT-EXIST' }],
  ]);

  it('computes depth as steps up the parent chain', () => {
    expect(parentChainDepth('ROOT', all)).toBe(0);
    expect(parentChainDepth('CHILD', all)).toBe(1);
    expect(parentChainDepth('GRANDCHILD', all)).toBe(2);
  });

  it('treats a dangling parent reference as a root (depth 0)', () => {
    expect(parentChainDepth('ORPHAN-REF', all)).toBe(0);
  });

  it('terminates on a cycle instead of infinite-looping (a defensive backstop — real canon data has no parent cycles)', () => {
    const cyclic = new Map<string, Record<string, unknown>>([
      ['A', { id: 'A', parent: 'B' }],
      ['B', { id: 'B', parent: 'A' }],
    ]);
    expect(Number.isFinite(parentChainDepth('A', cyclic))).toBe(true);
  });

  it('memoizes across calls sharing the same memo map', () => {
    const memo = new Map<string, number>();
    expect(parentChainDepth('GRANDCHILD', all, memo)).toBe(2);
    // CHILD's depth was computed as a byproduct and should be cached, not recomputed.
    expect(memo.get('CHILD')).toBe(1);
    expect(parentChainDepth('CHILD', all, memo)).toBe(1);
  });
});

describe('stripEnvelope', () => {
  it('removes admission/lifecycle envelope fields, keeps everything else', () => {
    const el = {
      id: 'ACTION-1',
      name: 'Do the thing',
      type: 'Task',
      notation: 'action',
      zone: 'canon',
      admitted_at: '2026-01-01',
      admitted_by: 'v.korobeinikov',
      gate_checks: { uniqueness: 'pass' },
      valid_from: '2026-01-01',
      valid_to: null,
    };
    expect(stripEnvelope(el)).toEqual({ id: 'ACTION-1', name: 'Do the thing', type: 'Task' });
  });

  it('does not mutate the input object', () => {
    const el = { id: 'X', zone: 'canon' };
    stripEnvelope(el);
    expect(el).toEqual({ id: 'X', zone: 'canon' });
  });
});
