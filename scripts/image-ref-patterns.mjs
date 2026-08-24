#!/usr/bin/env node
// Shared pattern for the packaged-image-reference hygiene guard
// (scripts/ci-hygiene-image-refs.mjs). Extracted to its own module so the
// self-test (tests/ci-hygiene-image-refs.test.ts) exercises the exact logic
// the guard runs in CI, not a hand-copied approximation of it.

const IMAGE_REF = /!\[[^\]]*\]\(([^)]+)\)/g;

/** @returns {{line: number, ref: string}[]} relative-path image references in `text` */
export function findRelativeImageRefs(text) {
  const hits = [];
  const lines = String(text ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(IMAGE_REF)) {
      const ref = m[1].trim();
      if (!/^https?:\/\//i.test(ref)) {
        hits.push({ line: i + 1, ref });
      }
    }
  }
  return hits;
}
