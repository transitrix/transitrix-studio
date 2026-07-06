import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  runCodexValidate,
  runRepoValidate,
  repoScopeHasErrors,
} from '../src/repo-validate.js';

// Phase C2 (#518): `validate --scope=repo` sweeps codex/** with folder jurisdiction.

const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'notation-corpus',
);

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function copyCorpus(root: string, rel: string, corpusRel: string): void {
  write(root, rel, readFileSync(join(corpus, corpusRel), 'utf8'));
}

describe('repo-scope codex sweep (#518 C2)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-codex-'));
    copyCorpus(root, 'codex/external/EU/LAW-GDPR-1.yaml', 'codex/external/EU/LAW-GDPR-1.yaml');
    copyCorpus(
      root,
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
    );
    write(
      root,
      'codex/external/EU/LAW-BAD-1.yaml',
      [
        'zone: codex',
        'id: LAW-BAD-1',
        'name: Bad jurisdiction',
        'type: LAW',
        'jurisdiction: ge',
        'effective_date: "2020-01-01"',
        'admitted_at: "2026-06-01"',
        'admitted_by: test',
        'gate_checks:',
        '  uniqueness: pass',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags CODEX-005 when jurisdiction disagrees with folder', () => {
    const findings = runCodexValidate(root);
    const bad = findings.filter((f) => f.file.endsWith('LAW-BAD-1.yaml'));
    expect(bad.some((f) => f.ruleId === 'CODEX-005' && f.severity === 'error')).toBe(true);
  });

  it('leaves clean corpus codex files error-free', () => {
    const findings = runCodexValidate(root);
    const clean = findings.filter(
      (f) =>
        f.severity === 'error'
        && (f.file.endsWith('LAW-GDPR-1.yaml')
          || f.file.endsWith('INTERNAL_STANDARD-coding-conventions-1.yaml')),
    );
    expect(clean).toEqual([]);
  });

  it('runRepoValidate includes codex findings in error gate', () => {
    const result = runRepoValidate(root);
    expect(result.codex.some((c) => c.ruleId === 'CODEX-005')).toBe(true);
    expect(result.compliance).toEqual([]);
    expect(repoScopeHasErrors(result)).toBe(true);
  });
});

describe('repo-scope codex sweep — clean tree passes (#518 C2)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-codex-clean-'));
    copyCorpus(root, 'codex/external/EU/LAW-GDPR-1.yaml', 'codex/external/EU/LAW-GDPR-1.yaml');
    copyCorpus(root, 'codex/external/EU/LAW-NIS2-1.yaml', 'codex/external/EU/LAW-NIS2-1.yaml');
    copyCorpus(
      root,
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('clean codex tree passes with no codex errors', () => {
    const result = runRepoValidate(root);
    expect(result.codex.filter((c) => c.severity === 'error')).toEqual([]);
    expect(result.compliance.filter((c) => c.severity === 'error')).toEqual([]);
    expect(repoScopeHasErrors(result)).toBe(false);
  });
});
