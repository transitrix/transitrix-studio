import { describe, it, expect } from 'vitest';
import {
  collectProcessColumnRecords,
  collectStepHomeProcess,
  columnIndexesForRealisedVia,
  isProcessColumnId,
  isStageColumnId,
  resolveColumnDisplay,
} from '../resolve-columns.js';

describe('column id predicates', () => {
  it('accepts PROCESS- and STAGE- grammar', () => {
    expect(isProcessColumnId('PROCESS-FULFIL-RECEIVE-1')).toBe(true);
    expect(isProcessColumnId('PROCESS-1')).toBe(true);
    expect(isStageColumnId('STAGE-1')).toBe(true);
    expect(isStageColumnId('STAGE-RECV-1')).toBe(true);
  });

  it('rejects sketch-like STAGE-A and non-column ids', () => {
    expect(isStageColumnId('STAGE-A')).toBe(false);
    expect(isProcessColumnId('STAGE-1')).toBe(false);
    expect(isStageColumnId('PROCESS-1')).toBe(false);
  });
});

describe('collectProcessColumnRecords', () => {
  it('indexes notation: process documents by id', () => {
    const map = collectProcessColumnRecords([
      { notation: 'process', id: 'PROCESS-RECEIVE-1', name: 'Receive', goal: 'g', result: 'r' },
      { notation: 'relation', id: 'REL-1', type: 'process_parent', from: 'A', to: 'B' },
      { notation: 'process', id: 'PROCESS-1' }, // no name — skipped
    ]);
    expect([...map.keys()]).toEqual(['PROCESS-RECEIVE-1']);
    expect(map.get('PROCESS-RECEIVE-1')).toEqual({ name: 'Receive', goal: 'g', result: 'r' });
  });
});

describe('collectStepHomeProcess', () => {
  it('maps inline flow steps and promoted STEP elements', () => {
    const map = collectStepHomeProcess([
      {
        notation: 'process',
        id: 'PROCESS-RECEIVE-1',
        flow: { steps: [{ id: 'STEP-RECV-1', type: 'task' }, { id: 'STEP-RECV-2' }] },
      },
      { notation: 'step', id: 'STEP-SHIP-1', process: 'PROCESS-SHIP-1' },
    ]);
    expect(map.get('STEP-RECV-1')).toBe('PROCESS-RECEIVE-1');
    expect(map.get('STEP-RECV-2')).toBe('PROCESS-RECEIVE-1');
    expect(map.get('STEP-SHIP-1')).toBe('PROCESS-SHIP-1');
  });
});

describe('resolveColumnDisplay', () => {
  it('uses catalogue fields for PROCESS- columns and ignores restated view copy', () => {
    const catalog = new Map([
      ['PROCESS-RECEIVE-1', { name: 'Receive order', goal: 'Capture', result: 'Record' }],
    ]);
    const d = resolveColumnDisplay(
      { id: 'PROCESS-RECEIVE-1', name: 'restated', goal: 'no', result: 'no' },
      catalog,
    );
    expect(d).toEqual({ name: 'Receive order', goal: 'Capture', result: 'Record' });
  });

  it('falls back to the process id when the catalogue has no record', () => {
    const d = resolveColumnDisplay({ id: 'PROCESS-RECEIVE-1' });
    expect(d).toEqual({ name: 'PROCESS-RECEIVE-1', goal: '', result: '' });
  });

  it('keeps authored STAGE- name/goal/result', () => {
    const d = resolveColumnDisplay({ id: 'STAGE-1', name: 'Receive', goal: 'g', result: 'r' });
    expect(d).toEqual({ name: 'Receive', goal: 'g', result: 'r' });
  });
});

describe('columnIndexesForRealisedVia', () => {
  const idx = new Map([
    ['PROCESS-RECEIVE-1', 0],
    ['PROCESS-SHIP-1', 1],
    ['STAGE-1', 2],
  ]);

  it('pins a PROCESS- column by process id', () => {
    expect(columnIndexesForRealisedVia('PROCESS-RECEIVE-1', idx)).toEqual([0]);
  });

  it('never pins a STAGE- token', () => {
    expect(columnIndexesForRealisedVia('STAGE-1', idx)).toEqual([]);
  });

  it('pins a PROCESS- column from a STEP whose home is that process', () => {
    const home = new Map([['STEP-RECV-1', 'PROCESS-RECEIVE-1']]);
    expect(columnIndexesForRealisedVia('STEP-RECV-1', idx, home)).toEqual([0]);
  });
});
