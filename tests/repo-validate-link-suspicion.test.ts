import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { afterEach, describe, it, expect } from 'vitest';

import { runLinkSuspicionCheck, loadRepoModel } from '../src/repo-validate.js';

// Link suspicion (CONTRACT.md §16) is anchored on git history, so these
// fixtures are real (throwaway) git repos, not plain tmpdirs — each test
// inits one, commits a REQUIREMENT + a REL pointing at it (or a
// self-referential agreement-lapse case), edits the REQUIREMENT's statement
// in a second commit, and checks the finding fires only when the statement
// itself (not just formatting, and not a declared-mechanical edit) changed
// since the record last looked at it.

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
  const dir = mkdtempSync(join(tmpdir(), 'tx-link-suspicion-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

function commitAll(dir: string, message: string): void {
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
}

const REQUIREMENT_PATH = 'canon/elements/01_motivation/requirements/REQUIREMENT-DATA-ERASURE-1.yaml';

function requirementYaml(description: string, extra = ''): string {
  return [
    'notation: requirement',
    'id: REQUIREMENT-DATA-ERASURE-1',
    'name: "Personal-data erasure"',
    `description: "${description}"`,
    extra,
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

const STABLE_REQUIREMENT_PATH = 'canon/elements/01_motivation/requirements/REQUIREMENT-STABLE-1.yaml';
const STABLE_REQUIREMENT_YAML = [
  'notation: requirement',
  'id: REQUIREMENT-STABLE-1',
  'name: "Stable requirement"',
  'description: "never edited by these tests"',
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

const REL_PATH = 'canon/relations/REL-DEP-1.yaml';
// `to` points at a requirement these tests never edit, so each test's
// assertions are unambiguous about which single endpoint (`from`) fired.
const RELATION_YAML = [
  'notation: relation',
  'id: REL-DEP-1',
  'type: depends_on',
  'from: REQUIREMENT-DATA-ERASURE-1',
  'to: REQUIREMENT-STABLE-1',
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

describe('runLinkSuspicionCheck (CONTRACT.md §16)', () => {
  it('is clean when nothing has changed since the record last looked at its target', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request'));
    write(root, STABLE_REQUIREMENT_PATH, STABLE_REQUIREMENT_YAML);
    write(root, REL_PATH, RELATION_YAML);
    commitAll(root, 'admit requirement + relation');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toEqual([]);
  });

  it('flags a relation whose target statement changed after the relation last looked at it', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request'));
    write(root, STABLE_REQUIREMENT_PATH, STABLE_REQUIREMENT_YAML);
    write(root, REL_PATH, RELATION_YAML);
    commitAll(root, 'admit requirement + relation');

    write(root, REQUIREMENT_PATH, requirementYaml('erase within 30 days of request')); // statement rewrite
    commitAll(root, 'rewrite requirement statement');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: REL_PATH, ruleId: 'LINK-SUSPECT-001', severity: 'warning' });
    expect(findings[0].message).toMatch(/REQUIREMENT-DATA-ERASURE-1/);
  });

  it('does not flag a target edit that only touches envelope fields (admitted_by, gate_checks, …)', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request'));
    write(root, STABLE_REQUIREMENT_PATH, STABLE_REQUIREMENT_YAML);
    write(root, REL_PATH, RELATION_YAML);
    commitAll(root, 'admit requirement + relation');

    write(root, REQUIREMENT_PATH, requirementYaml('erase on request').replace('v.korobeinikov', 'a.reviewer'));
    commitAll(root, 'reassign admitted_by');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toEqual([]);
  });

  it('does not flag a change explained by a declared mechanical migration (§16.3 hatch)', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request', 'owner_role: ROLE-OLD-1'));
    write(root, STABLE_REQUIREMENT_PATH, STABLE_REQUIREMENT_YAML);
    write(root, REL_PATH, RELATION_YAML);
    commitAll(root, 'admit requirement + relation');

    write(root, REQUIREMENT_PATH, requirementYaml('erase on request', 'owner_role: ROLE-NEW-1'));
    write(
      root,
      'migrations/role-rename/TRANSFORM.yaml',
      [
        'mechanical: true',
        'applies_to:',
        `  - ${REQUIREMENT_PATH}`,
        'line_edits:',
        '  - from: "owner_role: ROLE-OLD-1"',
        '    to: "owner_role: ROLE-NEW-1"',
        '',
      ].join('\n'),
    );
    commitAll(root, 'mechanical: rename ROLE-OLD-1 to ROLE-NEW-1');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toEqual([]);
  });

  it('flags agreement lapse — a REQUIREMENT agreed then edited without re-confirming', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request', 'agreement: agreed\nagreed_by: "v.korobeinikov"'));
    commitAll(root, 'admit + agree requirement');

    write(root, REQUIREMENT_PATH, requirementYaml('erase within 30 days', 'agreement: agreed\nagreed_by: "v.korobeinikov"'));
    commitAll(root, 'rewrite statement after agreement');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      file: REQUIREMENT_PATH,
      ruleId: 'AGREEMENT-LAPSE-001',
      severity: 'warning',
    });
  });

  it('does not flag agreement lapse when the statement is unchanged since agreement was set', () => {
    root = initRepo();
    write(root, REQUIREMENT_PATH, requirementYaml('erase on request'));
    commitAll(root, 'admit requirement (draft)');

    write(root, REQUIREMENT_PATH, requirementYaml('erase on request', 'agreement: agreed\nagreed_by: "v.korobeinikov"'));
    commitAll(root, 'agree requirement');

    const findings = runLinkSuspicionCheck(root, loadRepoModel(root));
    expect(findings).toEqual([]);
  });
});
