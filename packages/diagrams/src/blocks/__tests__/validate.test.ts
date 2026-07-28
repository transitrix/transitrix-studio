import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateNestedBlocks, validateGrid, validateBlocks, REGISTERED_ELEMENT_TYPES } from '../validate.js';
import { RACI_GRID_RULES } from '../templates/raci.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus', 'blocks');

const VALID_DOC = {
  notation: 'blocks',
  spec_version: '0.1',
  nested_blocks: {
    id: 'BLOCKS-ARCH-1',
    name: 'Software architecture',
    blocks: [
      {
        id: 'APPLICATION_LAYER',
        name: 'Application Layer',
        children: [
          { id: 'FRONTEND', name: 'Frontend' },
          { id: 'BACKEND', name: 'Backend' },
        ],
      },
      {
        id: 'DATA_LAYER',
        name: 'Data Layer',
        children: [
          { id: 'POSTGRESQL', name: 'PostgreSQL' },
          { id: 'REDIS_CACHE', name: 'Redis Cache' },
        ],
      },
    ],
  },
};

describe('validateNestedBlocks', () => {
  it('passes on a valid document', () => {
    const r = validateNestedBlocks(VALID_DOC);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('BL-001: rejects non-object input', () => {
    expect(validateNestedBlocks(null).valid).toBe(false);
    expect(validateNestedBlocks(null).errors[0].code).toBe('BL-001');
    expect(validateNestedBlocks('string').errors[0].code).toBe('BL-001');
  });

  it('BL-001: rejects missing nested_blocks root key', () => {
    const r = validateNestedBlocks({ notation: 'blocks' });
    expect(r.errors.some((e) => e.code === 'BL-001')).toBe(true);
  });

  it('BL-001: rejects wrong notation value', () => {
    const r = validateNestedBlocks({ ...VALID_DOC, notation: 'goals' });
    expect(r.errors.some((e) => e.code === 'BL-001')).toBe(true);
  });

  it('BL-001: tolerates a missing notation field (header check is contract-level)', () => {
    const { notation: _, ...rest } = VALID_DOC;
    const r = validateNestedBlocks(rest);
    expect(r.errors.some((e) => e.code === 'BL-001')).toBe(false);
  });

  it('BL-002: rejects missing id', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, id: '' },
    });
    expect(r.errors.some((e) => e.code === 'BL-002')).toBe(true);
  });

  it('BL-002: rejects id that does not match BLOCKS grammar', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, id: 'BLK-1' },
    });
    expect(r.errors.some((e) => e.code === 'BL-002')).toBe(true);
  });

  it('BL-003: rejects missing name', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, name: '' },
    });
    expect(r.errors.some((e) => e.code === 'BL-003')).toBe(true);
  });

  it('BL-004: rejects missing blocks array', () => {
    const { blocks: _, ...rest } = VALID_DOC.nested_blocks;
    const r = validateNestedBlocks({ ...VALID_DOC, nested_blocks: rest });
    expect(r.errors.some((e) => e.code === 'BL-004')).toBe(true);
  });

  it('BL-004: rejects empty blocks array', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, blocks: [] },
    });
    expect(r.errors.some((e) => e.code === 'BL-004')).toBe(true);
  });

  it('BL-005: rejects block missing id', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ name: 'Anonymous' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-005' && /id/.test(e.message))).toBe(true);
  });

  it('BL-005: rejects block missing name', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'X', name: '' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-005' && /name/.test(e.message))).toBe(true);
  });

  it('BL-005: rejects an id with whitespace (not a valid free label)', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'bad id', name: 'X' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-005' && /whitespace/.test(e.message))).toBe(true);
  });

  it('BL-006: rejects a canonical-shaped id whose TYPE is not registered', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'XYZ-SOMETHING-1', name: 'X' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-006')).toBe(true);
  });

  it('BL-006: accepts canonical ids with registered TYPE (APPLICATION-OMS-1)', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'APPLICATION-OMS-1', name: 'OMS' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-006')).toBe(false);
  });

  it('BL-006: accepts the CAPABILITY V/H exception (CAPABILITY-V1.2)', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'CAPABILITY-V1.2', name: 'Order intake' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-006')).toBe(false);
  });

  it('BL-006: matches the current IDS_AND_REFERENCES.md §3.1 registry exactly (+ VERIFICATION, §3.7) — fails on drift', () => {
    // Hardcoded against the spec, not re-derived from the module under test —
    // if methodology adds/retires a TYPE and this file isn't updated to match,
    // this assertion is what catches it (see validate.ts's own doc comment).
    expect(REGISTERED_ELEMENT_TYPES).toEqual(
      new Set([
        'DRIVER',
        'FACTOR',
        'GOAL',
        'CHANGE',
        'ACTION',
        'ACTIVITY',
        'CAPABILITY',
        'PROCESS',
        'STEP',
        'PRODUCT',
        'APPLICATION',
        'INTEGRATION',
        'ROLE',
        'ACTOR',
        'LOCATION',
        'BUSINESS_SERVICE',
        'SCENARIO',
        'EQUIPMENT',
        'NODE',
        'TECHNOLOGY_SERVICE',
        'BUSINESS_OBJECT',
        'RULE',
        'REGISTRY',
        'CONSTRAINT',
        'REQUIREMENT',
        'STAKEHOLDER',
        'ASSESSMENT',
        'HAZARD',
        'RISK_CONTROL',
        'TARGET_STATE',
        'REL',
        'MILESTONE',
        'VERIFICATION',
      ]),
    );
  });

  it('BL-006: accepts the newly-covered ISO 14971 chain TYPEs (HAZARD, RISK_CONTROL, REQUIREMENT, VERIFICATION)', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [
          { id: 'HAZARD-BATTERY-1', name: 'Battery overheat' },
          { id: 'RISK_CONTROL-FUSE-1', name: 'Thermal fuse' },
          { id: 'REQUIREMENT-IEC-1', name: 'IEC 60601 clause 4' },
          { id: 'VERIFICATION-BENCH-1', name: 'Bench test protocol' },
        ],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-006')).toBe(false);
  });

  it('BL-006: rejects TYPE prefixes retired/removed from canon (UNIT, EMPLOYEE, ISSUE) and STAGE (never canonical)', () => {
    for (const id of ['UNIT-HR-1', 'EMPLOYEE-HR-1', 'ISSUE-BUG-1', 'STAGE-PHASE-1']) {
      const r = validateNestedBlocks({
        ...VALID_DOC,
        nested_blocks: {
          ...VALID_DOC.nested_blocks,
          blocks: [{ id, name: 'X' }],
        },
      });
      expect(r.errors.some((e) => e.code === 'BL-006')).toBe(true);
    }
  });

  it('BL-006: accepts free-form local labels (APPLICATION_LAYER, frontend, my-thing)', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [
          { id: 'APPLICATION_LAYER', name: 'AL' },
          { id: 'my-thing', name: 'MT' },
          { id: 'FRONTEND', name: 'FE' },
        ],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-006')).toBe(false);
  });

  it('BL-007: rejects duplicate ids anywhere in the tree', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [
          {
            id: 'A',
            name: 'A',
            children: [{ id: 'A', name: 'A again' }],
          },
        ],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-007' && /Duplicate/.test(e.message))).toBe(true);
  });

  it('BL-008: warns when nesting exceeds depth 5', () => {
    // 6-deep chain: blocks[0] (depth 1) → c → c → c → c → c (depth 6)
    let inner: Record<string, unknown> = { id: 'L6', name: 'L6' };
    for (const id of ['L5', 'L4', 'L3', 'L2', 'L1']) {
      inner = { id, name: id, children: [inner] };
    }
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, blocks: [inner] },
    });
    expect(r.warnings.some((w) => w.code === 'BL-008')).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('BL-008: does not warn at exactly depth 5', () => {
    let inner: Record<string, unknown> = { id: 'L5', name: 'L5' };
    for (const id of ['L4', 'L3', 'L2', 'L1']) {
      inner = { id, name: id, children: [inner] };
    }
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: { ...VALID_DOC.nested_blocks, blocks: [inner] },
    });
    expect(r.warnings.some((w) => w.code === 'BL-008')).toBe(false);
  });

  it('BL-009: warns on an empty children array', () => {
    const r = validateNestedBlocks({
      ...VALID_DOC,
      nested_blocks: {
        ...VALID_DOC.nested_blocks,
        blocks: [{ id: 'A', name: 'A', children: [] }],
      },
    });
    expect(r.warnings.some((w) => w.code === 'BL-009')).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('happy path: surfaces no warnings on a clean document', () => {
    const r = validateNestedBlocks(VALID_DOC);
    expect(r.valid).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

const VALID_GRID_DOC = {
  notation: 'blocks',
  spec_version: '0.1',
  grid: {
    columns: [
      { id: 'role_a', name: 'Role A' },
      { id: 'role_b', name: 'Role B' },
    ],
    rows: [
      { id: 'activity_1', name: 'Activity 1', assign: { role_a: 'A', role_b: 'R' } },
      { id: 'activity_2', name: 'Activity 2', assign: { role_b: 'A' } },
    ],
  },
};

describe('validateGrid', () => {
  it('passes on a valid grid document', () => {
    const r = validateGrid(VALID_GRID_DOC);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('BL-020: rejects missing grid root key', () => {
    const r = validateGrid({ notation: 'blocks' });
    expect(r.errors.some((e) => e.code === 'BL-020')).toBe(true);
  });

  it('BL-021: rejects missing/empty columns', () => {
    const r = validateGrid({ ...VALID_GRID_DOC, grid: { ...VALID_GRID_DOC.grid, columns: [] } });
    expect(r.errors.some((e) => e.code === 'BL-021')).toBe(true);
  });

  it('BL-022: rejects missing/empty rows', () => {
    const r = validateGrid({ ...VALID_GRID_DOC, grid: { ...VALID_GRID_DOC.grid, rows: [] } });
    expect(r.errors.some((e) => e.code === 'BL-022')).toBe(true);
  });

  it('BL-023: rejects a column entry missing id or name', () => {
    const r = validateGrid({
      ...VALID_GRID_DOC,
      grid: { ...VALID_GRID_DOC.grid, columns: [{ id: 'role_a', name: 'Role A' }, { id: '', name: 'Role B' }] },
    });
    expect(r.errors.some((e) => e.code === 'BL-023')).toBe(true);
  });

  it('BL-024: rejects duplicate column ids', () => {
    const r = validateGrid({
      ...VALID_GRID_DOC,
      grid: {
        ...VALID_GRID_DOC.grid,
        columns: [{ id: 'role_a', name: 'Role A' }, { id: 'role_a', name: 'Role A again' }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-024')).toBe(true);
  });

  it('BL-024: rejects duplicate row ids, but allows a column and row to share an id', () => {
    const dupeRows = validateGrid({
      ...VALID_GRID_DOC,
      grid: {
        ...VALID_GRID_DOC.grid,
        rows: [
          { id: 'activity_1', name: 'Activity 1' },
          { id: 'activity_1', name: 'Activity 1 again' },
        ],
      },
    });
    expect(dupeRows.errors.some((e) => e.code === 'BL-024')).toBe(true);

    const sharedNamespace = validateGrid({
      ...VALID_GRID_DOC,
      grid: {
        columns: [{ id: 'shared', name: 'Role A' }],
        rows: [{ id: 'shared', name: 'Activity 1', assign: { shared: 'A' } }],
      },
    });
    expect(sharedNamespace.errors).toHaveLength(0);
  });

  it('BL-025: rejects an assign key referencing an unknown column', () => {
    const r = validateGrid({
      ...VALID_GRID_DOC,
      grid: {
        ...VALID_GRID_DOC.grid,
        rows: [{ id: 'activity_1', name: 'Activity 1', assign: { nonexistent_col: 'A' } }],
      },
    });
    expect(r.errors.some((e) => e.code === 'BL-025')).toBe(true);
  });

  it('tolerates an omitted assign key (blank cell) and an all-blank row', () => {
    const r = validateGrid({
      ...VALID_GRID_DOC,
      grid: { ...VALID_GRID_DOC.grid, rows: [{ id: 'activity_1', name: 'Activity 1' }] },
    });
    expect(r.valid).toBe(true);
  });
});

describe('validateGrid with RACI template rules', () => {
  it('passes when every row has exactly one "A"', () => {
    const r = validateGrid(VALID_GRID_DOC, { rules: RACI_GRID_RULES });
    expect(r.valid).toBe(true);
  });

  it('RACI-001: rejects a row with zero "A" assignments', () => {
    const r = validateGrid(
      {
        ...VALID_GRID_DOC,
        grid: {
          ...VALID_GRID_DOC.grid,
          rows: [{ id: 'activity_1', name: 'Activity 1', assign: { role_a: 'R', role_b: 'R' } }],
        },
      },
      { rules: RACI_GRID_RULES },
    );
    expect(r.errors.some((e) => e.code === 'RACI-001')).toBe(true);
  });

  it('RACI-001: rejects a row with two "A" assignments', () => {
    const r = validateGrid(
      {
        ...VALID_GRID_DOC,
        grid: {
          ...VALID_GRID_DOC.grid,
          rows: [{ id: 'activity_1', name: 'Activity 1', assign: { role_a: 'A', role_b: 'A' } }],
        },
      },
      { rules: RACI_GRID_RULES },
    );
    expect(r.errors.some((e) => e.code === 'RACI-001')).toBe(true);
  });
});

describe('validateBlocks (root-form dispatcher)', () => {
  it('dispatches nested_blocks documents to validateNestedBlocks', () => {
    const r = validateBlocks(VALID_DOC);
    expect(r.valid).toBe(true);
  });

  it('dispatches grid documents to validateGrid', () => {
    const r = validateBlocks(VALID_GRID_DOC);
    expect(r.valid).toBe(true);
  });

  it('BL-020: rejects a document with neither nested_blocks nor grid', () => {
    const r = validateBlocks({ notation: 'blocks' });
    expect(r.errors.some((e) => e.code === 'BL-020')).toBe(true);
  });

  it('BL-020: rejects a document with both nested_blocks and grid', () => {
    const r = validateBlocks({ ...VALID_DOC, grid: VALID_GRID_DOC.grid });
    expect(r.errors.some((e) => e.code === 'BL-020')).toBe(true);
  });

  it('passes template rules through to the grid form', () => {
    const r = validateBlocks(VALID_GRID_DOC, { rules: RACI_GRID_RULES });
    expect(r.valid).toBe(true);
  });
});

describe('blocks examples (regression)', () => {
  const files = fs.existsSync(EXAMPLES_DIR)
    ? fs.readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith('.yaml'))
    : [];
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates tests/fixtures/notation-corpus/blocks/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateNestedBlocks(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
