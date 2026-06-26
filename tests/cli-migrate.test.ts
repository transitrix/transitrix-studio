import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { parseMigrateArgv, readMethodologyVersion, resolveChain, toMajorMinor } from '../src/migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

// Recipes are in the sibling methodology repo (dev environment only).
const recipesDir = resolve(__dirname, '../../methodology/migrations');
const fixtureBase56 = join(recipesDir, '0.5-to-0.6', 'fixtures');
const fixtureBase67 = join(recipesDir, '0.6-to-0.7', 'fixtures');
const hasRecipes = existsSync(join(recipesDir, '0.5-to-0.6', 'codemod.mjs'));
const has67Recipe = existsSync(join(recipesDir, '0.6-to-0.7', 'codemod.mjs'));

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// ── unit tests (no external deps) ─────────────────────────────────────────

describe('parseMigrateArgv', () => {
  it('parses --from and --to', () => {
    const r = parseMigrateArgv(['--from', '0.5', '--to', '0.6']);
    expect(r.from).toBe('0.5');
    expect(r.to).toBe('0.6');
  });

  it('parses --from=X.Y form', () => {
    const r = parseMigrateArgv(['--from=0.4', '--to=0.5']);
    expect(r.from).toBe('0.4');
    expect(r.to).toBe('0.5');
  });

  it('parses --dry-run', () => {
    expect(parseMigrateArgv(['--dry-run']).dryRun).toBe(true);
    expect(parseMigrateArgv([]).dryRun).toBe(false);
  });

  it('parses --recipes', () => {
    const r = parseMigrateArgv(['--recipes', '/some/path']);
    expect(r.recipesDir).toBe('/some/path');
  });

  it('treats positional as targetDir', () => {
    const r = parseMigrateArgv(['/my/repo']);
    expect(r.targetDir).toBe('/my/repo');
  });

  it('sets wantsHelp for --help / -h', () => {
    expect(parseMigrateArgv(['--help']).wantsHelp).toBe(true);
    expect(parseMigrateArgv(['-h']).wantsHelp).toBe(true);
  });
});

describe('toMajorMinor', () => {
  it('strips patch from full semver', () => {
    expect(toMajorMinor('0.5.0')).toBe('0.5');
    expect(toMajorMinor('1.2.3')).toBe('1.2');
  });

  it('leaves major.minor unchanged', () => {
    expect(toMajorMinor('0.6')).toBe('0.6');
  });
});

describe('resolveChain', () => {
  const recipes = [
    { from: '0.4', to: '0.5', dir: '/r/0.4-to-0.5' },
    { from: '0.5', to: '0.6', dir: '/r/0.5-to-0.6' },
  ];

  it('returns empty chain for same version', () => {
    expect(resolveChain('0.5', '0.5', recipes)).toEqual([]);
  });

  it('resolves a single step', () => {
    const chain = resolveChain('0.5', '0.6', recipes);
    expect(chain).toHaveLength(1);
    expect(chain![0].from).toBe('0.5');
    expect(chain![0].to).toBe('0.6');
  });

  it('resolves a multi-step chain', () => {
    const chain = resolveChain('0.4', '0.6', recipes);
    expect(chain).toHaveLength(2);
    expect(chain![0].from).toBe('0.4');
    expect(chain![1].to).toBe('0.6');
  });

  it('returns null when no path exists', () => {
    expect(resolveChain('0.6', '0.4', recipes)).toBeNull();
    expect(resolveChain('0.3', '0.6', recipes)).toBeNull();
  });
});

describe('readMethodologyVersion', () => {
  it('returns undefined when transitrix.yaml is absent', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tx-mv-test-'));
    try {
      expect(readMethodologyVersion(tmp)).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('reads methodology_version from transitrix.yaml', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tx-mv-test-'));
    try {
      writeFileSync(join(tmp, 'transitrix.yaml'), 'methodology_version: 0.5.0\n');
      expect(readMethodologyVersion(tmp)).toBe('0.5.0');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ── CLI integration tests (require methodology repo at ../methodology) ─────

// The fixture YAML files are committed with CRLF line endings on this machine.
// The codemod regexes use `$` which in JS doesn't match before `\r`, so lines
// with inline comments fail to match in CRLF mode. Normalising to LF before
// running the recipes makes the codemod behave the same as on a POSIX host.
function normalizeLf(dir: string): void {
  const walk = (d: string): string[] => {
    const r: string[] = [];
    for (const e of readdirSync(d)) {
      const f = join(d, e);
      if (statSync(f).isDirectory()) r.push(...walk(f));
      else r.push(f);
    }
    return r;
  };
  for (const f of walk(dir)) {
    const c = readFileSync(f, 'utf8');
    if (c.includes('\r\n')) writeFileSync(f, c.replace(/\r\n/g, '\n'));
  }
}

const lf = (s: string) => s.replace(/\r\n/g, '\n');

describe.skipIf(!hasRecipes)('transitrix migrate (requires methodology repo)', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
    temps.length = 0;
  });

  function makeTempRepo56(fromVersion = '0.5.0'): string {
    const tmp = mkdtempSync(join(tmpdir(), 'tx-migrate-'));
    temps.push(tmp);
    cpSync(join(fixtureBase56, 'before'), tmp, { recursive: true });
    normalizeLf(tmp);
    writeFileSync(join(tmp, 'transitrix.yaml'), `methodology_version: ${fromVersion}\n`);
    return tmp;
  }

  /** @deprecated use makeTempRepo56 — kept for existing tests */
  const makeTempRepo = makeTempRepo56;

  it('shows help with --help', () => {
    const { status, stderr } = runCli(['migrate', '--help']);
    expect(status).toBe(0);
    expect(stderr).toContain('transitrix migrate');
  });

  it('migrate --help appears in top-level usage', () => {
    const { stderr } = runCli(['--help']);
    expect(stderr).toContain('migrate');
  });

  it('migrates 0.5→0.6: activities file matches fixtures/after', () => {
    const tmp = makeTempRepo('0.5.0');
    const { status } = runCli(['migrate', '--recipes', recipesDir, tmp]);
    expect(status).toBe(0);

    const got = lf(readFileSync(join(tmp, 'canon/views/launch.activities.transitrix.yaml'), 'utf8'));
    const want = lf(readFileSync(join(fixtureBase56, 'after/canon/views/launch.activities.transitrix.yaml'), 'utf8'));
    expect(got).toBe(want);
  });

  it('migrates 0.5→0.6: role file matches fixtures/after', () => {
    const tmp = makeTempRepo('0.5.0');
    runCli(['migrate', '--recipes', recipesDir, tmp]);

    const got = lf(readFileSync(join(tmp, 'canon/elements/02_business/roles/ROLE-OPS-1.yaml'), 'utf8'));
    const want = lf(readFileSync(join(fixtureBase56, 'after/canon/elements/02_business/roles/ROLE-OPS-1.yaml'), 'utf8'));
    expect(got).toBe(want);
  });

  it('migrates 0.5→0.6: project-card renamed to activity-card', () => {
    const tmp = makeTempRepo('0.5.0');
    runCli(['migrate', '--recipes', recipesDir, tmp]);

    expect(existsSync(join(tmp, 'canon/views/eu.project-card.transitrix.yaml'))).toBe(false);
    expect(existsSync(join(tmp, 'canon/views/eu.activity-card.transitrix.yaml'))).toBe(true);

    const got = lf(readFileSync(join(tmp, 'canon/views/eu.activity-card.transitrix.yaml'), 'utf8'));
    const want = lf(readFileSync(join(fixtureBase56, 'after/canon/views/eu.activity-card.transitrix.yaml'), 'utf8'));
    expect(got).toBe(want);
  });

  it('updates transitrix.yaml methodology_version to latest reachable on success', () => {
    const tmp = makeTempRepo('0.5.0');
    const { status } = runCli(['migrate', '--recipes', recipesDir, tmp]);
    expect(status).toBe(0);

    const yaml = readFileSync(join(tmp, 'transitrix.yaml'), 'utf8');
    // 0.5→0.6→0.7 chain: ends at 0.7.0 when both recipes are present
    expect(yaml).toMatch(/methodology_version: 0\.[67]\.0/);
  });

  it('auto-detects from-version from transitrix.yaml', () => {
    const tmp = makeTempRepo('0.5.0');
    const { status } = runCli(['migrate', '--recipes', recipesDir, '--to', '0.6', tmp]);
    expect(status).toBe(0);
    expect(readFileSync(join(tmp, 'transitrix.yaml'), 'utf8')).toContain('0.6.0');
  });

  it('honours explicit --from / --to flags', () => {
    const tmp = makeTempRepo('0.5.0');
    const { status } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.5', '--to', '0.6', tmp]);
    expect(status).toBe(0);
  });

  it('exits 0 with "nothing to do" when already at target', () => {
    const tmp = makeTempRepo('0.6.0');
    const { status, stdout } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.6', tmp]);
    expect(status).toBe(0);
    expect(stdout).toContain('nothing to do');
  });

  it('--dry-run: files are not modified', () => {
    const tmp = makeTempRepo('0.5.0');
    const beforeContent = readFileSync(join(tmp, 'canon/views/launch.activities.transitrix.yaml'), 'utf8');

    const { status } = runCli(['migrate', '--dry-run', '--recipes', recipesDir, tmp]);
    expect(status).toBe(0);

    const afterContent = readFileSync(join(tmp, 'canon/views/launch.activities.transitrix.yaml'), 'utf8');
    expect(afterContent).toBe(beforeContent);
  });

  it('--dry-run: transitrix.yaml is not updated', () => {
    const tmp = makeTempRepo('0.5.0');
    const { status } = runCli(['migrate', '--dry-run', '--recipes', recipesDir, tmp]);
    expect(status).toBe(0);
    expect(readFileSync(join(tmp, 'transitrix.yaml'), 'utf8')).toContain('0.5.0');
  });

  it('--dry-run: output mentions files that would change', () => {
    const tmp = makeTempRepo('0.5.0');
    const { stdout } = runCli(['migrate', '--dry-run', '--recipes', recipesDir, tmp]);
    expect(stdout).toContain('would change');
  });

  it('fails clearly when no transitrix.yaml and no --from', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tx-migrate-no-yaml-'));
    temps.push(tmp);
    cpSync(join(fixtureBase56, 'before'), tmp, { recursive: true });

    const { status, stderr } = runCli(['migrate', '--recipes', recipesDir, tmp]);
    expect(status).not.toBe(0);
    expect(stderr).toContain('methodology_version');
  });

  it('fails clearly when recipes dir does not exist', () => {
    const tmp = makeTempRepo();
    const { status, stderr } = runCli(['migrate', '--recipes', '/nonexistent/path', tmp]);
    expect(status).not.toBe(0);
    expect(stderr).toContain('no recipes found');
  });

  it('fails clearly when no migration path exists', () => {
    const tmp = makeTempRepo('0.6.0');
    const { status, stderr } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.5', tmp]);
    expect(status).not.toBe(0);
    expect(stderr).toContain('no migration path');
  });
});

// ── 0.6→0.7 migration tests (FACTOR→DRIVER rename) ───────────────────────

describe.skipIf(!has67Recipe)('transitrix migrate 0.6→0.7 (requires methodology repo)', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
    temps.length = 0;
  });

  function makeTempRepo67(fromVersion = '0.6.0'): string {
    const tmp = mkdtempSync(join(tmpdir(), 'tx-migrate-67-'));
    temps.push(tmp);
    cpSync(join(fixtureBase67, 'before'), tmp, { recursive: true });
    normalizeLf(tmp);
    writeFileSync(join(tmp, 'transitrix.yaml'), `methodology_version: ${fromVersion}\n`);
    return tmp;
  }

  it('renames FACTOR-*.yaml to DRIVER-*.yaml', () => {
    const tmp = makeTempRepo67();
    const { status } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);
    expect(status).toBe(0);

    const factorPath = join(tmp, 'canon/elements/01_motivation/factors/FACTOR-COMP-1.yaml');
    const driverPath = join(tmp, 'canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml');
    expect(existsSync(factorPath)).toBe(false);
    expect(existsSync(driverPath)).toBe(true);
  });

  it('driver file content matches fixtures/after', () => {
    const tmp = makeTempRepo67();
    runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);

    const got = lf(readFileSync(join(tmp, 'canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml'), 'utf8'));
    const want = lf(readFileSync(join(fixtureBase67, 'after/canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml'), 'utf8'));
    expect(got).toBe(want);
  });

  it('goal file cross-references updated to DRIVER-* IDs', () => {
    const tmp = makeTempRepo67();
    runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);

    const got = lf(readFileSync(join(tmp, 'canon/elements/01_motivation/goals/GOAL-GROWTH-1.yaml'), 'utf8'));
    const want = lf(readFileSync(join(fixtureBase67, 'after/canon/elements/01_motivation/goals/GOAL-GROWTH-1.yaml'), 'utf8'));
    expect(got).toBe(want);
  });

  it('updates methodology_version to 0.7.0', () => {
    const tmp = makeTempRepo67();
    const { status } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);
    expect(status).toBe(0);

    const yaml = readFileSync(join(tmp, 'transitrix.yaml'), 'utf8');
    expect(yaml).toContain('methodology_version: 0.7.0');
  });

  it('--dry-run: FACTOR file not renamed, no version bump', () => {
    const tmp = makeTempRepo67();
    const { status } = runCli(['migrate', '--dry-run', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);
    expect(status).toBe(0);

    expect(existsSync(join(tmp, 'canon/elements/01_motivation/factors/FACTOR-COMP-1.yaml'))).toBe(true);
    expect(readFileSync(join(tmp, 'transitrix.yaml'), 'utf8')).toContain('0.6.0');
  });

  it('is idempotent: re-running on migrated repo exits 0 with no changes', () => {
    const tmp = makeTempRepo67();
    runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);

    const before = lf(readFileSync(join(tmp, 'canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml'), 'utf8'));
    const { status } = runCli(['migrate', '--recipes', recipesDir, '--from', '0.6', '--to', '0.7', tmp]);
    expect(status).toBe(0);
    const after = lf(readFileSync(join(tmp, 'canon/elements/01_motivation/factors/DRIVER-COMP-1.yaml'), 'utf8'));
    expect(after).toBe(before);
  });
});
