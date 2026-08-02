import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { collectExistingCanonIds, parseNewArgv, scaffoldGoalElement } from '../src/scaffold.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function makeRepo(): string {
  return mkdtempSync(join(tmpdir(), 'tx-scaffold-'));
}

function writeCanonElement(root: string, relPath: string, id: string): void {
  const abs = join(root, 'canon', 'elements', relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, `notation: driver\nid: ${id}\nname: "Existing"\n`, 'utf-8');
}

// ── parseNewArgv ─────────────────────────────────────────────────────────

describe('parseNewArgv', () => {
  it('recognises the goal subtype', () => {
    expect(parseNewArgv(['goal']).type).toBe('goal');
    expect(parseNewArgv(['nonsense']).type).toBeUndefined();
  });

  it('parses --id/--name/--author both as separate and = forms', () => {
    const r = parseNewArgv(['goal', '--id', 'GOAL-X-1', '--name=Grow revenue', '--author', 'a.b']);
    expect(r.id).toBe('GOAL-X-1');
    expect(r.name).toBe('Grow revenue');
    expect(r.author).toBe('a.b');
  });

  it('parses --factors as a comma-split list', () => {
    const r = parseNewArgv(['goal', '--factors', 'DRIVER-A-1, DRIVER-B-2']);
    expect(r.factors).toEqual(['DRIVER-A-1', 'DRIVER-B-2']);
  });

  it('parses --level as a number', () => {
    expect(parseNewArgv(['goal', '--level', '2']).level).toBe(2);
  });

  it('parses --dry-run and --help', () => {
    expect(parseNewArgv(['goal', '--dry-run']).dryRun).toBe(true);
    expect(parseNewArgv(['goal', '--help']).wantsHelp).toBe(true);
  });
});

// ── scaffoldGoalElement ──────────────────────────────────────────────────

describe('scaffoldGoalElement', () => {
  it('computes the full envelope for a minimal valid goal', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-REVENUE-1',
      name: 'Grow revenue',
      admittedBy: 'v.korobeinikov',
      today: '2026-08-02',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.relPath).toBe('canon/elements/01_motivation/goals/GOAL-REVENUE-1.yaml');
    expect(outcome.content).toContain('zone: canon');
    expect(outcome.content).toContain('admitted_at: "2026-08-02"');
    expect(outcome.content).toContain('admitted_by: "v.korobeinikov"');
    expect(outcome.content).toContain('valid_from: "2026-08-02"');
    expect(outcome.content).toContain('valid_to: null');
    expect(outcome.content).toContain('uniqueness: pass');
    expect(outcome.filled).toEqual(
      expect.arrayContaining(['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to']),
    );
  });

  it('rejects an id that does not match the GOAL grammar', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'NOTAGOAL-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/GOAL-\[<middle>-]<INTEGER>/);
  });

  it('rejects a missing name', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-X-1', name: '  ', admittedBy: 'a.b', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/name is required/);
  });

  it('rejects a missing admittedBy identity', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-X-1', name: 'x', admittedBy: '', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/admitted_by identity/);
  });

  it('gate_checks.uniqueness fails when the id already exists in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-DUP-1.yaml', 'GOAL-DUP-1');
    const outcome = scaffoldGoalElement({ root, id: 'GOAL-DUP-1', name: 'x', admittedBy: 'a.b', today: '2026-08-02' });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/uniqueness/);
  });

  it('gate_checks.consistency fails when a referenced factor does not exist in canon', () => {
    const root = makeRepo();
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-X-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
      factors: ['DRIVER-MISSING-1'],
    });
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.errors.join(' ')).toMatch(/consistency.*DRIVER-MISSING-1/);
  });

  it('gate_checks.consistency passes when every referenced factor exists in canon', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/factors/DRIVER-A-1.yaml', 'DRIVER-A-1');
    const outcome = scaffoldGoalElement({
      root,
      id: 'GOAL-X-1',
      name: 'x',
      admittedBy: 'a.b',
      today: '2026-08-02',
      factors: ['DRIVER-A-1'],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.content).toContain('factors: [DRIVER-A-1]');
  });
});

describe('collectExistingCanonIds', () => {
  it('returns an empty set when canon/ does not exist', () => {
    const root = makeRepo();
    expect(collectExistingCanonIds(root).size).toBe(0);
  });

  it('collects ids from both elements/ and relations/', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-A-1.yaml', 'GOAL-A-1');
    const relAbs = join(root, 'canon', 'relations', 'REL-A-1.yaml');
    mkdirSync(dirname(relAbs), { recursive: true });
    writeFileSync(relAbs, 'notation: relation\nid: REL-A-1\ntype: goal_parent\n', 'utf-8');
    const ids = collectExistingCanonIds(root);
    expect(ids.has('GOAL-A-1')).toBe(true);
    expect(ids.has('REL-A-1')).toBe(true);
  });
});

// ── CLI integration ──────────────────────────────────────────────────────

describe('transitrix new goal (CLI)', () => {
  it('writes a complete element file and reports the filled fields', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'goal',
      '--id', 'GOAL-REVENUE-1',
      '--name', 'Grow revenue',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/wrote canon\/elements\/01_motivation\/goals\/GOAL-REVENUE-1\.yaml/);
    const written = readFileSync(
      join(root, 'canon', 'elements', '01_motivation', 'goals', 'GOAL-REVENUE-1.yaml'),
      'utf-8',
    );
    expect(written).toContain('admitted_by: "a.b"');
  });

  it('--dry-run prints the content without writing', () => {
    const root = makeRepo();
    const { status, stdout } = runCli([
      'new', 'goal',
      '--id', 'GOAL-PREVIEW-1',
      '--name', 'Preview only',
      '--author', 'a.b',
      '--root', root,
      '--dry-run',
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/Would write/);
    expect(existsSync(join(root, 'canon', 'elements', '01_motivation', 'goals', 'GOAL-PREVIEW-1.yaml'))).toBe(false);
  });

  it('exits 1 and reports gate-check failures without writing', () => {
    const root = makeRepo();
    writeCanonElement(root, '01_motivation/goals/GOAL-DUP-1.yaml', 'GOAL-DUP-1');
    const { status, stderr } = runCli([
      'new', 'goal',
      '--id', 'GOAL-DUP-1',
      '--name', 'Duplicate',
      '--author', 'a.b',
      '--root', root,
    ]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/uniqueness/);
  });

  it('exits 1 when --id/--name are missing', () => {
    const root = makeRepo();
    const { status, stderr } = runCli(['new', 'goal', '--root', root]);
    expect(status).toBe(1);
    expect(stderr).toMatch(/--id and --name are required/);
  });

  it('--help exits 0', () => {
    const { status, stderr } = runCli(['new', '--help']);
    expect(status).toBe(0);
    expect(stderr).toMatch(/transitrix new goal/);
  });
});
