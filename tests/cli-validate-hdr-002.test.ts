// transitrix-hq#123 — HDR-002 (CONTRACT.md §2) must reject a `notation:`
// value that names no notation the methodology registers, instead of the
// generic "not yet validated by the CLI" notice that the same fallback path
// gives a *recognised* notation with no CLI validator of its own yet.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = join(__dirname, '..', 'dist', 'cli.js');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [cliPath, ...args], { encoding: 'utf8' });
  return { status: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('transitrix validate — HDR-002 rejects an unregistered notation (transitrix-hq#123)', () => {
  const temps: string[] = [];

  afterEach(() => {
    for (const t of temps) rmSync(t, { recursive: true, force: true });
    temps.length = 0;
  });

  function writeFixture(name: string, content: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'tx-hdr-002-'));
    temps.push(dir);
    const file = join(dir, name);
    writeFileSync(file, content, 'utf8');
    return file;
  }

  it('fails with HDR-002 on a notation: value no registry carries', () => {
    const file = writeFixture('bogus.yaml', 'notation: element\nid: X-1\nname: X\n');
    const { status, stdout } = runCli(['validate', file, '--json']);
    expect(status).not.toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.findings.some((f: { ruleId: string }) => f.ruleId === 'HDR-002')).toBe(true);
  });

  it('still gives the soft "not yet validated" notice for a recognised-but-unimplemented notation', () => {
    const file = writeFixture('role.yaml', 'notation: role\nid: ROLE-X-1\nname: X\n');
    const { status, stdout } = runCli(['validate', file, '--json']);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.valid).toBeNull();
    expect(parsed.message).toContain('not yet validated by the CLI');
  });
});
