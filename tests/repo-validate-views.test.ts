import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  runViewValidate,
  runRepoValidate,
  repoScopeHasErrors,
} from '../src/repo-validate.js';

// Phase A.2 (vkgeorgia/strategy#258): `validate --scope=repo` sweeps every
// notation file under canon/views/** with the same validators the preview uses.

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

describe('repo-scope views sweep (#258)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-'));
    // A clean Group A file, a deliberately broken one, a BPMN file (validated via
    // the IR pipeline), a Group B file, and Group C compliance views (covered
    // since #518 C1).
    copyCorpus(root, 'canon/views/goals/good.goals.transitrix.yaml', 'goals/strategy-2026.goals.transitrix.yaml');
    write(root, 'canon/views/goals/bad.goals.transitrix.yaml', 'notation: goals\nid: x\nname: Bad\ngoals: []\n');
    copyCorpus(root, 'canon/views/bpmn/ok.bpmn.transitrix.yaml', 'bpmn/simple-approval.bpmn.transitrix.yaml');
    copyCorpus(root, 'canon/views/applications/p.applications.transitrix.yaml', 'applications/portfolio-2026.applications.transitrix.yaml');
    copyCorpus(root, 'canon/views/coverage-metric/c.coverage-metric.transitrix.yaml', 'coverage-metric/eu-coverage.coverage-metric.transitrix.yaml');
    copyCorpus(root, 'canon/views/compliance-impact/ci.compliance-impact.view.yaml', 'compliance-impact/gdpr-nis2.compliance-impact.view.yaml');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('flags the broken Group A file with its rule code', () => {
    const { findings } = runViewValidate(root);
    const bad = findings.filter((f) => f.file.endsWith('bad.goals.transitrix.yaml'));
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((f) => f.notation === 'goals')).toBe(true);
    expect(bad.some((f) => f.severity === 'error' && f.ruleId.startsWith('GOALS-'))).toBe(true);
  });

  it('leaves the clean Group A file error-free', () => {
    const { findings } = runViewValidate(root);
    const good = findings.filter(
      (f) => f.file.endsWith('good.goals.transitrix.yaml') && f.severity === 'error',
    );
    expect(good).toEqual([]);
  });

  it('validates BPMN via the IR pipeline (not skipped)', () => {
    const { findings, skipped } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'bpmn')).toBe(false);
    // simple-approval is clean → no BPMN error findings.
    expect(findings.filter((f) => f.notation === 'bpmn' && f.severity === 'error')).toEqual([]);
  });

  it('validates Group B notations too (covered since #179, not skipped)', () => {
    const { skipped, findings } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'applications')).toBe(false);
    // The corpus applications catalogue is clean → no error findings.
    expect(findings.filter((f) => f.notation === 'applications' && f.severity === 'error')).toEqual([]);
  });

  it('validates Group C compliance views (#518 C1), not skipped', () => {
    const { skipped, findings } = runViewValidate(root);
    expect(skipped.some((s) => s.notation === 'coverage-metric')).toBe(false);
    expect(skipped.some((s) => s.notation === 'compliance-impact')).toBe(false);
    expect(findings.filter((f) => f.notation === 'coverage-metric' && f.severity === 'error')).toEqual([]);
    expect(findings.filter((f) => f.notation === 'compliance-impact' && f.severity === 'error')).toEqual([]);
  });

  it('runRepoValidate combines canon + views and fails on a view error', () => {
    const result = runRepoValidate(root);
    expect(result.canon).toEqual([]); // no elements/relations in this fixture
    expect(result.views.some((f) => f.severity === 'error')).toBe(true);
    expect(repoScopeHasErrors(result)).toBe(true);
  });
});

describe('repo-scope views sweep — clean tree passes (#258)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-views-clean-'));
    copyCorpus(root, 'canon/views/goals/good.goals.transitrix.yaml', 'goals/strategy-2026.goals.transitrix.yaml');
    copyCorpus(root, 'canon/views/applications/p.applications.transitrix.yaml', 'applications/portfolio-2026.applications.transitrix.yaml');
    copyCorpus(root, 'canon/views/coverage-metric/c.coverage-metric.transitrix.yaml', 'coverage-metric/eu-coverage.coverage-metric.transitrix.yaml');
    copyCorpus(root, 'canon/views/compliance-impact/ci.compliance-impact.view.yaml', 'compliance-impact/gdpr-nis2.compliance-impact.view.yaml');
    // C3 cross-doc refs: codex + product subjects referenced by the compliance views.
    copyCorpus(root, 'codex/external/EU/LAW-GDPR-1.yaml', 'codex/external/EU/LAW-GDPR-1.yaml');
    copyCorpus(root, 'codex/external/EU/LAW-NIS2-1.yaml', 'codex/external/EU/LAW-NIS2-1.yaml');
    write(
      root,
      'canon/elements/02_business/products/PRODUCT-ECOMM-1.yaml',
      readFileSync(join(corpus, 'compliance-c3/PRODUCT-MOBILE-1.yaml'), 'utf8').replace(
        'PRODUCT-MOBILE-1',
        'PRODUCT-ECOMM-1',
      ).replace('Acme Mobile', 'E-Commerce'),
    );
    write(
      root,
      'canon/elements/02_business/products/PRODUCT-SUPPORT-1.yaml',
      readFileSync(join(corpus, 'compliance-c3/PRODUCT-MOBILE-1.yaml'), 'utf8').replace(
        'PRODUCT-MOBILE-1',
        'PRODUCT-SUPPORT-1',
      ).replace('Acme Mobile', 'Support'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('clean Group A + Group B + Group C files pass with no skipped views', () => {
    const result = runRepoValidate(root);
    expect(result.views.filter((f) => f.severity === 'error')).toEqual([]);
    expect(repoScopeHasErrors(result)).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'applications')).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'coverage-metric')).toBe(false);
    expect(result.skipped.some((s) => s.notation === 'compliance-impact')).toBe(false);
  });
});
