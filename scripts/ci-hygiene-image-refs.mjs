#!/usr/bin/env node
// Public-surface hygiene — packaged image references must be absolute.
//
// vsce rewrites a relative image path in a packaged README and drops the
// `extension/` prefix (the 1.4.3 regression, CHANGELOG.md) — every consuming
// surface (GitHub, Open VSX, the Marketplace) then renders a broken-image
// pictogram instead of the demonstration. The only path that survives
// packaging unmodified is an absolute raw.githubusercontent.com URL, so any
// relative image reference on a consuming surface is a defect, not a style
// choice.

import { readFileSync } from 'node:fs';

import { findRelativeImageRefs } from './image-ref-patterns.mjs';

const SURFACES = ['extension/README.md', 'README.md'];

const problems = [];
for (const file of SURFACES) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // surface doesn't exist yet
  }
  for (const hit of findRelativeImageRefs(text)) {
    problems.push(`${file}:${hit.line} — ${hit.ref}`);
  }
}

if (problems.length === 0) {
  console.log(`[hygiene-image-refs] clean — ${SURFACES.length} consuming surface(s) scanned.`);
  process.exit(0);
}

console.error('[hygiene-image-refs] a consuming README references a packaged image by a relative path.');
console.error('[hygiene-image-refs] vsce rewrites a relative path and drops the extension/ prefix — use the absolute raw.githubusercontent.com URL instead.');
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
