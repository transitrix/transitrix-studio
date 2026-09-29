import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyListing } from './verify-extension-packaging.mjs';

const version = '3.8.1';
const manifest = {
  version,
  description: 'Diagrams plus release-scoped requirement traceability.',
};
const inventory = `
Transitrix: Traceability Matrix
Transitrix: Requirements by Release
broken references
no accepted source
no verification definition
no applicable result
failed verification
no effective release assignment`;
const readme = `# Transitrix Studio

## Goals and DGCA in VS Code

These historical screenshots were captured on September 26, 2026, in VS Code 1.139.1 with Transitrix Studio ${version}. The capture version is separate from the current extension version shown in the listing and installed package.

## Release-scoped requirement reports
${inventory}`;
const changelog = `# Changelog

## ${version} — 2026-09-29
${inventory}`;

test('packaged listing exposes the released requirement reports', () => {
  assert.doesNotThrow(() => verifyListing(readme, manifest, undefined, undefined, changelog));
});

test('packaged listing rejects a missing requirement-report feature list', () => {
  assert.throws(
    () => verifyListing(readme.replace('no effective release assignment', ''), manifest, undefined, undefined, changelog),
    /Packaged feature list omits: no effective release/,
  );
});

test('packaged listing rejects a stale changelog inventory', () => {
  assert.throws(
    () => verifyListing(readme, manifest, undefined, undefined, changelog.replace('failed verification', '')),
    /Packaged changelog omits: failed verification/,
  );
});

test('packaged description names requirement traceability', () => {
  assert.throws(
    () => verifyListing(readme, { ...manifest, description: 'Diagrams as text.' }, undefined, undefined, changelog),
    /Packaged description omits requirement traceability/,
  );
});
