import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { compileBlocksSvg } from '../ui/src/compile-blocks.js';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/notation-corpus/blocks/${name}.blocks.transitrix.yaml`, import.meta.url), 'utf8');
}

describe('browser Blocks compilation', () => {
  it('renders the native nested-blocks sample as SVG', () => {
    const svg = compileBlocksSvg(fixture('architecture'));
    expect(svg).toContain('<svg');
    expect(svg).toContain('Application Layer');
    expect(svg).toContain('Frontend');
  });

  it('renders nested blocks when the optional grid root is null', () => {
    const svg = compileBlocksSvg(fixture('architecture') + '\ngrid: null\n');
    expect(svg).toContain('Application Layer');
  });

  it('renders a native grid as SVG', () => {
    const svg = compileBlocksSvg(fixture('raci'));
    expect(svg).toContain('<svg');
    expect(svg).toContain('Product Manager');
    expect(svg).toContain('Define release scope');
  });

  it.each(['null', '[]', 'plain text', 'nested_blocks: {}', 'grid: {}'])('rejects invalid Blocks input %s', source => {
    expect(() => compileBlocksSvg(source)).toThrow(/BL-/);
  });

  it('rejects malformed YAML', () => {
    expect(() => compileBlocksSvg('nested_blocks: [')).toThrow();
  });

  it('escapes labels before inserting the rendered SVG into the page', () => {
    const svg = compileBlocksSvg(fixture('architecture').replace('Frontend', '<script>alert(1)</script>'));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
