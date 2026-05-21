import { describe, it, expect } from 'vitest';
import { layoutProcessBlueprint } from '../layout.js';
import type { ProcessBlueprintFile } from '../types.js';

function build(file: Partial<ProcessBlueprintFile['process_blueprint']>): ProcessBlueprintFile {
  return {
    notation: 'process-blueprint',
    process_blueprint: {
      id: 'PROCESS_BLUEPRINT-T-1',
      name: 'Test',
      stages: [],
      ...file,
    } as ProcessBlueprintFile['process_blueprint'],
  };
}

describe('layoutProcessBlueprint', () => {
  it('lays out stage headers in input order across the legend offset', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
          { id: 'STAGE-3', name: 'C', goal: 'g', result: 'r' },
        ],
      }),
    );
    expect(layout.stageHeaders).toHaveLength(3);
    expect(layout.stageHeaders[0].x).toBe(layout.legendColumnWidth);
    expect(layout.stageHeaders[1].x).toBe(layout.legendColumnWidth + layout.stageColumnWidth);
    expect(layout.stageHeaders[2].x).toBe(layout.legendColumnWidth + 2 * layout.stageColumnWidth);
    expect(layout.stageHeaders[0].name).toBe('A');
  });

  it('produces goal and result cells aligned under each stage column', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'gA', result: 'rA' },
          { id: 'STAGE-2', name: 'B', goal: 'gB', result: 'rB' },
        ],
      }),
    );
    expect(layout.goalCells.map(c => c.text)).toEqual(['gA', 'gB']);
    expect(layout.resultCells.map(c => c.text)).toEqual(['rA', 'rB']);
    expect(layout.goalCells[0].y).toBeLessThan(layout.resultCells[0].y);
    expect(layout.goalCells[0].x).toBe(layout.stageHeaders[0].x);
  });

  it('omits aspect rows for categories without any entries', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [{ id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' }],
      }),
    );
    expect(layout.aspectRows).toHaveLength(0);
  });

  it('merges consecutive stages into a single spanning pill', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
          { id: 'STAGE-3', name: 'C', goal: 'g', result: 'r' },
        ],
        systems: [
          { id: 'APPLICATION-OMS-1', name: 'OMS', stages: ['STAGE-1', 'STAGE-2', 'STAGE-3'] },
        ],
      }),
    );
    expect(layout.aspectRows).toHaveLength(1);
    const row = layout.aspectRows[0];
    expect(row.category).toBe('systems');
    expect(row.pills).toHaveLength(1);
    expect(row.pills[0].startStageIndex).toBe(0);
    expect(row.pills[0].endStageIndex).toBe(2);
    expect(row.pills[0].width).toBeGreaterThan(layout.stageColumnWidth);
  });

  it('splits non-consecutive stages into separate pills', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
          { id: 'STAGE-3', name: 'C', goal: 'g', result: 'r' },
          { id: 'STAGE-4', name: 'D', goal: 'g', result: 'r' },
        ],
        systems: [
          { id: 'APPLICATION-X-1', name: 'X', stages: ['STAGE-1', 'STAGE-3', 'STAGE-4'] },
        ],
      }),
    );
    const pills = layout.aspectRows[0].pills;
    expect(pills).toHaveLength(2);
    expect(pills[0].startStageIndex).toBe(0);
    expect(pills[0].endStageIndex).toBe(0);
    expect(pills[1].startStageIndex).toBe(2);
    expect(pills[1].endStageIndex).toBe(3);
  });

  it('stacks overlapping pills into vertical slots inside the same row', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
        ],
        systems: [
          { id: 'APPLICATION-A-1', name: 'A', stages: ['STAGE-1', 'STAGE-2'] },
          { id: 'APPLICATION-B-1', name: 'B', stages: ['STAGE-1'] },
        ],
      }),
    );
    const row = layout.aspectRows[0];
    expect(row.pills).toHaveLength(2);
    // The two pills overlap at STAGE-1, so they should sit at different y.
    expect(row.pills[0].y).not.toBe(row.pills[1].y);
    // Row height must be tall enough for two stacked pills.
    expect(row.height).toBeGreaterThan(row.pills[0].height);
  });

  it('preserves the fixed category order: systems, actors, equipment, information_entities', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [{ id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' }],
        information_entities: [{ name: 'Doc', stages: ['STAGE-1'] }],
        actors: [{ id: 'ROLE-X-1', name: 'X', stages: ['STAGE-1'] }],
        systems: [{ id: 'APPLICATION-X-1', name: 'X', stages: ['STAGE-1'] }],
        equipment: [{ name: 'Scanner', stages: ['STAGE-1'] }],
      }),
    );
    expect(layout.aspectRows.map(r => r.category)).toEqual([
      'systems',
      'actors',
      'equipment',
      'information_entities',
    ]);
  });

  it('builds the legend in row order: goal, result, then aspect categories', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [{ id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' }],
        systems: [{ id: 'APPLICATION-X-1', name: 'X', stages: ['STAGE-1'] }],
      }),
    );
    expect(layout.legend.map(l => l.kind)).toEqual(['goal', 'result', 'aspect']);
    expect(layout.legend[2].category).toBe('systems');
  });

  it('total bounds cover the legend column plus every stage column', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
        ],
      }),
    );
    expect(layout.bounds.width).toBe(layout.legendColumnWidth + 2 * layout.stageColumnWidth);
    expect(layout.bounds.height).toBeGreaterThan(0);
  });

  it('ignores aspect entries that reference undeclared stages', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [{ id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' }],
        systems: [
          { id: 'APPLICATION-X-1', name: 'X', stages: ['STAGE-1', 'STAGE-999'] },
        ],
      }),
    );
    const pills = layout.aspectRows[0].pills;
    expect(pills).toHaveLength(1);
    expect(pills[0].startStageIndex).toBe(0);
    expect(pills[0].endStageIndex).toBe(0);
  });

  it('honours overridden LayoutOptions', () => {
    const layout = layoutProcessBlueprint(
      build({
        stages: [
          { id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' },
          { id: 'STAGE-2', name: 'B', goal: 'g', result: 'r' },
        ],
      }),
      { legendColumnWidth: 200, stageColumnWidth: 300 },
    );
    expect(layout.legendColumnWidth).toBe(200);
    expect(layout.stageColumnWidth).toBe(300);
    expect(layout.stageHeaders[1].x).toBe(200 + 300);
  });
});
