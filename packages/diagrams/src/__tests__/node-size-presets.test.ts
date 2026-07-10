import { describe, expect, it } from 'vitest';

import {
  ACTION_NODE_SIZE,
  BLOCKS_LEAF_SIZE,
  DGCA_NODE_SIZE,
  GOALS_NODE_SIZE,
  resolveGoalsNodeSize,
} from '../node-size-presets.js';

describe('node-size-presets', () => {
  it('scales goals height with width (aspect-locked)', () => {
    expect(GOALS_NODE_SIZE.normal).toEqual({ width: 250, height: 72 });
    expect(GOALS_NODE_SIZE.compact).toEqual({ width: 200, height: 58 });
    expect(GOALS_NODE_SIZE.wide).toEqual({ width: 320, height: 92 });
    expect(resolveGoalsNodeSize('wide').height).toBeGreaterThan(resolveGoalsNodeSize('normal').height);
  });

  it('keeps box notations aspect-locked across presets', () => {
    for (const table of [DGCA_NODE_SIZE, BLOCKS_LEAF_SIZE, ACTION_NODE_SIZE]) {
      const ratio = table.normal.height / table.normal.width;
      for (const preset of ['compact', 'wide'] as const) {
        const scaled = table[preset];
        expect(scaled.height / scaled.width).toBeCloseTo(ratio, 2);
      }
    }
  });
});
