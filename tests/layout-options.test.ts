import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LAYOUT_DIAGRAM_OPTIONS,
  mergeLayoutDiagramOptions,
  parseLayoutDiagramOptionsFromJson,
} from '../src/layout-options.js';

describe('layout-options', () => {
  it('defaults are returned when merging empty partial', () => {
    expect(mergeLayoutDiagramOptions({})).toEqual(DEFAULT_LAYOUT_DIAGRAM_OPTIONS);
  });

  it('clamps negatives to zero', () => {
    expect(mergeLayoutDiagramOptions({ laneVerticalGap: -5 }).laneVerticalGap).toBe(0);
  });

  it('NaN yields default for property', () => {
    expect(mergeLayoutDiagramOptions({ poolPad: Number.NaN }).poolPad).toBe(DEFAULT_LAYOUT_DIAGRAM_OPTIONS.poolPad);
  });

  it('parses numeric strings from JSON payload', () => {
    expect(parseLayoutDiagramOptionsFromJson({ elkNodeSpacing: '64', bad: null }).elkNodeSpacing).toBe(64);
  });
});
