import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { layoutProcessBlueprint } from '../layout.js';
import { collectProcessColumnRecords } from '../resolve-columns.js';
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

  describe('visibleAspects', () => {
    const FILE_WITH_ALL = build({
      stages: [{ id: 'STAGE-1', name: 'A', goal: 'g', result: 'r' }],
      systems: [{ name: 'OMS', stages: ['STAGE-1'] }],
      actors: [{ name: 'Ops', stages: ['STAGE-1'] }],
      equipment: [{ name: 'Printer', stages: ['STAGE-1'] }],
    });

    it('shows all categories when visibleAspects is not set', () => {
      const layout = layoutProcessBlueprint(FILE_WITH_ALL);
      expect(layout.aspectRows.map(r => r.category)).toEqual(
        expect.arrayContaining(['systems', 'actors', 'equipment']),
      );
      expect(layout.aspectRows).toHaveLength(3);
    });

    it('limits rows to those in visibleAspects', () => {
      const layout = layoutProcessBlueprint(FILE_WITH_ALL, {
        visibleAspects: ['systems'],
      });
      expect(layout.aspectRows).toHaveLength(1);
      expect(layout.aspectRows[0].category).toBe('systems');
    });

    it('suppresses all aspect rows when visibleAspects is empty', () => {
      const layout = layoutProcessBlueprint(FILE_WITH_ALL, { visibleAspects: [] });
      expect(layout.aspectRows).toHaveLength(0);
    });

    it('preserves the canonical ASPECT_CATEGORIES order within the filtered set', () => {
      const layout = layoutProcessBlueprint(FILE_WITH_ALL, {
        visibleAspects: ['equipment', 'systems'],
      });
      expect(layout.aspectRows.map(r => r.category)).toEqual(['systems', 'equipment']);
    });

    it('ignores categories in visibleAspects that have no data', () => {
      const layout = layoutProcessBlueprint(FILE_WITH_ALL, {
        visibleAspects: ['systems', 'information_entities'],
      });
      expect(layout.aspectRows).toHaveLength(1);
      expect(layout.aspectRows[0].category).toBe('systems');
    });
  });

  describe('catalogued PROCESS- columns', () => {
    const catalog = new Map([
      ['PROCESS-RECEIVE-1', { name: 'Receive order', goal: 'Capture a validated customer order.', result: 'Validated order record.' }],
      ['PROCESS-PICK-1', { name: 'Pick and pack', goal: 'Assemble the physical order.', result: 'Packed shipment.' }],
      ['PROCESS-SHIP-1', { name: 'Ship', goal: 'Hand to the carrier.', result: 'In-transit shipment.' }],
    ]);

    it('headers and goal/result come from the catalogue, not restated view fields', () => {
      const layout = layoutProcessBlueprint(
        build({
          stages: [
            { id: 'PROCESS-RECEIVE-1', name: 'ignore', goal: 'ignore', result: 'ignore' },
            { id: 'PROCESS-PICK-1' },
            { id: 'PROCESS-SHIP-1' },
          ],
        }),
        { processCatalog: catalog },
      );
      expect(layout.stageHeaders.map(h => h.name)).toEqual(['Receive order', 'Pick and pack', 'Ship']);
      expect(layout.goalCells.map(c => c.text)).toEqual([
        'Capture a validated customer order.',
        'Assemble the physical order.',
        'Hand to the carrier.',
      ]);
      expect(layout.resultCells.map(c => c.text)).toEqual([
        'Validated order record.',
        'Packed shipment.',
        'In-transit shipment.',
      ]);
    });

    it('places aspect pills by PROCESS- id in stages[] array order', () => {
      const layout = layoutProcessBlueprint(
        build({
          stages: [
            { id: 'PROCESS-RECEIVE-1' },
            { id: 'PROCESS-PICK-1' },
            { id: 'PROCESS-SHIP-1' },
          ],
          systems: [
            { name: 'OMS', stages: ['PROCESS-RECEIVE-1', 'PROCESS-PICK-1'] },
            { name: 'TMS', stages: ['PROCESS-SHIP-1'] },
          ],
        }),
        { processCatalog: catalog },
      );
      const pills = layout.aspectRows[0].pills;
      expect(pills).toHaveLength(2);
      expect(pills[0].startStageIndex).toBe(0);
      expect(pills[0].endStageIndex).toBe(1);
      expect(pills[1].startStageIndex).toBe(2);
      expect(pills[1].endStageIndex).toBe(2);
    });

    it('STAGE- only columns still take name/goal/result from the view', () => {
      const layout = layoutProcessBlueprint(
        build({
          stages: [{ id: 'STAGE-1', name: 'Receive', goal: 'g', result: 'r' }],
        }),
        { processCatalog: catalog },
      );
      expect(layout.stageHeaders[0].name).toBe('Receive');
      expect(layout.goalCells[0].text).toBe('g');
      expect(layout.resultCells[0].text).toBe('r');
    });
  });

  describe('notation-corpus fixtures', () => {
    const corpus = path.resolve(process.cwd(), '..', '..', 'tests', 'fixtures', 'notation-corpus');

    function collectYamlUnder(dir: string): unknown[] {
      const out: unknown[] = [];
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...collectYamlUnder(p));
        else if (e.name.endsWith('.yaml')) out.push(yaml.load(fs.readFileSync(p, 'utf8')));
      }
      return out;
    }

    it('STAGE-only order-fulfilment still lays out authored headers', () => {
      const file = yaml.load(
        fs.readFileSync(
          path.join(corpus, 'process-blueprint', 'order-fulfilment.process-blueprint.transitrix.yaml'),
          'utf8',
        ),
      ) as ProcessBlueprintFile;
      const layout = layoutProcessBlueprint(file);
      expect(layout.stageHeaders).toHaveLength(5);
      expect(layout.stageHeaders.map(h => h.name)).toEqual([
        'Receive order',
        'Allocate inventory',
        'Pick & pack',
        'Ship',
        'Confirm delivery & close',
      ]);
      expect(layout.aspectRows.length).toBeGreaterThan(0);
    });

    it('catalogued fulfilment-chain headers and goal/result come from PROCESS elements', () => {
      const parent = path.join(corpus, 'relations', 'process-parent');
      const file = yaml.load(
        fs.readFileSync(path.join(parent, 'fulfilment-chain.process-blueprint.transitrix.yaml'), 'utf8'),
      ) as ProcessBlueprintFile;
      const catalog = collectProcessColumnRecords(collectYamlUnder(path.join(parent, 'canon', 'elements')));
      const layout = layoutProcessBlueprint(file, { processCatalog: catalog });
      expect(layout.stageHeaders.map(h => h.name)).toEqual(['Receive order', 'Pick and pack', 'Ship']);
      expect(layout.goalCells.map(c => c.text)).toEqual([
        'Capture a validated customer order.',
        'Assemble the physical order from reserved inventory.',
        'Hand the shipment to the carrier and notify the customer.',
      ]);
      expect(layout.aspectRows[0].pills.length).toBeGreaterThan(0);
    });
  });
});
