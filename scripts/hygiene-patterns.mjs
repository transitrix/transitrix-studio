#!/usr/bin/env node
// Shared regex patterns for the work-item-reference hygiene guard
// (scripts/ci-hygiene-hashrefs.mjs). Extracted to their own module so the
// self-test (tests/ci-hygiene-hashrefs.test.ts) exercises the exact patterns
// the guard runs in CI, not a hand-copied approximation of them.
//
// Two forms leak a work-item reference:
//   - the neutral HUB-<number> form
//   - a hash-number dressed as task / epic / hub / issue work, punctuated
//     (a qualifier followed by a hash-number) or, discriminated by the
//     literal qualifier "hub", unpunctuated (hub + task/epic/issue + number)
// A bare hash-number alone, and the closes/fixes auto-close keywords, are
// this repository's own issue/PR references and stay untouched.

// Bare hash-number form (punctuated and unpunctuated) — forbidden on every
// surface, including PR title/body, where the neutral HUB-<number> form is
// otherwise allowed.
export const HASHREF = /\b(?:task|epic|hub|issue)s?[\s:]+#\d+|\bhub\s+(?:task|epic|issue)s?\s+#?\d+/gi;

// HASHREF plus the neutral HUB-<number> form — forbidden in committed content
// (diff + full tree).
export const WORKITEM = /\bHUB-\d+|\b(?:task|epic|hub|issue)s?[\s:]+#\d+|\bhub\s+(?:task|epic|issue)s?\s+#?\d+/gi;

// Parses `git log --format=%H%x1f%B%x1e <range>` output into per-commit
// records. A commit message is text a diff pass never sees — the delimiters
// (unit/record separators) survive arbitrary commit-message content that a
// plain newline split would not.
export function parseCommitLog(raw) {
  return String(raw ?? '')
    .split('\x1e')
    .map((entry) => entry.replace(/^\n/, '').trim())
    .filter(Boolean)
    .map((entry) => {
      const sep = entry.indexOf('\x1f');
      return { sha: entry.slice(0, sep), body: entry.slice(sep + 1) };
    });
}
