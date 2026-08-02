import { describe, expect, it } from 'vitest';

import { HASHREF, WORKITEM } from '../scripts/hygiene-patterns.mjs';

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
