import { describe, expect, it } from 'vitest';

import type { ActivityCardDoc } from '../../activity-card/types.js';
import { renderActivityCardSvg } from '../render-activity-card.js';

const DOC: ActivityCardDoc = {
  notation: 'action-card',
  activity_card: {
    id: 'ACTION_CARD-1',
    project: 'ACTION-1',
    milestones: [{ id: 'MILESTONE-1', name: 'Kick-off', date: '2026-06-01' }],
  },
};

describe('renderActivityCardSvg — embedCssTheme', () => {
  it('embeds light theme CSS by default and dark when embedCssTheme is transitrix-dark', () => {
    const light = renderActivityCardSvg(DOC);
    const dark = renderActivityCardSvg(DOC, { embedCssTheme: 'transitrix-dark' });
    expect(light).toContain('<style>');
    expect(light).not.toContain('#0a1628');
    expect(dark).toContain('#0a1628');
  });
});
