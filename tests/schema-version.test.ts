import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

import { SCHEMA_VERSION } from '../packages/diagrams/src/schema-version.js';

// SV-1: the @transitrix/diagrams SCHEMA_VERSION constant and the project
// manifest's `transitrix.methodologyVersion` must stay in lockstep — both pin the
// methodology release this build conforms to (SoT: methodology
// notations/MANIFEST.md `methodology_version`, currently 0.5.0).
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf-8')) as {
  transitrix?: { methodologyVersion?: string };
};

describe('SV-1 — schema version pinning', () => {
  it('package.json declares transitrix.methodologyVersion', () => {
    expect(pkg.transitrix?.methodologyVersion).toBeTypeOf('string');
  });

  it('SCHEMA_VERSION equals package.json transitrix.methodologyVersion', () => {
    expect(SCHEMA_VERSION).toBe(pkg.transitrix?.methodologyVersion);
  });

  it('uses a semver-shaped version string', () => {
    expect(SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
