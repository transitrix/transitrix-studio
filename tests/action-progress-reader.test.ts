import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath }) },
  workspace: { fs: { readFile: (uri: { fsPath: string }) => fs.promises.readFile(uri.fsPath) } },
}));
import * as vscode from 'vscode';
import { loadProgressDataFromFileUri } from '../extension/src/canon-loader.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function model(rows?: unknown[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'transitrix-progress-'));
  roots.push(root);
  fs.mkdirSync(path.join(root, 'analytics'));
  fs.writeFileSync(path.join(root, 'transitrix.yaml'), 'transitrix: 1\n');
  if (rows) fs.writeFileSync(path.join(root, 'analytics/action-progress.ndjson'), rows.map(r => JSON.stringify(r)).join('\n') + '\nnot json\n');
  return vscode.Uri.file(path.join(root, 'views/test.action.transitrix.yaml'));
}

describe('action progress disk reader', () => {
  it('keeps valid rows and rejects invalid or ambiguous rows', async () => {
    const row = (id: string, percent: number, computed_at = '2026-09-01T00:00:00Z') => ({ id, percent, computed_at });
    const result = await loadProgressDataFromFileUri(model([
      row('ACTION-VALID-1', 63), row('ACTION-ZERO-1', 0), row('ACTION-DONE-1', 100),
      row('ACTION-DUPLICATE-1', 20), row('ACTION-DUPLICATE-1', 80), row('ACTION-DUPLICATE-1', 30),
      row('ACTION-HIGH-1', 101), row('ACTION-LOW-1', -1), row('ACTION-DATE-1', 30, 'invalid'),
      row('GOAL-WRONG-1', 45), null, [], { id: 'ACTION-MISSING-1' },
    ]));
    expect([...result!.keys()]).toEqual(['ACTION-VALID-1', 'ACTION-ZERO-1', 'ACTION-DONE-1']);
    expect(result!.get('ACTION-VALID-1')).toEqual({ percent: 63, computedAt: '2026-09-01T00:00:00Z' });
  });
  it('tolerates a missing sidecar', async () => {
    expect(await loadProgressDataFromFileUri(model())).toBeUndefined();
  });
});
