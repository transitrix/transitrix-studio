import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { afterEach, describe, it, expect } from 'vitest';

import { renderDocumentToDisk } from '../src/render-document.js';

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function write(base: string, rel: string, body: string): void {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tx-render-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

const NO_REFERENCE_DOC = [
  '---',
  'document: Smoke Test',
  'kind: mrd',
  'template_id: smoke.mrd',
  'template_version: "1.0"',
  '---',
  '# Fixed text only, no model references',
  '',
  'A plain paragraph with no reference at all.',
].join('\n');

describe('renderDocumentToDisk (transitrix-hq#186)', () => {
  it('writes markdown, PDF and a run-record next to the source by default', async () => {
    root = mkdtempSync(join(tmpdir(), 'tx-render-'));
    write(root, 'product.mrd.ttrs', NO_REFERENCE_DOC);

    const result = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs') });

    expect(result.ok).toBe(true);
    expect(result.templateId).toBe('smoke.mrd');
    expect(result.markdownPath).toBe(join(root, 'product.mrd.md'));
    expect(result.pdfPath).toBe(join(root, 'product.mrd.pdf'));
    expect(result.runRecordPath).toBe(join(root, 'product.mrd.run-record.json'));

    const markdown = readFileSync(result.markdownPath, 'utf8');
    expect(markdown).toContain('Fixed text only, no model references');

    const pdf = readFileSync(result.pdfPath);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    const record = JSON.parse(readFileSync(result.runRecordPath, 'utf8'));
    expect(record.template_id).toBe('smoke.mrd');
    expect(record.slots).toEqual([]);
  });

  it('writes to --out when given, leaving the source directory untouched', async () => {
    root = mkdtempSync(join(tmpdir(), 'tx-render-'));
    write(root, 'src/product.mrd.ttrs', NO_REFERENCE_DOC);
    const outDir = join(root, 'out');

    const result = await renderDocumentToDisk({
      path: join(root, 'src/product.mrd.ttrs'),
      outDir,
    });

    expect(result.markdownPath).toBe(join(outDir, 'product.mrd.md'));
    expect(() => readFileSync(join(root, 'src/product.mrd.md'))).toThrow();
    expect(readFileSync(result.markdownPath, 'utf8')).toContain('Fixed text only');
  });

  it('every instruction slot renders open — no `fill` hook is ever supplied', async () => {
    root = mkdtempSync(join(tmpdir(), 'tx-render-'));
    const doc = [
      '---',
      'document: Smoke Test',
      'kind: mrd',
      'template_id: smoke.mrd',
      'template_version: "1.0"',
      '---',
      '{{# instruct market-size }}',
      'question: How large is the market?',
      'inputs:',
      'sufficient: a number',
      '{{/ instruct }}',
    ].join('\n');
    write(root, 'product.mrd.ttrs', doc);

    const result = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs') });

    expect(result.ok).toBe(true);
    const markdown = readFileSync(result.markdownPath, 'utf8');
    expect(markdown).toContain('Open — not answered.');
    const record = JSON.parse(readFileSync(result.runRecordPath, 'utf8'));
    expect(record.slots).toHaveLength(1);
    expect(record.slots[0].verdict).toBe('not-attempted');
    expect(record.model_id).toBeNull();
  });

  it('fails closed on an unresolved reference (strict profile) — still writes markdown/PDF, never a run-record', async () => {
    root = mkdtempSync(join(tmpdir(), 'tx-render-'));
    const doc = [
      '---',
      'document: Smoke Test',
      'kind: mrd',
      'template_id: smoke.mrd',
      'template_version: "1.0"',
      '---',
      'Cites {{ REQ-1 }}, which has no repository configured to resolve against.',
    ].join('\n');
    write(root, 'product.mrd.ttrs', doc);

    const result = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs') });

    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    // Markdown/PDF are still written — the failure is visible in the persisted
    // artefact, not just swallowed into a non-zero exit code.
    expect(readFileSync(result.markdownPath, 'utf8')).toContain('«');
  });

  it('records `git rev-parse HEAD` of --root as the run-record\'s repository_commit', async () => {
    root = initRepo();
    write(root, 'product.mrd.ttrs', NO_REFERENCE_DOC);
    git(['add', '-A'], root);
    git(['commit', '-q', '-m', 'init'], root);
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();

    const result = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs'), root });

    const record = JSON.parse(readFileSync(result.runRecordPath, 'utf8'));
    expect(record.repository_commit).toBe(commit);
  });

  it('is deterministic — rendering an unchanged document twice produces byte-identical markdown and PDF', async () => {
    root = mkdtempSync(join(tmpdir(), 'tx-render-'));
    write(root, 'product.mrd.ttrs', NO_REFERENCE_DOC);

    const first = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs') });
    const firstMarkdown = readFileSync(first.markdownPath);
    const firstPdf = readFileSync(first.pdfPath);

    const second = await renderDocumentToDisk({ path: join(root, 'product.mrd.ttrs') });
    const secondMarkdown = readFileSync(second.markdownPath);
    const secondPdf = readFileSync(second.pdfPath);

    expect(secondMarkdown.equals(firstMarkdown)).toBe(true);
    expect(secondPdf.equals(firstPdf)).toBe(true);
  });
});
