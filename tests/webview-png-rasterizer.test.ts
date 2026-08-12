import { describe, it, expect } from 'vitest';
import { extractSvgDimensions } from '../extension/src/webview-png-rasterizer.js';

describe('extractSvgDimensions', () => {
  it('reads explicit width/height attributes', () => {
    expect(extractSvgDimensions('<svg width="320.5" height="140">')).toEqual({
      width: 320.5,
      height: 140,
    });
  });

  it('falls back to viewBox when width/height are absent', () => {
    expect(extractSvgDimensions('<svg viewBox="0 0 400 250">')).toEqual({
      width: 400,
      height: 250,
    });
  });

  it('prefers explicit width/height over viewBox when both are present', () => {
    expect(extractSvgDimensions('<svg width="100" height="50" viewBox="0 0 400 250">')).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('falls back to a default size when neither is present', () => {
    expect(extractSvgDimensions('<svg>')).toEqual({ width: 800, height: 600 });
  });

  it('handles a negative viewBox origin', () => {
    expect(extractSvgDimensions('<svg viewBox="-10 -5 300 200">')).toEqual({
      width: 300,
      height: 200,
    });
  });
});
