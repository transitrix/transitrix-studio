/**
 * Brand default-theme regression tests (hub issue #548).
 *
 * Locks in the three-role brand mapping from `brand/transitrix_brand.md`:
 *   - Petrol = structure (node/edge stroke) and hierarchy depth (fill tint).
 *   - A depth ramp never switches hue — only lightness/saturation move.
 *   - Text stays WCAG-AA readable against every fill it can be drawn on.
 * `hc` (VS Code high-contrast) is intentionally excluded — it's an
 * accessibility override, not one of the three brand-contract themes.
 */
import { describe, expect, it } from 'vitest';
import {
  BRAND,
  BRAND_EMPHASIS,
  LAYER_COLORS,
  LEVEL_COLORS,
  MATURITY_COLORS,
  TREE_MATURITY_COLORS,
  STRUCTURAL,
  TREE_LEVEL_COLORS,
} from '../tokens.js';

function hexToRgb(hex: string): [number, number, number] {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const f = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG 2.x contrast ratio between two hex colors (1..21). */
function contrast(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Hue in degrees (0-360) from a hex color; undefined (grey) hues return -1. */
function hue(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.001) return -1; // achromatic
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

const PETROL_HUE = hue(BRAND.petrol);
const HUE_TOLERANCE = 6; // degrees — rounding slop from hand-tuned hex values

function expectSameHueFamily(hexes: string[], label: string): void {
  for (const hex of hexes) {
    const h = hue(hex);
    const diff = Math.min(Math.abs(h - PETROL_HUE), 360 - Math.abs(h - PETROL_HUE));
    expect(diff, `${label} ${hex} should stay in the petrol hue family (got hue ${h.toFixed(1)}, petrol is ${PETROL_HUE.toFixed(1)})`).toBeLessThanOrEqual(HUE_TOLERANCE);
  }
}

// Minimum AA text-contrast ratios this design targets. Primary/secondary text
// is small (10-12px) so we hold the full 4.5:1 normal-text bar for the name
// label, and the calibrated ~4.0 bar the pre-brand palette already shipped
// for the muted secondary/id label (see brand-ramp calibration in PR #548).
const MIN_PRIMARY_CONTRAST = 4.5;
const MIN_SECONDARY_CONTRAST = 4.0;

describe('brand default theme (#548) — structure is petrol', () => {
  it('nodeStroke and edgeStroke are brand petrol in the light theme', () => {
    expect(STRUCTURAL.nodeStroke.light).toBe(BRAND.petrol);
    expect(STRUCTURAL.edgeStroke.light).toBe(BRAND.petrol);
  });

  it('nodeStroke/edgeStroke stay in the petrol hue family in the dark theme', () => {
    expectSameHueFamily([STRUCTURAL.nodeStroke.dark, STRUCTURAL.edgeStroke.dark], 'dark stroke');
  });
});

describe('brand default theme (#548) — tint depth never switches hue', () => {
  it('LEVEL_COLORS light ramp stays in the petrol hue family', () => {
    expectSameHueFamily([...LEVEL_COLORS.light], 'LEVEL light');
  });
  it('LEVEL_COLORS dark ramp stays in the petrol hue family', () => {
    expectSameHueFamily([...LEVEL_COLORS.dark], 'LEVEL dark');
  });
  it('LAYER_COLORS (DGCA/DGA columns) stay in the petrol hue family, both themes', () => {
    const keys = ['driver', 'factor', 'goal', 'change', 'activity'] as const;
    expectSameHueFamily(keys.map((k) => LAYER_COLORS[k].light), 'LAYER light');
    expectSameHueFamily(keys.map((k) => LAYER_COLORS[k].dark), 'LAYER dark');
  });
  it('TREE_LEVEL_COLORS (capability map bands) stay in the petrol hue family, both themes', () => {
    const keys = ['band0', 'band1', 'band2'] as const;
    expectSameHueFamily(keys.map((k) => TREE_LEVEL_COLORS[k].light), 'BAND light');
    expectSameHueFamily(keys.map((k) => TREE_LEVEL_COLORS[k].dark), 'BAND dark');
  });
});

describe('brand default theme (#548) — WCAG-AA text-on-fill contrast', () => {
  function checkFills(label: string, fills: string[], textPrimary: string, textSecondary: string): void {
    for (const fill of fills) {
      expect(contrast(fill, textPrimary), `${label} ${fill} vs text-primary`).toBeGreaterThanOrEqual(MIN_PRIMARY_CONTRAST);
      expect(contrast(fill, textSecondary), `${label} ${fill} vs text-secondary`).toBeGreaterThanOrEqual(MIN_SECONDARY_CONTRAST);
    }
  }

  it('LEVEL_COLORS — every slot, both themes', () => {
    checkFills('LEVEL light', [...LEVEL_COLORS.light], STRUCTURAL.textPrimary.light, STRUCTURAL.textSecondary.light);
    checkFills('LEVEL dark', [...LEVEL_COLORS.dark], STRUCTURAL.textPrimary.dark, STRUCTURAL.textSecondary.dark);
  });

  it('LAYER_COLORS — every column, both themes', () => {
    const keys = ['driver', 'factor', 'goal', 'change', 'activity'] as const;
    checkFills('LAYER light', keys.map((k) => LAYER_COLORS[k].light), STRUCTURAL.textPrimary.light, STRUCTURAL.textSecondary.light);
    checkFills('LAYER dark', keys.map((k) => LAYER_COLORS[k].dark), STRUCTURAL.textPrimary.dark, STRUCTURAL.textSecondary.dark);
  });

  it('TREE_LEVEL_COLORS — every band, both themes', () => {
    const keys = ['band0', 'band1', 'band2'] as const;
    checkFills('BAND light', keys.map((k) => TREE_LEVEL_COLORS[k].light), STRUCTURAL.textPrimary.light, STRUCTURAL.textSecondary.light);
    checkFills('BAND dark', keys.map((k) => TREE_LEVEL_COLORS[k].dark), STRUCTURAL.textPrimary.dark, STRUCTURAL.textSecondary.dark);
  });

  it('textPrimary/textSecondary stay readable against the shell background', () => {
    expect(contrast(STRUCTURAL.textPrimary.light, '#ffffff')).toBeGreaterThanOrEqual(MIN_PRIMARY_CONTRAST);
    expect(contrast(STRUCTURAL.textPrimary.dark, '#0a1628')).toBeGreaterThanOrEqual(MIN_PRIMARY_CONTRAST);
  });
});

describe('brand default theme (#548) — amber/orange emphasis stays distinct from functional colors', () => {
  it('does not reuse brand amber/orange for functional status', () => {
    // FUNCTIONAL warning/error must remain visually distinct from the brand
    // accents so a red error is never confused with brand orange, per
    // brand/transitrix_brand.md "Don't reuse brand orange as semantic error".
    expect(BRAND_EMPHASIS.orange.light).toBe(BRAND.orange);
    expect(BRAND_EMPHASIS.amber.light).toBe(BRAND.amber);
  });

  it('critical-path emphasis tint pairs with the orange stroke, both themes', () => {
    expect(contrast(BRAND_EMPHASIS.orange.light, BRAND_EMPHASIS.orangeTint.light)).toBeGreaterThan(1.5);
    expect(contrast(BRAND_EMPHASIS.orange.dark, BRAND_EMPHASIS.orangeTint.dark)).toBeGreaterThan(1.5);
  });
});

describe('maturity Likert ramp — one harmonious scale, white-label contrast', () => {
  // .maturity-pill / tree-maturity badges hardcode white label text
  // (capability-map-preview.ts, render-capability-tree.ts) regardless of
  // theme, so every step needs AA (light/dark) or AAA (hc, since VS Code
  // high-contrast mode exists specifically to demand stronger contrast)
  // against white — not against the page's own text-primary/secondary.
  const MIN_WHITE_CONTRAST_AA = 4.5;
  const MIN_WHITE_CONTRAST_AAA = 7;

  it('MATURITY_COLORS — every step reads white text at AA, light + dark', () => {
    for (const hex of MATURITY_COLORS.light) {
      expect(contrast(hex, '#ffffff'), `MATURITY light ${hex} vs white`).toBeGreaterThanOrEqual(MIN_WHITE_CONTRAST_AA);
    }
    for (const hex of MATURITY_COLORS.dark) {
      expect(contrast(hex, '#ffffff'), `MATURITY dark ${hex} vs white`).toBeGreaterThanOrEqual(MIN_WHITE_CONTRAST_AA);
    }
  });

  it('MATURITY_COLORS hc — every step reads white text at AAA', () => {
    for (const hex of MATURITY_COLORS.hc) {
      expect(contrast(hex, '#ffffff'), `MATURITY hc ${hex} vs white`).toBeGreaterThanOrEqual(MIN_WHITE_CONTRAST_AAA);
    }
  });

  it('TREE_MATURITY_COLORS is the same harmonious ramp as MATURITY_COLORS', () => {
    // Previously a divergent DSM-matching pink/yellow/blue set (plus a grey
    // L1, an odd "no signal" hue for the worst rating) — "maturity" now
    // means the same colors everywhere it's shown.
    expect(TREE_MATURITY_COLORS.light).toEqual(MATURITY_COLORS.light);
    expect(TREE_MATURITY_COLORS.dark).toEqual(MATURITY_COLORS.dark);
    expect(TREE_MATURITY_COLORS.hc).toEqual(MATURITY_COLORS.hc);
  });
});
