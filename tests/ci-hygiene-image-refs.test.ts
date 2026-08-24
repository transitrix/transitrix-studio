import { describe, expect, it } from 'vitest';

import { findRelativeImageRefs } from '../scripts/image-ref-patterns.mjs';

// Fixed sample strings only — never a real scanned line.
describe('packaged image reference pattern', () => {
  it('flags a seeded relative-path image reference', () => {
    const seeded = '![preview](extension/docs/listing.gif)';
    expect(findRelativeImageRefs(seeded)).toEqual([{ line: 1, ref: 'extension/docs/listing.gif' }]);
  });

  it('passes an absolute raw.githubusercontent.com URL', () => {
    const clean =
      '![preview](https://raw.githubusercontent.com/transitrix/transitrix-studio/main/extension/docs/listing.gif)';
    expect(findRelativeImageRefs(clean)).toEqual([]);
  });

  it('leaves prose with no image reference alone', () => {
    expect(findRelativeImageRefs('just some prose, no image here')).toEqual([]);
  });

  it('reports the 1-indexed line of each hit', () => {
    const seeded = 'line one\n![preview](docs/preview.png)\nline three';
    expect(findRelativeImageRefs(seeded)).toEqual([{ line: 2, ref: 'docs/preview.png' }]);
  });
});
