// Conformance test for the shipped REQUIREMENT worked examples — the
// acme_corp canon files mirrored under `tests/fixtures/notation-corpus/requirement/`. Pins the
// success signal of vkgeorgia/strategy#84 Phase 1: the library consumes the
// canonical example files without error.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateRequirement } from '../validate.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus/requirement');
const load = (f: string): unknown => yaml.load(readFileSync(path.join(dir, f), 'utf-8'));

describe('requirement worked examples (acme_corp)', () => {
  for (const f of ['REQUIREMENT-DATA-ERASURE-1.yaml', 'REQUIREMENT-AUDIT-LOG-RETENTION-1.yaml']) {
    it(`validates ${f} without error`, () => {
      const v = validateRequirement(load(f));
      expect(v.valid, JSON.stringify(v.errors)).toBe(true);
      expect(v.errors).toHaveLength(0);
    });
  }
});
