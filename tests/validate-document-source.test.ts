import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { afterEach, describe, it, expect } from 'vitest';

import {
  checkDocumentSourcePath,
  checkDocumentSourceKind,
  isDocumentSourcePath,
  kindFromFilename,
  kindFromHeader,
  DOCUMENT_SOURCE_FOLDER,
} from '../src/validate-document-source.js';
import { runDocumentSourceValidate, runRepoValidate, repoScopeHasErrors } from '../src/repo-validate.js';

// transitrix-hq#58 — `.ttrs` document sources participate in the extension /
// content-match rule (HDR-003) every other notation is already held to, and the
// `.trs` near-miss is named in words rather than reported as an unknown file
// (CONTRACT.md §3).

const corpus = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'notation-corpus',
  'documents',
);

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'tx-ttrs-'));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, body: string): void {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function copyFixture(root: string, rel: string, fixture: string): void {
  write(root, rel, readFileSync(join(corpus, fixture), 'utf8'));
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('document-source path helpers', () => {
  it('claims .ttrs files and the .trs near-miss, and nothing else', () => {
    expect(isDocumentSourcePath('canon/views/documents/product.mrd.ttrs')).toBe(true);
    expect(isDocumentSourcePath('canon/views/documents/product.mrd.trs')).toBe(true);
    expect(isDocumentSourcePath('canon\\views\\documents\\product.mrd.ttrs')).toBe(true);
    expect(isDocumentSourcePath('canon/views/goals/strategy.goals.transitrix.yaml')).toBe(false);
  });

  it('reads the kind out of <basename>.<kind>.ttrs', () => {
    expect(kindFromFilename('canon/views/documents/product.mrd.ttrs')).toBe('mrd');
    expect(kindFromFilename('platform.srs.ttrs')).toBe('srs');
    // Not the <basename>.<kind>.ttrs shape — no kind to read.
    expect(kindFromFilename('product.ttrs')).toBeUndefined();
    expect(kindFromFilename('a.b.c.ttrs')).toBeUndefined();
  });

  it('reads kind: out of the YAML front matter, and only out of front matter', () => {
    expect(kindFromHeader('---\nkind: mrd\n---\n\nbody\n')).toBe('mrd');
    expect(kindFromHeader('---\r\nkind: mrd\r\n---\r\n\r\nbody\r\n')).toBe('mrd');
    expect(kindFromHeader('kind: mrd\n\nbody\n')).toBeUndefined();
    expect(kindFromHeader('---\nkind: [not, a, string]\n---\n')).toBeUndefined();
    expect(kindFromHeader('---\n: : :\n---\n')).toBeUndefined();
  });
});

describe('extension and placement (HDR-003)', () => {
  it('passes a correctly named and placed document source', () => {
    expect(checkDocumentSourcePath(`${DOCUMENT_SOURCE_FOLDER}/product.mrd.ttrs`)).toEqual([]);
  });

  it('names the .trs near-miss in words, not as an unknown file', () => {
    const findings = checkDocumentSourcePath(`${DOCUMENT_SOURCE_FOLDER}/product.mrd.trs`);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('HDR-003');
    expect(findings[0].message).toContain('.ttrs');
    expect(findings[0].message).toContain('one keystroke away');
    expect(findings[0].message).toContain('product.mrd.ttrs');
  });

  it('reports the near-miss once — it never also complains about the filename shape', () => {
    // `notes.trs` is neither `<basename>.<kind>.ttrs` nor in the right folder,
    // but the near-miss is the only thing worth telling its author.
    const findings = checkDocumentSourcePath('notes.trs');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('one keystroke away');
  });

  it('flags a .ttrs file outside its registered folder', () => {
    const findings = checkDocumentSourcePath('canon/views/goals/product.mrd.ttrs');
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('HDR-003');
    expect(findings[0].message).toContain(DOCUMENT_SOURCE_FOLDER);
    expect(findings[0].message).toContain('canon/views/goals/');
  });

  it('flags a .ttrs file at the repository root by name', () => {
    const findings = checkDocumentSourcePath('product.mrd.ttrs');
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('the repository root');
  });

  it('flags a filename that is not <basename>.<kind>.ttrs', () => {
    const findings = checkDocumentSourcePath(`${DOCUMENT_SOURCE_FOLDER}/product.ttrs`);
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('HDR-003');
    expect(findings[0].message).toContain('<basename>.<kind>.ttrs');
  });

  it('flags a doubled extension — .ttrs is never appended to the YAML form', () => {
    const findings = checkDocumentSourcePath(
      `${DOCUMENT_SOURCE_FOLDER}/product.mrd.transitrix.yaml.ttrs`,
    );
    expect(findings.some((f) => f.message.includes('<basename>.<kind>.ttrs'))).toBe(true);
  });
});

describe('filename / header kind agreement (TTRS-013)', () => {
  const good = readFileSync(join(corpus, 'product.mrd.ttrs'), 'utf8');
  const mismatch = readFileSync(join(corpus, 'kind-mismatch.mrd.ttrs'), 'utf8');

  it('passes when the header kind matches the filename kind', () => {
    expect(checkDocumentSourceKind(`${DOCUMENT_SOURCE_FOLDER}/product.mrd.ttrs`, good)).toEqual([]);
  });

  it('flags a header kind that disagrees with the filename, naming both', () => {
    const findings = checkDocumentSourceKind(
      `${DOCUMENT_SOURCE_FOLDER}/kind-mismatch.mrd.ttrs`,
      mismatch,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('TTRS-013');
    expect(findings[0].message).toContain('srs');
    expect(findings[0].message).toContain('mrd');
  });

  it('keeps the kind disagreement distinct from a wrong extension', () => {
    const kindFindings = checkDocumentSourceKind(
      `${DOCUMENT_SOURCE_FOLDER}/kind-mismatch.mrd.ttrs`,
      mismatch,
    );
    const extFindings = checkDocumentSourcePath(`${DOCUMENT_SOURCE_FOLDER}/product.ttrs`);
    expect(kindFindings[0].ruleId).not.toBe(extFindings[0].ruleId);
  });

  it('flags a missing header rather than assuming the filename kind', () => {
    const findings = checkDocumentSourceKind(
      `${DOCUMENT_SOURCE_FOLDER}/product.mrd.ttrs`,
      '# No front matter\n',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].ruleId).toBe('TTRS-001');
  });

  it('says nothing about the kind when the filename carries none', () => {
    // checkDocumentSourcePath has already reported the filename; there is no
    // kind segment left to compare the header against.
    expect(checkDocumentSourceKind(`${DOCUMENT_SOURCE_FOLDER}/product.ttrs`, good)).toEqual([]);
  });
});

describe('repo-scope sweep', () => {
  it('passes a repository holding one correctly placed document source', () => {
    const root = makeRoot();
    copyFixture(root, `${DOCUMENT_SOURCE_FOLDER}/product.mrd.ttrs`, 'product.mrd.ttrs');
    expect(runDocumentSourceValidate(root)).toEqual([]);
    expect(repoScopeHasErrors(runRepoValidate(root))).toBe(false);
  });

  it('surfaces every case in one sweep, each against its own file', () => {
    const root = makeRoot();
    copyFixture(root, `${DOCUMENT_SOURCE_FOLDER}/product.mrd.ttrs`, 'product.mrd.ttrs');
    copyFixture(root, `${DOCUMENT_SOURCE_FOLDER}/kind-mismatch.mrd.ttrs`, 'kind-mismatch.mrd.ttrs');
    copyFixture(root, 'canon/views/goals/misplaced.mrd.ttrs', 'product.mrd.ttrs');
    copyFixture(root, `${DOCUMENT_SOURCE_FOLDER}/near-miss.mrd.trs`, 'product.mrd.ttrs');

    const findings = runDocumentSourceValidate(root);
    const by = (name: string) => findings.filter((f) => f.file.endsWith(name));

    expect(by('product.mrd.ttrs').filter((f) => !f.file.includes('misplaced'))).toEqual([]);
    expect(by('kind-mismatch.mrd.ttrs').map((f) => f.ruleId)).toEqual(['TTRS-013']);
    expect(by('misplaced.mrd.ttrs').map((f) => f.ruleId)).toEqual(['HDR-003']);
    expect(by('near-miss.mrd.trs').map((f) => f.ruleId)).toEqual(['HDR-003']);
    expect(findings.every((f) => f.notation === 'documents' && f.severity === 'error')).toBe(true);
  });

  it('fails the repo-scope run on a misplaced document source', () => {
    const root = makeRoot();
    copyFixture(root, 'canon/views/goals/misplaced.mrd.ttrs', 'product.mrd.ttrs');
    expect(repoScopeHasErrors(runRepoValidate(root))).toBe(true);
  });

  it('sees a document source in another zone, and at the repository root', () => {
    const root = makeRoot();
    copyFixture(root, 'field/product.mrd.ttrs', 'product.mrd.ttrs');
    copyFixture(root, 'product.mrd.ttrs', 'product.mrd.ttrs');
    const findings = runDocumentSourceValidate(root);
    expect(findings.map((f) => f.ruleId)).toEqual(['HDR-003', 'HDR-003']);
    expect(findings.map((f) => f.file).sort()).toEqual(['field/product.mrd.ttrs', 'product.mrd.ttrs']);
  });

  it('reports a file found in two search roots exactly once', () => {
    const root = makeRoot();
    // `canon/` is both a top-level entry and a zone walked in its own right.
    copyFixture(root, 'canon/product.mrd.ttrs', 'product.mrd.ttrs');
    expect(runDocumentSourceValidate(root).map((f) => f.file)).toEqual(['canon/product.mrd.ttrs']);
  });

  it('leaves a repository’s own fixtures and docs alone — they are not model content', () => {
    const root = makeRoot();
    copyFixture(root, 'tests/fixtures/product.mrd.ttrs', 'product.mrd.ttrs');
    copyFixture(root, 'docs/product.mrd.ttrs', 'product.mrd.ttrs');
    expect(runDocumentSourceValidate(root)).toEqual([]);
  });

  it('skips tooling directories inside a zone', () => {
    const root = makeRoot();
    copyFixture(root, 'canon/node_modules/pkg/product.mrd.ttrs', 'product.mrd.ttrs');
    copyFixture(root, 'canon/.templates/product.mrd.ttrs', 'product.mrd.ttrs');
    expect(runDocumentSourceValidate(root)).toEqual([]);
  });

  it('returns nothing for a repository with no document sources at all', () => {
    expect(runDocumentSourceValidate(makeRoot())).toEqual([]);
  });
});
