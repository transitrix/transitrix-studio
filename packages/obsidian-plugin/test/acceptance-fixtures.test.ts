import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { BlockRenderResult } from '../src/block-types.js';
import { DEFAULT_SVG_DISPLAY_SETTINGS } from '../src/goals-display-settings.js';
import { NOTATION_HANDLERS } from '../src/notations/registry.js';
import { MAX_BLOCK_BYTES } from '../src/parse-block-source.js';
import { renderSelfContainedActionBlock } from '../src/render-action-block.js';
import { renderSelfContainedActionCardBlock } from '../src/render-action-card-block.js';
import { renderSelfContainedBlocksBlock } from '../src/render-blocks-block.js';
import { renderSelfContainedFgcaBlock } from '../src/render-fgca-block.js';
import { renderSelfContainedGoalsBlock } from '../src/render-goals-block.js';
import { renderSelfContainedProcessBlueprintBlock } from '../src/render-process-blueprint-block.js';

/**
 * The manual acceptance notes (acceptance/notes) promise specific outcomes in a
 * real Obsidian. This test runs every fence through the real renderers so the
 * promised outcome cannot drift from what the plugin does.
 */

interface AcceptanceCase {
  id: string;
  title: string;
  file: string;
  fence: number;
  language: string;
  expect: 'diagram' | 'error' | 'plain';
  errorCodes?: string[];
  generated?: boolean;
}

const dir = path.dirname(fileURLToPath(import.meta.url));
const acceptanceDir = path.resolve(dir, '..', 'acceptance');
const { cases } = JSON.parse(readFileSync(path.join(acceptanceDir, 'cases.json'), 'utf8')) as {
  cases: AcceptanceCase[];
};

const RENDERERS: Record<string, (source: string) => BlockRenderResult> = {
  'transitrix-goals': (s) => renderSelfContainedGoalsBlock(s, DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-dgca': (s) => renderSelfContainedFgcaBlock(s, 'dgca', DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-dga': (s) => renderSelfContainedFgcaBlock(s, 'dga', DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-action': (s) => renderSelfContainedActionBlock(s, DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-action-card': (s) => renderSelfContainedActionCardBlock(s, DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-blocks': (s) => renderSelfContainedBlocksBlock(s, DEFAULT_SVG_DISPLAY_SETTINGS),
  'transitrix-process-blueprint': (s) =>
    renderSelfContainedProcessBlueprintBlock(s, DEFAULT_SVG_DISPLAY_SETTINGS),
};

/** Same recipe as scripts/obsidian-acceptance-kit.mjs (a YAML comment over the limit). */
function oversizeSource(): string {
  return `# ${'x'.repeat(MAX_BLOCK_BYTES)}\nnotation: goals\n`;
}

function fences(markdown: string): Array<{ language: string; source: string }> {
  return [...markdown.matchAll(/^```(\S+)\r?\n([\s\S]*?)^```/gm)].map((m) => ({
    language: m[1] as string,
    source: m[2] as string,
  }));
}

describe('manual acceptance notes', () => {
  it('registers exactly the seven documented languages', () => {
    expect(NOTATION_HANDLERS.map((h) => h.language).sort()).toEqual(Object.keys(RENDERERS).sort());
  });

  it('covers every registered notation with a valid case', () => {
    const covered = new Set(cases.filter((c) => c.expect === 'diagram').map((c) => c.language));
    for (const handler of NOTATION_HANDLERS) expect(covered.has(handler.language)).toBe(true);
  });

  for (const testCase of cases) {
    it(`${testCase.id} ${testCase.title}`, () => {
      const source = testCase.generated
        ? oversizeSource()
        : (() => {
            const found = fences(readFileSync(path.join(acceptanceDir, 'notes', testCase.file), 'utf8'))[testCase.fence];
            expect(found, `${testCase.file} fence ${testCase.fence}`).toBeDefined();
            expect(found?.language).toBe(testCase.language);
            return found?.source ?? '';
          })();

      if (testCase.expect === 'plain') {
        expect(RENDERERS[testCase.language]).toBeUndefined();
        expect(NOTATION_HANDLERS.some((h) => h.language === testCase.language)).toBe(false);
        return;
      }

      const render = RENDERERS[testCase.language];
      expect(render, `renderer for ${testCase.language}`).toBeDefined();
      const result = (render as (s: string) => BlockRenderResult)(source);

      if (testCase.expect === 'diagram') {
        expect(result.ok, result.ok ? '' : JSON.stringify(result.errors)).toBe(true);
        if (result.ok) expect(result.svg).toContain('<svg ');
      } else {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errors.length).toBeGreaterThan(0);
          if (testCase.errorCodes) {
            expect(result.errors.map((e) => e.code)).toEqual(expect.arrayContaining(testCase.errorCodes));
          }
        }
      }
    });
  }
});
