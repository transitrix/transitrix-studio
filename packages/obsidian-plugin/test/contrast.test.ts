import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SVG_DISPLAY_SETTINGS } from '../src/goals-display-settings.js';
import { NOTATION_HANDLERS } from '../src/notations/registry.js';
import { paintSvgBlockResult } from '../src/paint-result.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const fixtures = ['T01-goals', 'T02-dgca', 'T03-dga', 'T04-action', 'T05-action-card', 'T06-blocks', 'T07-process-blueprint'];
const sources = fixtures.flatMap((name) => {
  const md = readFileSync(path.join(dir, '../acceptance/notes/valid', `${name}.md`), 'utf8');
  return [...md.matchAll(/^```(\S+)\n([\s\S]*?)^```/gm)].map((m) => ({ language: m[1]!, source: m[2]! }));
});

// Inspect the image document actually handed to Obsidian, including transparent
// Blueprint cells. The shared renderers remain transparent for other consumers.
describe('Obsidian image canvas contrast', () => {
  for (const theme of ['transitrix', 'transitrix-dark', 'obsidian'] as const) {
    for (const darkHost of [false, true]) {
      it(`${theme} on a ${darkHost ? 'dark' : 'light'} host gives all eight diagrams their own canvas`, async () => {
        document.body.classList.toggle('theme-dark', darkHost);
        try {
          for (const { language, source } of sources) {
            const handler = NOTATION_HANDLERS.find((h) => h.language === language)!;
            const host = document.createElement('div');
            const view = handler.createView(host);
            try {
              await view.update(source, { ...DEFAULT_SVG_DISPLAY_SETTINGS, theme });
              const img = host.querySelector('img');
              expect(img, language).not.toBeNull();
              const svg = decodeURIComponent(img!.src.split(',')[1]!);
              // Inspect the encoded image as text; never reinterpret DOM-derived
              // strings as markup, even in the fixture regression test.
              expect(svg, language).toMatch(/^<svg style="background:var\(--ts-bg\)"/);
              const dark = theme === 'transitrix-dark' || (theme === 'obsidian' && darkHost);
              // The canvas resolves against the image's own embedded palette,
              // including when it deliberately differs from the host theme.
              expect(svg, language).toContain(`--ts-bg:${dark ? '#0a1628' : '#ffffff'}`);
              expect(svg, language).toContain(`--ts-text:${dark ? '#f1f5f9' : '#0f172a'}`);
              expect(host.querySelector('svg')).toBeNull();
            } finally { view.destroy(); }
          }
        } finally { document.body.classList.remove('theme-dark'); }
      });
    }
  }
});

describe('diagnostic title contrast', () => {
  it('keeps error and empty titles off the saturated error background for both block classes', () => {
    const style = document.createElement('style');
    // jsdom does not resolve custom properties; substitute the observed light
    // host palette before testing the real stylesheet cascade.
    style.textContent = readFileSync(path.join(dir, '../styles.css'), 'utf8')
      .replaceAll('var(--text-error)', '#e93147')
      .replaceAll('var(--background-secondary)', '#f6f6f6')
      .replaceAll('var(--background-modifier-error)', '#e93147');
    document.head.appendChild(style);
    try {
      for (const cssBlockClass of ['transitrix-goals-block', 'transitrix-svg-block']) {
        for (const empty of [false, true]) {
          const host = document.createElement('div');
          document.body.appendChild(host);
          try {
            paintSvgBlockResult(host, empty
              ? { ok: true, svg: '', warnings: [] }
              : { ok: false, errors: [{ code: 'YAML_PARSE', message: 'Invalid YAML' }], warnings: [] },
            { cssBlockClass, imageAlt: 'test' });
            const panel = host.firstElementChild!;
            expect(panel.getAttribute('role')).toBe('alert');
            expect(panel.firstElementChild?.textContent).toBe(empty ? 'Diagram is empty' : 'Could not render diagram');
            const css = getComputedStyle(panel);
            expect(css.backgroundColor).toBe('rgb(246, 246, 246)');
            expect(css.color).toBe('rgb(233, 49, 71)');
            expect(getComputedStyle(panel.firstElementChild!).color).toBe(css.color);
            expect(css.backgroundColor).not.toBe(css.color);
            expect(css.borderTopColor).toBe('rgb(233, 49, 71)');
          } finally { host.remove(); }
        }
      }
    } finally { style.remove(); }
  });
});
