import { describe, it, expect } from 'vitest';
import { layoutNestedBlocks, layoutGrid, iterateBlocks } from '../layout.js';
import type { BlocksFile, GridFile, LaidOutBlock } from '../types.js';

function findById(layout: ReturnType<typeof layoutNestedBlocks>, id: string): LaidOutBlock | undefined {
  for (const b of iterateBlocks(layout)) {
    if (b.id === id) return b;
  }
  return undefined;
}

const TWO_TOP_LEVEL: BlocksFile = {
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
          {
            id: 'FRONTEND',
            name: 'Frontend',
            children: [
              { id: 'REACT_APP', name: 'React App' },
              { id: 'REDUX_STORE', name: 'Redux Store' },
            ],
          },
          {
            id: 'BACKEND',
            name: 'Backend',
            children: [
              { id: 'REST_API', name: 'REST API' },
              { id: 'BUSINESS_LOGIC', name: 'Business Logic' },
            ],
          },
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

describe('layoutNestedBlocks', () => {
  it('lays out top-level blocks vertically starting at y=0', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);
    expect(layout.blocks).toHaveLength(2);
    expect(layout.blocks[0].y).toBe(0);
    expect(layout.blocks[1].y).toBeGreaterThan(layout.blocks[0].y + layout.blocks[0].height);
  });

  it('assigns depth=1 to top-level blocks and increases for each nesting level', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);
    const app = findById(layout, 'APPLICATION_LAYER')!;
    const frontend = findById(layout, 'FRONTEND')!;
    const react = findById(layout, 'REACT_APP')!;
    expect(app.depth).toBe(1);
    expect(frontend.depth).toBe(2);
    expect(react.depth).toBe(3);
  });

  it('records max depth on the layout', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);
    expect(layout.maxDepth).toBe(3);
  });

  it('places every child strictly inside its parent (containment property)', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);

    function checkContainment(b: LaidOutBlock): void {
      for (const c of b.children) {
        expect(c.x).toBeGreaterThanOrEqual(b.x);
        expect(c.y).toBeGreaterThanOrEqual(b.y + b.headerHeight);
        expect(c.x + c.width).toBeLessThanOrEqual(b.x + b.width);
        expect(c.y + c.height).toBeLessThanOrEqual(b.y + b.height);
        checkContainment(c);
      }
    }

    for (const top of layout.blocks) checkContainment(top);
  });

  it('siblings do not overlap', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);

    function checkSiblings(b: LaidOutBlock): void {
      for (let i = 0; i < b.children.length; i++) {
        for (let j = i + 1; j < b.children.length; j++) {
          const a = b.children[i];
          const c = b.children[j];
          const disjointX = a.x + a.width <= c.x || c.x + c.width <= a.x;
          const disjointY = a.y + a.height <= c.y || c.y + c.height <= a.y;
          expect(disjointX || disjointY).toBe(true);
        }
        checkSiblings(b.children[i]);
      }
    }

    for (const top of layout.blocks) checkSiblings(top);
  });

  it('a leaf block uses the configured leaf dimensions', () => {
    const layout = layoutNestedBlocks({
      notation: 'blocks',
      nested_blocks: {
        id: 'BLOCKS-LEAF-1',
        name: 'Leaf only',
        blocks: [{ id: 'A', name: 'A' }],
      },
    });
    const a = layout.blocks[0];
    expect(a.width).toBe(250);
    expect(a.height).toBe(80);
  });

  it('honours custom layout options', () => {
    const layout = layoutNestedBlocks(
      {
        notation: 'blocks',
        nested_blocks: {
          id: 'BLOCKS-LEAF-1',
          name: 'Leaf only',
          blocks: [{ id: 'A', name: 'A' }],
        },
      },
      { leafWidth: 200, leafHeight: 80 },
    );
    expect(layout.blocks[0].width).toBe(200);
    expect(layout.blocks[0].height).toBe(80);
  });

  it('iterateBlocks visits every block once in pre-order', () => {
    const layout = layoutNestedBlocks(TWO_TOP_LEVEL);
    const ids = Array.from(iterateBlocks(layout)).map((b) => b.id);
    expect(ids).toEqual([
      'APPLICATION_LAYER',
      'FRONTEND',
      'REACT_APP',
      'REDUX_STORE',
      'BACKEND',
      'REST_API',
      'BUSINESS_LOGIC',
      'DATA_LAYER',
      'POSTGRESQL',
      'REDIS_CACHE',
    ]);
  });

  it('handles an empty top-level array gracefully (returns zero-size bounds)', () => {
    const layout = layoutNestedBlocks({
      notation: 'blocks',
      // Schema-wise this is invalid (BL-004), but the layout function still
      // needs to be defensive — validation runs separately.
      nested_blocks: { id: 'X', name: 'X', blocks: [] },
    });
    expect(layout.blocks).toHaveLength(0);
    expect(layout.bounds.width).toBe(0);
    expect(layout.bounds.height).toBe(0);
  });
});

// Matrix subset (08-blocks.md §4a) — modelled on the real RACI template
// (methodology `templates/raci/raci.blocks.transitrix.yaml`).
const RACI_GRID: GridFile = {
  notation: 'blocks',
  spec_version: '0.1',
  grid: {
    columns: [
      { id: 'ROLE-PRODUCT', name: 'Product Owner' },
      { id: 'ROLE-LEAD-ARCH', name: 'Lead Architect' },
      { id: 'ROLE-REVIEW-BOARD', name: 'Architecture Review Board' },
    ],
    rows: [
      {
        id: 'ACT-PROPOSE',
        name: 'Propose a change',
        assign: { 'ROLE-PRODUCT': 'A', 'ROLE-LEAD-ARCH': 'C', 'ROLE-REVIEW-BOARD': 'I' },
      },
      {
        id: 'ACT-DECIDE',
        name: 'Approve / reject',
        assign: { 'ROLE-REVIEW-BOARD': 'A', 'ROLE-LEAD-ARCH': 'R' },
      },
    ],
  },
};

describe('layoutGrid', () => {
  it('positions the row-header column at x=0 and the first data column right after it', () => {
    const layout = layoutGrid(RACI_GRID);
    expect(layout.columns[0].x).toBe(layout.rowHeaderWidth);
  });

  it('positions the column-header row at y=0 and the first data row right below it', () => {
    const layout = layoutGrid(RACI_GRID);
    expect(layout.rows[0].y).toBe(layout.headerHeight);
  });

  it('lays out one cell per (row, column) pair, including blank cells', () => {
    const layout = layoutGrid(RACI_GRID);
    expect(layout.cells).toHaveLength(RACI_GRID.grid.rows.length * RACI_GRID.grid.columns.length);
    const blank = layout.cells.find((c) => c.rowId === 'ACT-DECIDE' && c.colId === 'ROLE-PRODUCT');
    expect(blank?.value).toBeUndefined();
  });

  it('carries the assign value through to the matching cell', () => {
    const layout = layoutGrid(RACI_GRID);
    const cell = layout.cells.find((c) => c.rowId === 'ACT-PROPOSE' && c.colId === 'ROLE-PRODUCT');
    expect(cell?.value).toBe('A');
  });

  it('bounds cover the full row-header + columns width and header + rows height', () => {
    const layout = layoutGrid(RACI_GRID);
    const lastCol = layout.columns[layout.columns.length - 1];
    const lastRow = layout.rows[layout.rows.length - 1];
    expect(layout.bounds.width).toBe(lastCol.x + lastCol.width);
    expect(layout.bounds.height).toBe(lastRow.y + lastRow.height);
  });

  it('honours custom layout options', () => {
    const layout = layoutGrid(RACI_GRID, { columnWidth: 100, rowHeight: 30, rowHeaderWidth: 150, headerHeight: 40 });
    expect(layout.rowHeaderWidth).toBe(150);
    expect(layout.headerHeight).toBe(40);
    expect(layout.columns[0].width).toBe(100);
    expect(layout.rows[0].height).toBe(30);
  });

  it('handles an empty grid gracefully (returns zero-size bounds)', () => {
    const layout = layoutGrid({
      notation: 'blocks',
      // Schema-wise this is invalid (BL-021/BL-022), but the layout function
      // still needs to be defensive — validation runs separately.
      grid: { columns: [], rows: [] },
    });
    expect(layout.columns).toHaveLength(0);
    expect(layout.rows).toHaveLength(0);
    expect(layout.cells).toHaveLength(0);
  });
});
