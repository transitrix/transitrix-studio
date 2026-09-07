import { describe, expect, it } from 'vitest';

import type { FGCADoc } from '../../fgca/validate.js';
import { renderFgcaSvg } from '../render-fgca.js';

const DOC_WITH_VIRTUAL_CHANGE: FGCADoc = {
  notation: 'dgca',
  factors: [{ id: 1, name: 'D1' }],
  goals: [{ id: 10, name: 'G1', factor: [{ id: 1 }] }],
  changes: [],
  activities: [{ id: 'ACTION-SHIP-1', name: 'Ship it', goal_id: 10 }],
};

describe('renderFgcaSvg', () => {
  it('renders a virtual Change without an Action id', () => {
    const svg = renderFgcaSvg(DOC_WITH_VIRTUAL_CHANGE);
    expect(svg).toContain('class="diagram-node layer-virtual"');
    expect(svg).not.toContain('activity_ACTION-SHIP-1');
    expect(svg).not.toContain('activity_');
    expect(svg).toContain('ACTION-SHIP-1');
    expect(svg).toContain('<title>–</title>');
  });

  it('still prints a real Change id', () => {
    const svg = renderFgcaSvg({
      ...DOC_WITH_VIRTUAL_CHANGE,
      changes: [{ id: 'CHANGE-SHIP-1', name: 'Stand up shipping', goal_id: 10, activity_ids: ['ACTION-SHIP-1'] }],
    });
    expect(svg).not.toContain('class="diagram-node layer-virtual"');
    expect(svg).toContain('CHANGE-SHIP-1');
    expect(svg).toContain('Stand up shipping');
  });
});
