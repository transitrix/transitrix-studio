import { describe, it, expect } from 'vitest';
import { flattenCssVars } from '../extension/src/raster.js';

// resvg's usvg engine does not resolve CSS custom properties, so the PNG
// export pipeline pre-flattens `var(--x)` into literal values. These lock
// that contract — a regression here means exported PNGs render black.
describe('flattenCssVars', () => {
  it('substitutes a single custom property into a fill', () => {
    const svg = '<svg><style>:root{--c:#22aa44;}.box{fill:var(--c);}</style></svg>';
    expect(flattenCssVars(svg)).toContain('fill:#22aa44;');
    expect(flattenCssVars(svg)).not.toContain('var(--c)');
  });

  it('resolves custom properties that reference other custom properties', () => {
    const svg = '<svg><style>:root{--base:#123456;--c:var(--base);}.box{fill:var(--c);}</style></svg>';
    expect(flattenCssVars(svg)).toContain('fill:#123456;');
    expect(flattenCssVars(svg)).not.toContain('var(');
  });

  it('uses the fallback when the property is undefined', () => {
    const svg = '<svg><style>.box{fill:var(--missing, #ff0000);}</style></svg>';
    expect(flattenCssVars(svg)).toContain('fill:#ff0000;');
  });

  it('leaves an unresolvable var without fallback intact (no crash)', () => {
    const svg = '<svg><style>.box{fill:var(--nope);}</style></svg>';
    expect(flattenCssVars(svg)).toContain('var(--nope)');
  });

  it('resolves multiple distinct properties in one document', () => {
    const svg =
      '<svg><style>:root{--a:#111111;--b:#222222;}' +
      '.x{fill:var(--a);}.y{stroke:var(--b);}</style></svg>';
    const out = flattenCssVars(svg);
    expect(out).toContain('fill:#111111;');
    expect(out).toContain('stroke:#222222;');
  });

  it('is a no-op on markup with no custom properties', () => {
    const svg = '<svg><rect fill="#000" /></svg>';
    expect(flattenCssVars(svg)).toBe(svg);
  });
});
