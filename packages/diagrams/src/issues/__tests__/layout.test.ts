import { describe, it, expect } from 'vitest';
import { layoutIssues } from '../layout.js';
import type { Issue, IssuesFile } from '../types.js';

function build(issues: Issue[]): IssuesFile {
  return {
    notation: 'issues',
    issues_catalogue: {
      id: 'ISSUES-CAT-1',
      name: 'Test',
      updated_at: '2026-05-25',
      issues,
    },
  };
}

describe('layoutIssues', () => {
  it('lays out one row per issue', () => {
    const layout = layoutIssues(build([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open' },
      { issue_id: 'ISSUE-2', name: 'B', status: 'open' },
    ]));
    expect(layout.rows).toHaveLength(2);
  });

  it('indents sub-issues by nesting depth', () => {
    const layout = layoutIssues(build([
      { issue_id: 'ISSUE-1', name: 'Root', status: 'open' },
      { issue_id: 'ISSUE-2', name: 'Child', status: 'open', parent: 'ISSUE-1' },
      { issue_id: 'ISSUE-3', name: 'Grandchild', status: 'open', parent: 'ISSUE-2' },
    ]));
    const byId = new Map(layout.rows.map((r) => [r.issue_id, r]));
    expect(byId.get('ISSUE-1')!.depth).toBe(0);
    expect(byId.get('ISSUE-2')!.depth).toBe(1);
    expect(byId.get('ISSUE-3')!.depth).toBe(2);
    expect(byId.get('ISSUE-2')!.x).toBeGreaterThan(byId.get('ISSUE-1')!.x);
  });

  it('renders pre-order: a child row follows its parent', () => {
    const layout = layoutIssues(build([
      { issue_id: 'ISSUE-1', name: 'Root', status: 'open' },
      { issue_id: 'ISSUE-2', name: 'Child', status: 'open', parent: 'ISSUE-1' },
    ]));
    expect(layout.rows[0].issue_id).toBe('ISSUE-1');
    expect(layout.rows[1].issue_id).toBe('ISSUE-2');
    expect(layout.rows[0].hasChildren).toBe(true);
    expect(layout.rows[1].hasChildren).toBe(false);
  });

  it('places a broken-parent issue at the root', () => {
    const layout = layoutIssues(build([
      { issue_id: 'ISSUE-1', name: 'Orphan', status: 'open', parent: 'ISSUE-99' },
    ]));
    expect(layout.rows[0].depth).toBe(0);
  });

  it('does not stack-overflow or drop nodes on a parent cycle', () => {
    const layout = layoutIssues(build([
      { issue_id: 'ISSUE-1', name: 'A', status: 'open', parent: 'ISSUE-2' },
      { issue_id: 'ISSUE-2', name: 'B', status: 'open', parent: 'ISSUE-1' },
    ]));
    expect(layout.rows).toHaveLength(2);
  });

  it('returns empty bounds for an empty register', () => {
    const layout = layoutIssues(build([]));
    expect(layout.rows).toHaveLength(0);
    expect(layout.bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});
