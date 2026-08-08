// Integrity check for vendor/methodology/document-renderer/ — the five source
// files of @transitrix/document-renderer's pass-1 resolver, vendored so the
// .ttrs preview (extension/src/ttrs-preview.ts) can call `runPass1` as a real
// library import rather than reimplementing its resolution logic.
//
// Unlike vocabulary-drift.test.ts, this is not a divergence check against a
// local reimplementation — there is no local copy of the resolution logic to
// diverge. It is an integrity check: the vendored files must be exactly what
// VENDORED.json says they are, and the vendored pass1.mjs must actually run.
// It fails closed — a missing file, an unpinned file, or a hash mismatch is a
// build failure, never a pass.

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR = path.join(repoRoot, 'vendor', 'methodology', 'document-renderer');

function hashArtefact(text: string): string {
  return createHash('sha256').update(text.replace(/\r\n/g, '\n'), 'utf8').digest('hex');
}

interface VendoredPin {
  source_repo: string;
  source_ref: string;
  source_path: string;
  files: Record<string, string>;
  vendored_on: string;
}

function loadPin(): VendoredPin {
  const text = readFileSync(path.join(VENDOR_DIR, 'VENDORED.json'), 'utf8');
  const pin = JSON.parse(text) as VendoredPin;
  if (!pin.source_ref || typeof pin.source_ref !== 'string') {
    throw new Error('VENDORED.json carries no source_ref');
  }
  if (!pin.files || typeof pin.files !== 'object') {
    throw new Error('VENDORED.json carries no files map');
  }
  return pin;
}

const EXPECTED_FILES = ['pass1.mjs', 'parse-template.mjs', 'repository.mjs', 'ids.mjs', 'syntax.mjs'];

describe('vendor/methodology/document-renderer — integrity', () => {
  it('VENDORED.json pins exactly the five files the resolver needs', () => {
    const pin = loadPin();
    expect(Object.keys(pin.files).sort()).toEqual([...EXPECTED_FILES].sort());
  });

  it.each(EXPECTED_FILES)('%s matches its pinned hash', (name) => {
    const pin = loadPin();
    const text = readFileSync(path.join(VENDOR_DIR, name), 'utf8');
    expect(hashArtefact(text)).toBe(pin.files[name]);
  });

  it('is checked out with LF line endings, per .gitattributes', () => {
    for (const name of EXPECTED_FILES) {
      const raw = readFileSync(path.join(VENDOR_DIR, name), 'utf8');
      expect(raw.includes('\r\n'), `${name} contains CRLF`).toBe(false);
    }
  });
});

describe('vendor/methodology/document-renderer — the resolver actually runs', () => {
  it('runPass1 resolves a repository-optional template with no model references', async () => {
    const mod = await import(pathToFileURL(path.join(VENDOR_DIR, 'pass1.mjs')).href) as {
      runPass1: (opts: { text: string; profile?: 'strict' | 'review' }) => Promise<{
        ok: boolean;
        markdown: string;
        suspicion: { computed: boolean };
      }>;
    };
    const text = [
      '---',
      'document: Smoke Test',
      'kind: mrd',
      'template_id: smoke.mrd',
      'template_version: "1.0"',
      '---',
      '# Fixed text only, no model references',
    ].join('\n');
    const result = await mod.runPass1({ text, profile: 'strict' });
    expect(result.ok).toBe(true);
    expect(result.markdown).toContain('# Fixed text only, no model references');
    expect(result.suspicion.computed).toBe(false);
  });

  it('runPass1 reports TTRS-004 for a deferred `each` construct, distinct from TTRS-002', async () => {
    const mod = await import(pathToFileURL(path.join(VENDOR_DIR, 'pass1.mjs')).href) as {
      runPass1: (opts: { text: string; profile?: 'strict' | 'review' }) => Promise<{
        errors: { code: string }[];
      }>;
    };
    const text = [
      '---',
      'document: Smoke Test',
      'kind: mrd',
      'template_id: smoke.mrd',
      'template_version: "1.0"',
      '---',
      '{{# each REQ }}{{ .title }}{{/ each }}',
    ].join('\n');
    const result = await mod.runPass1({ text, profile: 'review' });
    expect(result.errors.some((e) => e.code === 'TTRS-004')).toBe(true);
    expect(result.errors.some((e) => e.code === 'TTRS-002')).toBe(false);
  });
});
