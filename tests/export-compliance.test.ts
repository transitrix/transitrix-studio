import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SpawnSyncReturns } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
}));

import { spawnSync } from 'node:child_process';
import { runWeasyPrint, WEASYPRINT_TIMEOUT_MS } from '../src/export-compliance.js';

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