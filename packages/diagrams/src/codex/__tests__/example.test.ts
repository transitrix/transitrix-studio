// Conformance test for CODEX worked examples under
// `tests/fixtures/notation-corpus/codex/` — pins #518 Phase C2 corpus signal.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateCodex, folderJurisdictionFromPath } from '../validate.js';

const corpusRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../tests/fixtures/notation-corpus/codex',
);

function codexFixturePaths(): Array<{ rel: string; folderJurisdiction?: string }> {
  const out: Array<{ rel: string; folderJurisdiction?: string }> = [];
  for (const zone of ['external/EU', 'internal']) {
    const dir = path.join(corpusRoot, zone);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yaml'))) {
      const rel = path.join('codex', zone, f).replace(/\\/g, '/');
      out.push({
        rel,
        folderJurisdiction: folderJurisdictionFromPath(rel),
      });
    }
  }
  return out;
}

describe('codex worked examples (notation-corpus)', () => {
  for (const { rel, folderJurisdiction } of codexFixturePaths()) {
    it(`validates ${rel} without error`, () => {
      const data = yaml.load(readFileSync(path.join(corpusRoot, rel.replace(/^codex\//, '')), 'utf-8'));
      const v = validateCodex(data, { folderJurisdiction });
      expect(v.valid, JSON.stringify(v.errors)).toBe(true);
      expect(v.errors).toHaveLength(0);
    });
  }
});
