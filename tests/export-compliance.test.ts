import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { runWeasyPrint, readYamlBounded, MAX_YAML_BYTES, WEASYPRINT_TIMEOUT_MS } from '../src/export-compliance.js';

function mockSpawnResult(
  partial: Partial<SpawnSyncReturns<string>>,
): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: [null, '', ''],
    stdout: '',
    stderr: '',
    status: 0,
    signal: null,
    ...partial,
  } as SpawnSyncReturns<string>;
}

describe('runWeasyPrint', () => {
  beforeEach(() => {
    vi.mocked(spawnSync).mockReset();
  });

  it('passes the bounded timeout to spawnSync', () => {
    vi.mocked(spawnSync).mockReturnValue(mockSpawnResult({ status: 0 }));
    const result = runWeasyPrint('/tmp/report.html', '/tmp/report.pdf');
    expect(result).toEqual({ ok: true });
    expect(spawnSync).toHaveBeenCalledWith(
      expect.stringMatching(/^weasyprint/),
      ['/tmp/report.html', '/tmp/report.pdf'],
      expect.objectContaining({ encoding: 'utf-8', timeout: WEASYPRINT_TIMEOUT_MS }),
    );
  });

  it('surfaces ETIMEDOUT as a clean CLI error', () => {
    const timedOut = Object.assign(new Error('spawnSync ETIMEDOUT'), { code: 'ETIMEDOUT' });
    vi.mocked(spawnSync).mockReturnValue(mockSpawnResult({ error: timedOut, status: null }));
    const result = runWeasyPrint('/tmp/report.html', '/tmp/report.pdf', { timeoutMs: 5_000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('timed out after 5s');
    }
  });
});

describe('readYamlBounded', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-compliance-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('parses a YAML file under the size cap', () => {
    const f = join(dir, 'doc.yaml');
    writeFileSync(f, 'id: my-report\nname: Demo\n');
    expect(readYamlBounded(f)).toEqual({ id: 'my-report', name: 'Demo' });
  });

  it('skips a file larger than the cap (returns undefined)', () => {
    const f = join(dir, 'huge.yaml');
    writeFileSync(f, `id: x\npayload: "${'A'.repeat(64)}"\n`);
    // Force a skip with a tiny cap rather than writing megabytes.
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(readYamlBounded(f, 8)).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('exceeds 8-byte cap'));
    warn.mockRestore();
  });

  it('returns undefined for a missing file', () => {
    expect(readYamlBounded(join(dir, 'nope.yaml'))).toBeUndefined();
  });

  it('exposes a generous default cap', () => {
    expect(MAX_YAML_BYTES).toBe(2 * 1024 * 1024);
  });
});