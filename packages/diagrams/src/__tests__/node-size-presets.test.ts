import { describe, expect, it } from 'vitest';

import {
  ACTION_NODE_SIZE,
  BLOCKS_LEAF_SIZE,
  CAPABILITY_MAP_NODE_SIZE,
  DGCA_NODE_SIZE,
  ENTITY_NODE_HEIGHT,
  ENTITY_NODE_SIZE,
  ENTITY_NODE_WIDTH,
  GOALS_NODE_SIZE,
  PROCESS_BLUEPRINT_SIZE,
  resolveGoalsNodeSize,
} from '../node-size-presets.js';

describe('node-size-presets', () => {
  it('uses shared width and height tiers for entity nodes', () => {
    expect(ENTITY_NODE_WIDTH).toEqual({ compact: 200, normal: 250, wide: 320 });
    expect(ENTITY_NODE_HEIGHT).toEqual({ compact: 72, normal: 80, wide: 96 });
    expect(ENTITY_NODE_SIZE.normal).toEqual({ width: 250, height: 80 });
    expect(ENTITY_NODE_SIZE.compact).toEqual({ width: 200, height: 72 });
    expect(ENTITY_NODE_SIZE.wide).toEqual({ width: 320, height: 96 });
  });

  it('exposes the same entity sizes for every box-based notation', () => {
    for (const table of [GOALS_NODE_SIZE, DGCA_NODE_SIZE, BLOCKS_LEAF_SIZE, ACTION_NODE_SIZE]) {
      expect(table).toBe(ENTITY_NODE_SIZE);
      expect(table.normal).toEqual(ENTITY_NODE_SIZE.normal);
    }
    expect(CAPABILITY_MAP_NODE_SIZE.normal).toEqual({
      nodeWidth: ENTITY_NODE_WIDTH.normal,
      nodeHeight: ENTITY_NODE_HEIGHT.normal,
    });
  });

  it('scales wide above normal and compact below', () => {
    expect(resolveGoalsNodeSize('wide').height).toBeGreaterThan(resolveGoalsNodeSize('normal').height);
    expect(resolveGoalsNodeSize('compact').height).toBeLessThan(resolveGoalsNodeSize('normal').height);
    expect(resolveGoalsNodeSize('wide').width).toBeGreaterThan(resolveGoalsNodeSize('normal').width);
  });

  it('scales process blueprint from the same tier ratios', () => {
    expect(PROCESS_BLUEPRINT_SIZE.wide.stageColumnWidth).toBeGreaterThan(
      PROCESS_BLUEPRINT_SIZE.normal.stageColumnWidth,
    );
    expect(PROCESS_BLUEPRINT_SIZE.compact.goalRowHeight).toBeLessThan(
      PROCESS_BLUEPRINT_SIZE.normal.goalRowHeight,
    );
  });
});
