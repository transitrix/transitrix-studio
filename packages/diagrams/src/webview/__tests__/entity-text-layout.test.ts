import { describe, expect, it } from 'vitest';
import {
  layoutCenteredEntityText,
  layoutLeafBlockText,
  layoutHeaderBlockText,
  LINE_H_PRIMARY,
  LINE_H_SECONDARY,
  TEXT_MARGIN_Y,
  maxCharsForInnerWidth,
  ROW_GROUP_GAP,
  wrapWords,
  wrapTextLines,
} from '../entity-text-layout.js';
import { ENTITY_NODE_SIZE } from '../../node-size-presets.js';

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

  it('layoutCenteredEntityText keeps name and type labels separated', () => {
    const specs = layoutCenteredEntityText({
      boxX: 0,
      boxY: 0,
      boxWidth: 250,
      boxHeight: 80,
      name: 'Grow enterprise value',
      type: 'Strategic',
      id: 'GOAL-VALUE-1',
      nameMaxLines: 2,
      idMaxLines: 1,
    });
    const nameY = specs.find((l) => l.cls === 'text-primary')!.y;
    const typeY = specs.find((l) => l.cls === 'text-secondary')!.y;
    const minGap = typeY - nameY - LINE_H_PRIMARY / 2 - LINE_H_SECONDARY / 2;
    expect(minGap).toBeGreaterThanOrEqual(ROW_GROUP_GAP - 1);
  });

  it('layoutCenteredEntityText emits more name capacity on wide boxes', () => {
    const narrow = layoutCenteredEntityText({
      boxX: 0,
      boxY: 0,
      boxWidth: 200,
      boxHeight: 80,
      name: 'Improve customer onboarding experience across regions',
      id: 'GOAL-001',
      nameMaxLines: 2,
      idMaxLines: 1,
    });
    const wide = layoutCenteredEntityText({
      boxX: 0,
      boxY: 0,
      boxWidth: 320,
      boxHeight: 80,
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

// Approximate half-extent (px) of each text class's glyphs around its centre
// y — font-size / 2, the same heuristic the render-blocks overlap regression
// test (#419) uses. Used below to assert text never visually crosses the box
// border, not just that the *nominal* line-height budget fits.
const HALF_EXTENT: Record<string, number> = {
  'text-primary': 6, // 12px font
  'text-secondary': 6, // 11px font, rounded up
  'text-id': 5, // 10px font
};

describe('entity text layout — never overflows the box, always keeps padding', () => {
  const PRESETS = Object.entries(ENTITY_NODE_SIZE); // compact/normal/wide
  const NAMES = [
    'Short',
    'Achieve full GDPR & NIS2 compliance',
    'A name so long it would need three or more lines to render in full without any height limit at all',
  ];

  function assertNoOverflowAndPadded(
    specs: { cls: string; y: number }[],
    boxTop: number,
    boxBottom: number,
  ): void {
    for (const s of specs) {
      const half = HALF_EXTENT[s.cls] ?? 6;
      expect(s.y - half).toBeGreaterThanOrEqual(boxTop);
      expect(s.y + half).toBeLessThanOrEqual(boxBottom);
    }
  }

  for (const [presetName, size] of PRESETS) {
    for (const withType of [false, true]) {
      for (const name of NAMES) {
        it(`layoutCenteredEntityText: ${presetName} preset, type=${withType}, name="${name.slice(0, 20)}…" stays inside the box`, () => {
          const boxY = 0;
          const specs = layoutCenteredEntityText({
            boxX: 0,
            boxY,
            boxWidth: size.width,
            boxHeight: size.height,
            name,
            type: withType ? 'Strategic Goal' : undefined,
            id: 'GOAL-EU-COMPLIANCE-1',
            nameMaxLines: 2,
            idMaxLines: 1,
          });
          assertNoOverflowAndPadded(specs, boxY, boxY + size.height);
        });
      }
    }
  }

  it('reproduces the reported case (wide preset, 2-line name + type + long id) with real padding on all sides', () => {
    const size = ENTITY_NODE_SIZE.normal;
    const boxY = 100;
    const specs = layoutCenteredEntityText({
      boxX: 0,
      boxY,
      boxWidth: size.width,
      boxHeight: size.height,
      name: 'Achieve full GDPR & NIS2 compliance',
      type: 'Project Goal',
      id: 'GOAL-EU-COMPLIANCE-1',
      nameMaxLines: 2,
      idMaxLines: 1,
    });
    const nameLines = specs.filter((s) => s.cls === 'text-primary');
    expect(nameLines.length).toBe(2); // normal preset is tall enough to keep both lines
    assertNoOverflowAndPadded(specs, boxY, boxY + size.height);
    // Explicit padding, not just "doesn't cross the border".
    const firstTop = Math.min(...specs.map((s) => s.y - (HALF_EXTENT[s.cls] ?? 6)));
    const lastBottom = Math.max(...specs.map((s) => s.y + (HALF_EXTENT[s.cls] ?? 6)));
    expect(firstTop - boxY).toBeGreaterThanOrEqual(TEXT_MARGIN_Y);
    expect(boxY + size.height - lastBottom).toBeGreaterThanOrEqual(TEXT_MARGIN_Y);
  });

  it('layoutLeafBlockText stays inside the box for compact preset with a long name and id', () => {
    const size = ENTITY_NODE_SIZE.compact;
    const boxY = 0;
    const specs = layoutLeafBlockText({
      boxX: 0,
      boxY,
      boxWidth: size.width,
      boxHeight: size.height,
      name: 'Personal data records that linger after consent withdrawal across many systems and archives',
      id: 'VERY_LONG_BLOCK_IDENTIFIER_WITH_MANY_SEGMENTS_AND_MORE',
    });
    assertNoOverflowAndPadded(specs, boxY, boxY + size.height);
  });

  it('layoutHeaderBlockText stays inside a short header strip', () => {
    const boxY = 0;
    const headerHeight = 28;
    const specs = layoutHeaderBlockText({
      boxX: 0,
      boxY,
      boxWidth: 250,
      headerHeight,
      name: 'A fairly long container name here',
      id: 'VERY_LONG_CONTAINER_IDENTIFIER',
    });
    assertNoOverflowAndPadded(specs, boxY, boxY + headerHeight);
  });
});
