import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import { DEFAULT_LAYOUT_DIAGRAM_OPTIONS } from '../src/layout-options.js';
import {
  BPMN_PRESENTATION_FRAME_PX,
  BPMN_PRESENTATION_MIN_LABEL_PX,
  layoutOptionsForProfile,
  parseBpmnExportProfile,
} from '../src/bpmn-export-profile.js';
import { exportBpmnVisual } from '../src/bpmn-visual-export.js';
import { rasterizeBpmnSvgToPng } from '../src/bpmn-png.js';
import { minEffectiveLabelPx, svgCssWidth } from '../src/bpmn-svg-metrics.js';
import { DEFAULT_BPMN_TYPOGRAPHY } from '@transitrix/diagrams/webview/render-process.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ERASURE = join(
  ROOT,
  'organizations/acme_corp/views/bpmn/data-subject-erasure.bpmn.transitrix.yaml',
);

describe('BPMN export profiles', () => {
  it('parses the two named profiles and rejects anything else', () => {
    expect(parseBpmnExportProfile(undefined)).toBe('default');
    expect(parseBpmnExportProfile('default')).toBe('default');
    expect(parseBpmnExportProfile('presentation')).toBe('presentation');
    expect(parseBpmnExportProfile('slides')).toBeUndefined();
  });

  it('does not change the default layout knobs used by interactive preview', () => {
    expect(layoutOptionsForProfile('default')).toEqual(DEFAULT_LAYOUT_DIAGRAM_OPTIONS);
    expect(DEFAULT_LAYOUT_DIAGRAM_OPTIONS.elkLayerSpacing).toBe(88);
    expect(DEFAULT_BPMN_TYPOGRAPHY.taskFontPx).toBe(11);
    expect(DEFAULT_BPMN_TYPOGRAPHY.labelFontPx).toBe(10);
    expect(layoutOptionsForProfile('presentation').elkLayerSpacing).toBeLessThan(
      DEFAULT_LAYOUT_DIAGRAM_OPTIONS.elkLayerSpacing,
    );
  });
});

describe('presentation BPMN export — data-subject-erasure', () => {
  const yaml = readFileSync(ERASURE, 'utf8');

  it('fits the 1780 px frame with a 20 px effective label floor, unlike default', async () => {
    const def = await exportBpmnVisual(yaml, 'default');
    const pres = await exportBpmnVisual(yaml, 'presentation');

    expect(def.svg).not.toEqual(pres.svg);
    expect(minEffectiveLabelPx(def.svg)).toBeLessThan(BPMN_PRESENTATION_MIN_LABEL_PX);
    expect(svgCssWidth(pres.svg)).toBeLessThanOrEqual(BPMN_PRESENTATION_FRAME_PX);
    expect(minEffectiveLabelPx(pres.svg)).toBeGreaterThanOrEqual(BPMN_PRESENTATION_MIN_LABEL_PX);
    expect(pres.svg).toContain('font-size: 20px');
    expect(def.svg).toContain('font-size: 11px');
  }, 30_000);

  it('rasterizes a PNG whose CSS width matches the SVG and stays within the frame', async () => {
    const { svg } = await exportBpmnVisual(yaml, 'presentation');
    const png = rasterizeBpmnSvgToPng(svg);
    const decoded = PNG.sync.read(png);
    expect(decoded.width).toBeLessThanOrEqual(BPMN_PRESENTATION_FRAME_PX);
    expect(decoded.width).toBe(Math.round(svgCssWidth(svg)));
    expect(decoded.height).toBeGreaterThan(0);
  }, 30_000);
});
