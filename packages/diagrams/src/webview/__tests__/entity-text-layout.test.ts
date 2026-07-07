import { describe, expect, it } from 'vitest';
import {
  layoutCenteredEntityText,
  maxCharsForInnerWidth,
  wrapWords,
  wrapTextLines,
} from '../entity-text-layout.js';

describe('entity-text-layout', () => {
  it('wrapWords respects max lines and truncates with ellipsis', () => {
    const long = 'one two three four five six seven eight nine ten eleven twelve';
    const lines = wrapWords(long, 12, 2);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines[lines.length - 1]).toMatch(/…$/);
  });

  it('maxCharsForInnerWidth scales with inner width', () => {
    expect(maxCharsForInnerWidth(160, 7)).toBeGreaterThan(maxCharsForInnerWidth(120, 7));
  });

  it('layoutCenteredEntityText emits more name capacity on wide boxes', () => {
    const narrow = layoutCenteredEntityText({
      boxX: 0,
      boxY: 0,
      boxWidth: 200,
      boxHeight: 72,
      name: 'Improve customer onboarding experience across regions',
      id: 'GOAL-001',
      nameMaxLines: 2,
      idMaxLines: 1,
    });
    const wide = layoutCenteredEntityText({
      boxX: 0,
      boxY: 0,
      boxWidth: 320,
      boxHeight: 72,
      name: 'Improve customer onboarding experience across regions',
      id: 'GOAL-001',
      nameMaxLines: 2,
      idMaxLines: 1,
    });
    const narrowPrimary = narrow.filter((l) => l.cls === 'text-primary').map((l) => l.text).join(' ');
    const widePrimary = wide.filter((l) => l.cls === 'text-primary').map((l) => l.text).join(' ');
    expect(widePrimary.replace(/…/g, '').length).toBeGreaterThanOrEqual(narrowPrimary.replace(/…/g, '').length);
  });

  it('wrapTextLines hard-breaks oversized tokens (blueprint cells)', () => {
    const lines = wrapTextLines('supercalifragilisticexpialidocious word', 10, 3);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 10)).toBe(true);
  });
});
