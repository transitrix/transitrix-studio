import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, it, expect } from 'vitest';

import {
  runComplianceValidate,
  runRepoValidate,
  repoScopeHasErrors,
  buildRepoValidateContext,
} from '../src/repo-validate.js';

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

describe('repo-scope compliance catalogue (#518 C3)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-compliance-'));
    copyCorpus(root, 'codex/external/ge/LAW-PERSONAL-DATA-2017-1.yaml', 'codex/external/ge/LAW-PERSONAL-DATA-2017-1.yaml');
    copyCorpus(
      root,
      'canon/elements/01_motivation/requirements/REQUIREMENT-DATA-ERASURE-1.yaml',
      'requirement/REQUIREMENT-DATA-ERASURE-1.yaml',
    );
    copyCorpus(
      root,
      'canon/elements/02_business/products/PRODUCT-MOBILE-1.yaml',
      'compliance-c3/PRODUCT-MOBILE-1.yaml',
    );
    copyCorpus(
      root,
      'canon/elements/02_business/processes/PROCESS-USER-DATA-PURGE-1.yaml',
      'compliance-c3/PROCESS-USER-DATA-PURGE-1.yaml',
    );
    copyCorpus(
      root,
      'canon/elements/02_business/capabilities/CAPABILITY-V2.yaml',
      'compliance-c3/CAPABILITY-V2.yaml',
    );
    copyCorpus(
      root,
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
      'codex/internal/INTERNAL_STANDARD-coding-conventions-1.yaml',
    );
    copyCorpus(
      root,
      'canon/assertions/ASSERTION-MOBILE-DATA-ERASURE-1.yaml',
      'assertion/ASSERTION-MOBILE-DATA-ERASURE-1.yaml',
    );
    write(
      root,
      'canon/elements/01_motivation/requirements/REQUIREMENT-BAD-REF-1.yaml',
      [
        'notation: requirement',
        'id: REQUIREMENT-BAD-REF-1',
        'name: Bad ref',
        'description: Dangling codex ref',
        'zone: canon',
        'admitted_at: "2026-06-01"',
        'admitted_by: test',
        'gate_checks:',
        '  uniqueness: pass',
        'valid_from: "2026-01-01"',
        'valid_to: null',
        'derived_from:',
        '  - LAW-DOES-NOT-EXIST-1',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('buildRepoValidateContext resolves codex refs for REQ-002', () => {
    const ctx = buildRepoValidateContext(root);
    expect(ctx.catalog.typeOf('LAW-PERSONAL-DATA-2017-1')).toBe('LAW');
    expect(ctx.catalog.typeOf('PRODUCT-MOBILE-1')).toBe('PRODUCT');
  });

  it('runComplianceValidate passes clean requirement/assertion with full catalogue', () => {
    const ctx = buildRepoValidateContext(root);
    const findings = runComplianceValidate(root, ctx);
    const clean = findings.filter(
      (f) =>
        f.severity === 'error'
        && (f.file.endsWith('REQUIREMENT-DATA-ERASURE-1.yaml')
          || f.file.endsWith('ASSERTION-MOBILE-DATA-ERASURE-1.yaml')),
    );
    expect(clean).toEqual([]);
  });

  it('flags REQ-002 when derived_from codex id is missing from the catalogue', () => {
    const ctx = buildRepoValidateContext(root);
    const findings = runComplianceValidate(root, ctx);
    expect(
      findings.some(
        (f) => f.file.endsWith('REQUIREMENT-BAD-REF-1.yaml') && f.ruleId === 'REQ-002',
      ),
    ).toBe(true);
  });

  it('runRepoValidate includes compliance findings in the error gate', () => {
    const result = runRepoValidate(root);
    expect(result.compliance.some((f) => f.ruleId === 'REQ-002')).toBe(true);
    expect(repoScopeHasErrors(result)).toBe(true);
  });
});

describe('repo-scope compliance-impact build-time (#518 C3)', () => {
  let root: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'tx-compimp-'));
    copyCorpus(root, 'codex/external/EU/LAW-GDPR-1.yaml', 'codex/external/EU/LAW-GDPR-1.yaml');
    copyCorpus(
      root,
      'canon/views/compliance-impact/ci.compliance-impact.view.yaml',
      'compliance-impact/gdpr-nis2.compliance-impact.view.yaml',
    );
    write(
      root,
      'canon/views/compliance-impact/bad-ref.compliance-impact.transitrix.yaml',
      [
        'notation: compliance-impact',
        'view:',
        '  id: bad-ref',
        '  name: Bad refs',
        '  subjects:',
        '    products:',
        '      - PRODUCT-NOT-HERE-1',
        '  obligations:',
        '    filter:',
        '      derived_from_codex:',
        '        - LAW-NOT-HERE-1',
        '',
      ].join('\n'),
    );
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('surfaces COMPIMP-REF for unresolved view config refs', () => {
    const result = runRepoValidate(root);
    const bad = result.views.filter((f) => f.file.endsWith('bad-ref.compliance-impact.transitrix.yaml'));
    expect(bad.some((f) => f.ruleId === 'COMPIMP-REF')).toBe(true);
  });
});
