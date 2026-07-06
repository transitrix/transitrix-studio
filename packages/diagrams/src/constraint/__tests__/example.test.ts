import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { validateConstraint } from '../validate.js';

const dir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../tests/fixtures/notation-corpus/constraint',
);

describe('constraint worked example (notation-corpus)', () => {
  it('validates CONSTRAINT-GDPR-RESIDENCY-1.yaml without error', () => {
    const data = yaml.load(readFileSync(path.join(dir, 'CONSTRAINT-GDPR-RESIDENCY-1.yaml'), 'utf-8'));
    const v = validateConstraint(data);
    expect(v.valid, JSON.stringify(v.errors)).toBe(true);
  });
});
