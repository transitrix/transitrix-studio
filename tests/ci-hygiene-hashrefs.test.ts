import { describe, expect, it } from 'vitest';

import { HASHREF, WORKITEM, parseCommitLog } from '../scripts/hygiene-patterns.mjs';

// Fixed sample strings only — never a real scanned line. This file is in the
// guard's own SKIP list (scripts/ci-hygiene-hashrefs.mjs), so these fixtures
// are exempt from the very scan they exercise.
const POSITIVE = ['hub task 217', 'hub epic 391', 'HUB-905', 'issue #7'];
const NEGATIVE = ['task 3 of the pipeline', 'closes #12', 'GitHub 3'];

function matches(pattern: RegExp, text: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(text);
}

describe('hygiene work-item reference patterns', () => {
  it('flags every leaked work-item reference form', () => {
    for (const sample of POSITIVE) {
      expect(matches(WORKITEM, sample), sample).toBe(true);
    }
  });

  it('leaves ordinary prose and this-repo references alone', () => {
    for (const sample of NEGATIVE) {
      expect(matches(WORKITEM, sample), sample).toBe(false);
    }
  });

  it('allows the neutral HUB-<number> form in PR metadata but not the dressed hash form', () => {
    expect(matches(HASHREF, 'HUB-905'), 'HUB-905 via HASHREF').toBe(false);
    expect(matches(HASHREF, 'issue #7'), 'issue #7 via HASHREF').toBe(true);
    expect(matches(HASHREF, 'hub task 217'), 'hub task 217 via HASHREF').toBe(true);
  });
});

describe('parseCommitLog', () => {
  it('splits a `git log --format=%H%x1f%B%x1e` stream into per-commit records', () => {
    const raw = 'aaa111\x1fSubject line\n\nBody text\x1e\nbbb222\x1fAnother subject\x1e';
    expect(parseCommitLog(raw)).toEqual([
      { sha: 'aaa111', body: 'Subject line\n\nBody text' },
      { sha: 'bbb222', body: 'Another subject' },
    ]);
  });

  it('returns an empty list for an empty range', () => {
    expect(parseCommitLog('')).toEqual([]);
  });

  it('finds a leaked work-item reference inside a multi-line commit body', () => {
    const raw = 'ccc333\x1fSubject\n\nFirst cut of hub epic #123 (proj:example)\x1e';
    const [commit] = parseCommitLog(raw);
    expect(matches(WORKITEM, commit.body)).toBe(true);
  });
});
