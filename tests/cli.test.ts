import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { describe, it, expect } from 'vitest'

// Spawns the built CLI (dist/cli.js — produced by the `pretest` build step).
const cliPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js')
const cliVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
const diagramsVersion = JSON.parse(readFileSync(new URL('../packages/diagrams/package.json', import.meta.url), 'utf8')).version

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' })
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

describe('CLI top-level help (#187)', () => {
  it('exits 0 and prints usage for --help', () => {
    const { status, stderr } = runCli(['--help'])
    expect(status).toBe(0)
    expect(stderr).toContain('Transitrix Studio CLI')
    expect(stderr).toContain('transitrix serve')
  })

  it('exits 0 for -h and the `help` subcommand', () => {
    expect(runCli(['-h']).status).toBe(0)
    expect(runCli(['help']).status).toBe(0)
  })

  it('exits non-zero for an unknown command', () => {
    expect(runCli(['definitely-not-a-command']).status).not.toBe(0)
  })
})

describe('CLI --version', () => {
  it('exits 0 and reports both the cli and bundled @transitrix/diagrams version', () => {
    const { status, stdout } = runCli(['--version'])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(`transitrix ${cliVersion} (bundles @transitrix/diagrams ${diagramsVersion})`)
  })

  it('-v is an alias for --version', () => {
    const { status, stdout } = runCli(['-v'])
    expect(status).toBe(0)
    expect(stdout.trim()).toBe(`transitrix ${cliVersion} (bundles @transitrix/diagrams ${diagramsVersion})`)
  })
})


describe('requirements-report caller contract', () => {
  function catalogue(run: (root: string, args: string[]) => void) {
    const root = mkdtempSync(join(tmpdir(), 'requirements report '));
    const put = (id: string, fields: Record<string, unknown>) => writeFileSync(join(root, 'canon', id + '.yaml'), JSON.stringify({
      id, notation: id.split('-')[0].toLowerCase(), name: id, zone: 'canon', admitted_at: '2026-01-01', admitted_by: 'example',
      gate_checks: { uniqueness: 'pass' }, valid_from: '2026-01-01', valid_to: null, ...fields }));
    try {
      writeFileSync(join(root, 'transitrix.yaml'), 'transitrix: 1'); mkdirSync(join(root, 'canon'));
      put('APPLICATION-TEST-1', { type: 'application' }); put('RELEASE-TEST-1', { of: 'APPLICATION-TEST-1' });
      run(root, ['requirements-report', '--root', root, '--subject-type', 'APPLICATION', '--subject-id', 'APPLICATION-TEST-1', '--release', 'RELEASE-TEST-1', '--as-at', '2026-09-24', '--json']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  it('declares help and returns deterministic complete empty JSON for a non-Git catalogue', () => {
    expect(runCli(['requirements-report','--help']).stdout).toContain('requirements-report/1');
    catalogue((_root, args) => {
      const first = runCli(args); expect(first.status, first.stderr).toBe(0); expect(first.stderr).toBe('');
      expect(runCli(args).stdout).toBe(first.stdout);
      const p = JSON.parse(first.stdout); expect(p.schemaVersion).toBe('requirements-report/1');
      expect(p.source).toMatchObject({ revision: null, dirty: null, mode: 'disk' });
      expect(p.projection.contract).toBe('requirement-chain/0.3');
      expect(Object.values(p.projection.metrics).map((s: any) => s.total)).toEqual([0,0,0,0,0,0]);
    });
  });
  it('distinguishes missing selection, malformed input, partial reads and source assertion failure', () => {
    catalogue((root, args) => {
      for (const extra of [['--unknown'], ['--as-at','2026-02-30'], ['--json']]) {
        const result = runCli([...args, ...extra]); expect(result.status).toBe(1);
        expect(JSON.parse(result.stdout)).toMatchObject({ status: 'error', projection: null, counts: null, errors: [{ code: 'USAGE' }] });
      }
      expect(JSON.parse(runCli([...args, '--expect-source-revision', 'a'.repeat(40)]).stdout).errors[0].code).toBe('SOURCE_REVISION');
      const unknown = runCli(args.map(v => v === 'APPLICATION-TEST-1' ? 'APPLICATION-MISSING-1' : v));
      expect(unknown.status).toBe(2); expect(JSON.parse(unknown.stdout).projection.metrics.unassigned.total).toBeNull();
      writeFileSync(join(root,'canon','broken.yaml'), 'bad: [');
      const partial = runCli(args); expect(partial.status).toBe(2);
      const parsed = JSON.parse(partial.stdout); expect(parsed.projection.populations.selected.total).toBeNull();
      expect(parsed.projection.findings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'LOAD', owner: 'canon/broken.yaml' })]));
      rmSync(join(root,'transitrix.yaml'));
      expect(JSON.parse(runCli(args).stdout)).toMatchObject({ status: 'error', projection: null, errors: [{ code: 'LOAD' }] });
    });
  });
  it('keeps nested catalogues outside the boundary and treats symlinks as incomplete', () => {
    catalogue((root,args) => {
      mkdirSync(join(root,'canon','nested')); writeFileSync(join(root,'canon','nested','transitrix.yaml'), 'transitrix: 1');
      writeFileSync(join(root,'canon','nested','bad.yaml'), 'bad: [');
      expect(runCli(args).status).toBe(0);
      if (process.platform === 'win32') return; // Windows may require an elevated symlink privilege.
      symlinkSync(join(root,'canon','nested','bad.yaml'), join(root,'canon','link.yaml'));
      const result = runCli(args); expect(result.status).toBe(2);
      expect(JSON.parse(result.stdout).projection.findings).toEqual(expect.arrayContaining([expect.objectContaining({ owner: 'canon/link.yaml', code: 'LOAD' })]));
    });
  });
});
