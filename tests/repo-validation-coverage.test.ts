import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportRepoFindings, repoScopeHasErrors, runRepoValidate } from '../src/repo-validate.js';

const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'notation-coverage-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const cleanGoals = readFileSync(new URL('./fixtures/notation-corpus/goals/strategy-2026.goals.transitrix.yaml', import.meta.url), 'utf8');

describe('repository validation coverage', () => {
  it('accounts for a clean supported file without inventing a finding', () => {
    const result = runRepoValidate(fixture({ 'views/goals/clean.yaml': cleanGoals }));
    expect(result.coverage).toMatchObject({ discovered: 1, read: 1, validated: 1, unvalidated: 0, failed: 0 });
    expect(result.views).toEqual([]);
    expect(repoScopeHasErrors(result)).toBe(false);
  });

  it('names amendment and segment files in human and JSON output, and blocks strict mode', () => {
    const root = fixture({
      'field/amendments/AMENDMENT-1.yaml': 'notation: amendment\nid: AMENDMENT-1\n',
      'field/segments/SEGMENT-1.yaml': 'notation: segment\nid: SEGMENT-1\n',
    });
    const result = runRepoValidate(root);
    expect(result.coverage).toMatchObject({ discovered: 2, read: 2, validated: 0, unvalidated: 2, failed: 0 });
    expect(result.skipped.map(f => f.notation).sort()).toEqual(['amendment', 'segment']);
    expect(result.views.every(f => f.ruleId === 'NOTATION-SKIP-001' && f.severity === 'warning')).toBe(true);
    expect(repoScopeHasErrors(result)).toBe(false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportRepoFindings(root, result, false);
    const output = log.mock.calls.flat().join('\n');
    for (const file of result.skipped) expect(output).toContain(file.file);
    expect(output).toContain('NOTATION-SKIP-001');
    log.mockClear();
    reportRepoFindings(root, result, true);
    expect(JSON.parse(log.mock.calls[0][0]).coverage).toEqual(result.coverage);
    const strict = runRepoValidate(root, { strict: true });
    expect(repoScopeHasErrors(strict)).toBe(true);
    expect(strict.views.every(f => f.severity === 'error')).toBe(true);
  });

  it('retains unknown, missing-header, parse-failed and unreadable files exactly once', () => {
    const root = fixture({
      'views/unknown.yaml': 'notation: future-notation\n',
      'views/no-header.yaml': 'name: No header\n',
      'field/segments/broken.yaml': 'notation: [\n',
    });
    symlinkSync(join(root, 'absent.yaml'), join(root, 'views/unreadable.yaml'));
    const result = runRepoValidate(root);
    expect(result.coverage).toMatchObject({ discovered: 4, read: 3, validated: 0, unvalidated: 2, failed: 2 });
    expect(new Set(result.coverage!.files.map(f => f.file)).size).toBe(4);
    expect(result.coverage!.files.find(f => f.file.endsWith('broken.yaml'))).toMatchObject({ read: true, status: 'failed' });
    expect(result.coverage!.files.find(f => f.file.endsWith('unreadable.yaml'))).toMatchObject({ read: false, status: 'failed' });
    expect(repoScopeHasErrors(result)).toBe(true);
  });

  it('reads both view layouts and excludes templates and independent catalogues', () => {
    const root = fixture({
      'views/clean.yaml': cleanGoals,
      'canon/views/legacy.yaml': 'notation: future-notation\n',
      'views/.templates/template.yaml': 'notation: [\n',
      'canon/child/transitrix.yaml': 'transitrix: 1\n',
      'canon/child/elements/broken.yaml': 'notation: [\n',
      'docs/example.yaml': 'notation: [\n',
    });
    const result = runRepoValidate(root);
    expect(result.coverage).toMatchObject({ discovered: 2, read: 2, validated: 1, unvalidated: 1, failed: 0 });
    expect(result.coverage!.excluded.map(e => e.path).sort()).toEqual(['canon/child', 'views/.templates']);
    expect(result.views).toContainEqual(expect.objectContaining({ ruleId: 'MIX-001', severity: 'warning' }));
    expect(result.skipped).toContainEqual({ file: 'canon/views/legacy.yaml', notation: 'future-notation' });
    expect(repoScopeHasErrors(result)).toBe(false);
  });

  it('prints warnings even when all dispatched checks completed without errors', () => {
    const root = fixture({ 'views/clean.yaml': cleanGoals });
    const result = runRepoValidate(root);
    result.canon.push({ scope: 'repo', id: 'ACTION-1', ruleId: 'ACTION-003', severity: 'warning', message: 'Action hierarchy warning' });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportRepoFindings(root, result, false);
    expect(log.mock.calls.flat().join('\n')).toContain('Action hierarchy warning');
  });
});
