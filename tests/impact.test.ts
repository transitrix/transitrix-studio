import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { afterEach, describe, it, expect, vi } from 'vitest';

import { computeStagedImpact, stagedCanonElementIds, reportImpact } from '../src/impact.js';

// A staged canon/elements/** change is only meaningful against a real git
// index (git diff --cached), so — same pattern as
// tests/repo-validate-link-suspicion.test.ts — these fixtures are real
// (throwaway) git repos, not plain tmpdirs.

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function write(base: string, rel: string, body: string): void {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tx-impact-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

function commitAll(dir: string, message: string): void {
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
}

/** A DGCA canon-projection view (`view_config`, no inline factors/goals/…) —
 *  one of the three notations `computeStagedImpact` can resolve. `goals:
 *  filter: all` means every GOAL element in the store is in scope. */
const DGCA_VIEW = [
  'notation: dgca',
  'id: DGCA-STRAT-1',
  'name: "Strategy chain"',
  'view_config:',
  '  goals:',
  '    filter: all',
  '  factors:',
  '    surface: derived',
  '  changes:',
  '    surface: derived',
  '  activities:',
  '    surface: derived',
  '',
].join('\n');

function goalYaml(id: string, name: string): string {
  return `notation: goal\nid: ${id}\nname: "${name}"\n`;
}

function requirementYaml(id: string, description: string): string {
  return [
    'notation: requirement',
    `id: ${id}`,
    `description: "${description}"`,
    'zone: canon',
    'admitted_at: "2026-08-04"',
    'admitted_by: "v.korobeinikov"',
    'gate_checks:',
    '  uniqueness: pass',
    '  consistency: pass',
    '  completeness: pass',
    'valid_from: "2026-08-04"',
    'valid_to: null',
    '',
  ].join('\n');
}

function seedBaseline(dir: string): void {
  write(dir, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue'));
  write(dir, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Original wording'));
  write(dir, 'canon/views/strategy/dgca.dgca.transitrix.yaml', DGCA_VIEW);
  commitAll(dir, 'seed baseline');
}

describe('stagedCanonElementIds (transitrix-hq#89)', () => {
  it('is empty for a repo with nothing staged', () => {
    root = initRepo();
    seedBaseline(root);
    expect(stagedCanonElementIds(root)).toEqual(new Set());
  });

  it('reads the staged (index) content of a modified element, not the working tree', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);
    expect(stagedCanonElementIds(root)).toEqual(new Set(['GOAL-1']));
  });

  it('reads the ids of an id-bearing file staged for deletion from HEAD, not the (missing) index', () => {
    root = initRepo();
    seedBaseline(root);
    git(['rm', '-q', 'canon/elements/goals/GOAL-1.yaml'], root);
    expect(stagedCanonElementIds(root)).toEqual(new Set(['GOAL-1']));
  });

  it('ignores an unstaged working-tree edit', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Edited but never staged'));
    expect(stagedCanonElementIds(root)).toEqual(new Set());
  });
});

describe('computeStagedImpact (transitrix-hq#89)', () => {
  it('names the view that reads a staged, changed element', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.changedIds).toEqual(['GOAL-1']);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
    ]);
  });

  it('produces no notice at all for a change nothing reads (acceptance: second case)', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.changedIds).toEqual(['REQ-1']);
    expect(result.affected).toEqual([]);
    expect(result.notDetermined).toEqual([]);
  });

  it('is silent (no console output) when nothing is staged', () => {
    root = initRepo();
    seedBaseline(root);
    const result = computeStagedImpact(root);
    expect(result).toEqual({ changedIds: [], affected: [], notDetermined: [] });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportImpact(result, false);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('reports an unresolvable view as coverage-not-determined, never as unaffected', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/portfolio/apps.applications.transitrix.yaml',
      'notation: applications\nid: APP-1\nname: "Portfolio"\napplications: []\n',
    );
    commitAll(root, 'add an unresolvable view');
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
    ]);
    expect(result.notDetermined).toEqual([
      { file: 'canon/views/portfolio/apps.applications.transitrix.yaml', notation: 'applications' },
    ]);
  });
});
