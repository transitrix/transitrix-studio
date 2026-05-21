import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { validateProcessBlueprint } from '../validate.js';

const EXAMPLES_DIR = path.resolve(process.cwd(), '..', '..', 'examples', 'process-blueprint');

const VALID_BLUEPRINT = {
  notation: 'process-blueprint',
  spec_version: '0.1',
  process_blueprint: {
    id: 'PROCESS_BLUEPRINT-FULFIL-1',
    name: 'Order fulfilment blueprint',
    stages: [
      { id: 'STAGE-1', name: 'Receive', goal: 'Capture order', result: 'Validated order' },
      { id: 'STAGE-2', name: 'Pack', goal: 'Assemble', result: 'Packed shipment' },
      { id: 'STAGE-3', name: 'Ship', goal: 'Hand to carrier', result: 'In transit' },
    ],
    systems: [
      { id: 'APPLICATION-OMS-1', name: 'OMS', stages: ['STAGE-1', 'STAGE-2', 'STAGE-3'] },
    ],
    actors: [
      { id: 'ROLE-WAREHOUSE-1', name: 'Warehouse op', stages: ['STAGE-2', 'STAGE-3'] },
    ],
    equipment: [
      { name: 'Barcode scanner', stages: ['STAGE-2', 'STAGE-3'] },
    ],
    information_entities: [
      { name: 'Customer order', stages: ['STAGE-1', 'STAGE-2', 'STAGE-3'] },
    ],
  },
};

describe('validateProcessBlueprint', () => {
  it('passes on a valid blueprint', () => {
    const r = validateProcessBlueprint(VALID_BLUEPRINT);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('BP-001: rejects non-object input', () => {
    expect(validateProcessBlueprint(null).valid).toBe(false);
    expect(validateProcessBlueprint(null).errors[0].code).toBe('BP-001');
    expect(validateProcessBlueprint('string').errors[0].code).toBe('BP-001');
  });

  it('BP-001: rejects missing process_blueprint root key', () => {
    const r = validateProcessBlueprint({ notation: 'process-blueprint' });
    expect(r.errors.some(e => e.code === 'BP-001')).toBe(true);
  });

  it('BP-001: rejects wrong notation value', () => {
    const r = validateProcessBlueprint({ ...VALID_BLUEPRINT, notation: 'goals' });
    expect(r.errors.some(e => e.code === 'BP-001')).toBe(true);
  });

  it('BP-001: tolerates a missing notation field (header check is contract-level)', () => {
    const { notation: _, ...rest } = VALID_BLUEPRINT;
    const r = validateProcessBlueprint(rest);
    expect(r.errors.some(e => e.code === 'BP-001')).toBe(false);
  });

  it('BP-002: rejects missing id', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: { ...VALID_BLUEPRINT.process_blueprint, id: '' },
    });
    expect(r.errors.some(e => e.code === 'BP-002')).toBe(true);
  });

  it('BP-002: rejects id that does not match PROCESS_BLUEPRINT grammar', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: { ...VALID_BLUEPRINT.process_blueprint, id: 'PB-1' },
    });
    expect(r.errors.some(e => e.code === 'BP-002')).toBe(true);
  });

  it('BP-003: rejects missing name', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: { ...VALID_BLUEPRINT.process_blueprint, name: '' },
    });
    expect(r.errors.some(e => e.code === 'BP-003')).toBe(true);
  });

  it('BP-004: rejects missing stages', () => {
    const { stages: _, ...rest } = VALID_BLUEPRINT.process_blueprint;
    const r = validateProcessBlueprint({ ...VALID_BLUEPRINT, process_blueprint: rest });
    expect(r.errors.some(e => e.code === 'BP-004')).toBe(true);
  });

  it('BP-004: rejects empty stages array', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: { ...VALID_BLUEPRINT.process_blueprint, stages: [] },
    });
    expect(r.errors.some(e => e.code === 'BP-004')).toBe(true);
  });

  it('BP-005: rejects stage missing goal', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [{ id: 'STAGE-1', name: 'X', goal: '', result: 'R' }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-005' && /goal/.test(e.message))).toBe(true);
  });

  it('BP-005: rejects stage missing result', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [{ id: 'STAGE-1', name: 'X', goal: 'G', result: '' }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-005' && /result/.test(e.message))).toBe(true);
  });

  it('BP-006: rejects duplicate stage ids', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'G', result: 'R' },
          { id: 'STAGE-1', name: 'B', goal: 'G', result: 'R' },
        ],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-006' && /Duplicate/.test(e.message))).toBe(true);
  });

  it('BP-006: treats ids that differ only in surrounding whitespace as duplicates', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'G', result: 'R' },
          { id: 'STAGE-1 ', name: 'B', goal: 'G', result: 'R' },
        ],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-006' && /Duplicate/.test(e.message))).toBe(true);
  });

  it('BP-008: tolerates whitespace around aspect stage refs (matches trimmed stage ids)', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [{ id: 'STAGE-1', name: 'A', goal: 'G', result: 'R' }],
        systems: [{ id: 'APPLICATION-X-1', name: 'X', stages: [' STAGE-1 '] }],
        actors: undefined,
        equipment: undefined,
        information_entities: undefined,
      },
    });
    expect(r.errors.some(e => e.code === 'BP-008')).toBe(false);
  });

  it('BP-006: rejects stage id that does not match STAGE grammar', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [{ id: 'STG-1', name: 'A', goal: 'G', result: 'R' }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-006')).toBe(true);
  });

  it('BP-007: rejects aspect entry missing name', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ name: '', stages: ['STAGE-1'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-007' && /name/.test(e.message))).toBe(true);
  });

  it('BP-007: rejects aspect entry with empty stages array', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ name: 'X', stages: [] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-007' && /stages/.test(e.message))).toBe(true);
  });

  it('BP-008: rejects aspect entry referencing undeclared stage', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ name: 'X', stages: ['STAGE-1', 'STAGE-999'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-008')).toBe(true);
  });

  it('BP-009: rejects aspect entry id that does not match canonical grammar', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        equipment: [{ id: 'lowercase-1', name: 'X', stages: ['STAGE-1'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-009')).toBe(true);
  });

  it('BP-009: accepts an id for equipment as long as it matches general grammar', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        equipment: [{ id: 'EQUIPMENT-SCANNER-1', name: 'Barcode scanner', stages: ['STAGE-2'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-009')).toBe(false);
    expect(r.errors.some(e => e.code === 'BP-010')).toBe(false);
  });

  it('BP-010: rejects systems entry id without APPLICATION- prefix', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ id: 'SERVICE-OMS-1', name: 'OMS', stages: ['STAGE-1'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-010')).toBe(true);
  });

  it('BP-010: rejects actors entry id without ROLE- prefix', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        actors: [{ id: 'PERSON-1', name: 'X', stages: ['STAGE-1'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-010')).toBe(true);
  });

  it('BP-010: accepts free-form aspect entries without id', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ name: 'Legacy app', stages: ['STAGE-1'] }],
      },
    });
    expect(r.errors.some(e => e.code === 'BP-009')).toBe(false);
    expect(r.errors.some(e => e.code === 'BP-010')).toBe(false);
  });

  it('BP-011: warns when a stage has no aspect entries pointing at it', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'G', result: 'R' },
          { id: 'STAGE-99', name: 'Orphan', goal: 'G', result: 'R' },
        ],
        systems: [{ id: 'APPLICATION-OMS-1', name: 'OMS', stages: ['STAGE-1'] }],
        actors: undefined,
        equipment: undefined,
        information_entities: undefined,
      },
    });
    expect(r.warnings.some(w => w.code === 'BP-011' && /STAGE-99/.test(w.message))).toBe(true);
    expect(r.valid).toBe(true);
  });

  it('BP-012: warns when an aspect entry references a single stage', () => {
    const r = validateProcessBlueprint({
      ...VALID_BLUEPRINT,
      process_blueprint: {
        ...VALID_BLUEPRINT.process_blueprint,
        systems: [{ id: 'APPLICATION-OMS-1', name: 'OMS', stages: ['STAGE-1'] }],
      },
    });
    expect(r.warnings.some(w => w.code === 'BP-012')).toBe(true);
  });

  it('happy path: surfaces no warnings on a well-formed multi-stage blueprint', () => {
    const r = validateProcessBlueprint(VALID_BLUEPRINT);
    expect(r.valid).toBe(true);
    expect(r.warnings).toHaveLength(0);
  });
});

describe('process-blueprint examples (regression)', () => {
  const files = fs.readdirSync(EXAMPLES_DIR).filter(f => f.endsWith('.yaml'));
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    it(`validates examples/process-blueprint/${file}`, () => {
      const text = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
      const parsed = yaml.load(text);
      const r = validateProcessBlueprint(parsed);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });
  }
});
