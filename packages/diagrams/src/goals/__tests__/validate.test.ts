import { describe, it, expect } from 'vitest';
import { validateGoalTree } from '../validate.js';

const VALID_TREE = {
  goal_types: [
    { name: 'Strategy', level: 0 },
    { name: 'Business Goal', level: 1 },
    { name: 'Project', level: 2 },
  ],
  goals: [
    { id: 1, name: 'Triple revenue', type: 'Strategy', level: 0, parent_id: 0 },
    { id: 2, name: 'Launch EU', type: 'Business Goal', level: 1, parent_id: 1 },
    { id: 3, name: 'Open Berlin office', type: 'Project', level: 2, parent_id: 2 },
  ],
};

describe('validateGoalTree', () => {
  it('passes on valid input', () => {
    const r = validateGoalTree(VALID_TREE);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('SCHEMA_INVALID: rejects non-object', () => {
    expect(validateGoalTree(null).valid).toBe(false);
    expect(validateGoalTree('string').errors[0].code).toBe('SCHEMA_INVALID');
  });

  it('SCHEMA_INVALID: rejects missing goals array', () => {
    const r = validateGoalTree({ goal_types: [] });
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('DUPLICATE_ID: detects duplicate goal ids', () => {
    const tree = {
      ...VALID_TREE,
      goals: [
        { id: 1, name: 'A', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 1, name: 'B', type: 'Strategy', level: 0, parent_id: 0 },
      ],
    };
    const r = validateGoalTree(tree);
    expect(r.errors.some(e => e.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('EMPTY_NAME: detects empty name', () => {
    const tree = {
      ...VALID_TREE,
      goals: [{ id: 1, name: '', type: 'Strategy', level: 0, parent_id: 0 }],
    };
    expect(validateGoalTree(tree).errors.some(e => e.code === 'EMPTY_NAME')).toBe(true);
  });

  it('MAX_LEVEL_EXCEEDED: detects level overflow', () => {
    const tree = {
      goal_types: [{ name: 'Strategy', level: 0 }],
      goals: [{ id: 1, name: 'Too deep', type: 'Strategy', level: 5, parent_id: 0 }],
    };
    expect(validateGoalTree(tree).errors.some(e => e.code === 'MAX_LEVEL_EXCEEDED')).toBe(true);
  });

  it('TYPE_LEVEL_MISMATCH: warns when type level disagrees', () => {
    const tree = {
      ...VALID_TREE,
      goals: [{ id: 1, name: 'Mismatch', type: 'Project', level: 0, parent_id: 0 }],
    };
    const r = validateGoalTree(tree);
    expect(r.warnings.some(w => w.code === 'TYPE_LEVEL_MISMATCH')).toBe(true);
  });

  it('BROKEN_PARENT_REF: warns on missing parent (renders to backlog)', () => {
    const tree = {
      ...VALID_TREE,
      goals: [
        { id: 1, name: 'Root', type: 'Strategy', level: 0, parent_id: 0 },
        { id: 2, name: 'Orphan', type: 'Business Goal', level: 1, parent_id: 99 },
      ],
    };
    const r = validateGoalTree(tree);
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => w.code === 'BROKEN_PARENT_REF')).toBe(true);
  });

  it('CYCLE_DETECTED: detects direct cycle', () => {
    const tree = {
      goal_types: [{ name: 'S', level: 0 }, { name: 'B', level: 1 }],
      goals: [
        { id: 1, name: 'A', type: 'S', level: 0, parent_id: 2 },
        { id: 2, name: 'B', type: 'B', level: 1, parent_id: 1 },
      ],
    };
    expect(validateGoalTree(tree).errors.some(e => e.code === 'CYCLE_DETECTED')).toBe(true);
  });

  // Pre-release blocker regression tests (orchestrator review 2026-05-21).
  it('[blocker] tolerates a null element in goals[] without throwing', () => {
    const tree = { ...VALID_TREE, goals: [null] };
    const r = validateGoalTree(tree);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('[blocker] tolerates a non-object element in goals[] without throwing', () => {
    const tree = { ...VALID_TREE, goals: ['x'] };
    const r = validateGoalTree(tree);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID')).toBe(true);
  });

  it('[blocker] rejects non-numeric level (does not silently slip a string compare)', () => {
    const tree = {
      ...VALID_TREE,
      goals: [{ id: 1, name: 'A', type: 'Strategy', level: '5', parent_id: 0 }],
    };
    const r = validateGoalTree(tree);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID' && /level/.test(e.message))).toBe(true);
  });

  it('[blocker] rejects missing level (does not silently slip undefined > N)', () => {
    const tree = {
      ...VALID_TREE,
      goals: [{ id: 1, name: 'A', type: 'Strategy', parent_id: 0 }],
    };
    const r = validateGoalTree(tree);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.code === 'SCHEMA_INVALID' && /level/.test(e.message))).toBe(true);
  });
});
