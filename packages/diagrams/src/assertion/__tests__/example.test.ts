// Conformance test for the shipped ASSERTION worked examples — the acme_corp
// canon files mirrored under `examples/assertion/`. Pins the success signal of
// vkgeorgia/strategy#84 Phase 1: the library consumes the canonical example
// files without error.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateAssertion } from '../validate.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../examples/assertion');
const load = (f: string): unknown => yaml.load(readFileSync(path.join(dir, f), 'utf-8'));

// Fixed reference date so the ASSERT-008 staleness check is deterministic; all
// three examples have a future review date relative to it.
const today = '2026-06-02';

describe('assertion worked examples (acme_corp)', () => {
  for (const f of [
    'ASSERTION-MOBILE-DATA-ERASURE-1.yaml',
    'ASSERTION-CRM-DATA-ERASURE-1.yaml',
    'ASSERTION-ONBOARD-DATA-ERASURE-1.yaml',
  ]) {
    it(`validates ${f} without error`, () => {
      const v = validateAssertion(load(f), { today });
      expect(v.valid, JSON.stringify(v.errors)).toBe(true);
      expect(v.errors).toHaveLength(0);
    });
  }

  it('does not raise ASSERT-007 for the under_review assertion with empty evidence', () => {
    const v = validateAssertion(load('ASSERTION-CRM-DATA-ERASURE-1.yaml'), { today });
    expect(v.warnings.map(w => w.code)).not.toContain('ASSERT-007');
  });
});
