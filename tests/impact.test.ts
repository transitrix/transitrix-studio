import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { afterEach, describe, it, expect, vi } from 'vitest';

import { computeStagedImpact, stagedCanonElementIds, reportImpact, offerDocumentRegeneration } from '../src/impact.js';

// A staged canon/elements/** change is only meaningful against a real git
// index (git diff --cached), so — same pattern as
// tests/repo-validate-link-suspicion.test.ts — these fixtures are real
// (throwaway) git repos, not plain tmpdirs.

let root: string | undefined;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = undefined;
});

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function write(base: string, rel: string, body: string): void {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, 'utf8');
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tx-impact-'));
  git(['init', '-q'], dir);
  git(['config', 'user.email', 'test@example.com'], dir);
  git(['config', 'user.name', 'Test'], dir);
  return dir;
}

function commitAll(dir: string, message: string): void {
  git(['add', '-A'], dir);
  git(['commit', '-q', '-m', message], dir);
}

/** A DGCA canon-projection view (`view_config`, no inline factors/goals/…) —
 *  one of the three notations `computeStagedImpact` can resolve. `goals:
 *  filter: all` means every GOAL element in the store is in scope. */
const DGCA_VIEW = [
  'notation: dgca',
  'id: DGCA-STRAT-1',
  'name: "Strategy chain"',
  'view_config:',
  '  goals:',
  '    filter: all',
  '  factors:',
  '    surface: derived',
  '  changes:',
  '    surface: derived',
  '  activities:',
  '    surface: derived',
  '',
].join('\n');

function goalYaml(id: string, name: string): string {
  return `notation: goal\nid: ${id}\nname: "${name}"\n`;
}

function requirementYaml(id: string, description: string): string {
  return [
    'notation: requirement',
    `id: ${id}`,
    `description: "${description}"`,
    'zone: canon',
    'admitted_at: "2026-08-04"',
    'admitted_by: "v.korobeinikov"',
    'gate_checks:',
    '  uniqueness: pass',
    '  consistency: pass',
    '  completeness: pass',
    'valid_from: "2026-08-04"',
    'valid_to: null',
    '',
  ].join('\n');
}

function seedBaseline(dir: string): void {
  write(dir, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue'));
  write(dir, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Original wording'));
  write(dir, 'canon/views/strategy/dgca.dgca.transitrix.yaml', DGCA_VIEW);
  commitAll(dir, 'seed baseline');
}

describe('stagedCanonElementIds (transitrix-hq#89)', () => {
  it('is empty for a repo with nothing staged', () => {
    root = initRepo();
    seedBaseline(root);
    expect(stagedCanonElementIds(root)).toEqual(new Set());
  });

  it('reads the staged (index) content of a modified element, not the working tree', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);
    expect(stagedCanonElementIds(root)).toEqual(new Set(['GOAL-1']));
  });

  it('reads the ids of an id-bearing file staged for deletion from HEAD, not the (missing) index', () => {
    root = initRepo();
    seedBaseline(root);
    git(['rm', '-q', 'canon/elements/goals/GOAL-1.yaml'], root);
    expect(stagedCanonElementIds(root)).toEqual(new Set(['GOAL-1']));
  });

  it('ignores an unstaged working-tree edit', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Edited but never staged'));
    expect(stagedCanonElementIds(root)).toEqual(new Set());
  });
});

describe('computeStagedImpact (transitrix-hq#89)', () => {
  it('names the view that reads a staged, changed element', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.changedIds).toEqual(['GOAL-1']);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
    ]);
  });

  it('produces no notice at all for a change nothing reads (acceptance: second case)', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.changedIds).toEqual(['REQ-1']);
    expect(result.affected).toEqual([]);
    expect(result.notDetermined).toEqual([]);
  });

  it('is silent (no console output) when nothing is staged', () => {
    root = initRepo();
    seedBaseline(root);
    const result = computeStagedImpact(root);
    expect(result).toEqual({ changedIds: [], affected: [], notDetermined: [] });

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    reportImpact(result, false);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('reports an unresolvable view as coverage-not-determined, never as unaffected', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/portfolio/apps.applications.transitrix.yaml',
      'notation: applications\nid: APP-1\nname: "Portfolio"\napplications: []\n',
    );
    commitAll(root, 'add an unresolvable view');
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
    ]);
    expect(result.notDetermined).toEqual([
      { file: 'canon/views/portfolio/apps.applications.transitrix.yaml', notation: 'applications' },
    ]);
  });

  it('never reports a self-contained inline-form goals view as coverage-not-determined (transitrix-hq#89 Strategist finding)', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/strategy/inline-goals.goals.transitrix.yaml',
      [
        'notation: goals',
        'id: GOALS-INLINE-1',
        'name: "Inline goals"',
        'goal_types:',
        '  - name: Strategic Goal',
        '    level: 0',
        'goals:',
        '  - id: GOAL-RELEASE-CYCLE-1',
        '    name: "Shorten the release cycle"',
        '    type: Strategic Goal',
        '    level: 0',
        '',
      ].join('\n'),
    );
    commitAll(root, 'add an inline-form goals view');
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
    ]);
    // Inline-form goals carry no canon/elements dependency by notation design
    // (they stay inline until a second document shares them) — a staged
    // GOAL-1 change cannot affect this document, so it must not appear in
    // either list, not even notDetermined.
    expect(result.notDetermined).toEqual([]);
  });
});

/** A minimal, valid `.ttrs` document source — required header fields only. */
function ttrsDoc(recipeId: string, body: string): string {
  return [
    '---',
    'document: "Test document"',
    'kind: mrd',
    `recipe_id: ${recipeId}`,
    'recipe_version: "1.0"',
    '---',
    '',
    body,
    '',
  ].join('\n');
}

// These fixtures stage REQ-1, not GOAL-1: seedBaseline's dgca view resolves
// every GOAL element (`filter: all`), so a staged GOAL-1 change would also
// land in `affected` via that view and muddy what these tests are checking.
// REQ-1 is read by nothing in the baseline view (confirmed by the "produces
// no notice at all" test above), so it isolates the .ttrs-only behaviour.
describe('computeStagedImpact — .ttrs document coverage (transitrix-hq#89)', () => {
  it('names a .ttrs document whose inline reference reads a staged, changed element', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc('product.mrd', 'This document cites {{ REQ-1 }} directly.'),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/documents/product.mrd.ttrs', notation: 'documents' },
    ]);
    expect(result.notDetermined).toEqual([]);
  });

  it('names a .ttrs document whose instruction-slot inputs name a staged, changed element', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc(
        'product.mrd',
        [
          '{{# instruct market-size }}',
          'question: How large is the addressable market?',
          'inputs: REQ-1, GOAL-1',
          'sufficient: A number with a source.',
          '{{/ instruct }}',
        ].join('\n'),
      ),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/documents/product.mrd.ttrs', notation: 'documents' },
    ]);
  });

  it('produces no notice for a .ttrs document that cites none of the staged ids', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc('product.mrd', 'This document cites {{ GOAL-1 }} only.'),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([]);
    expect(result.notDetermined).toEqual([]);
  });

  it('reports a .ttrs document holding an unimplemented construct as coverage-not-determined, never as unaffected', () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc(
        'product.mrd',
        '{{# each REQUIREMENT }}\n{{ .id }}\n{{/ each }}\n\nThis document cites {{ REQ-1 }} too.',
      ),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([]);
    expect(result.notDetermined).toEqual([
      { file: 'canon/views/documents/product.mrd.ttrs', notation: 'documents' },
    ]);
  });

  it('does not check the .trs near-miss (never a parseable document)', () => {
    root = initRepo();
    seedBaseline(root);
    write(root, 'canon/views/documents/product.mrd.trs', ttrsDoc('product.mrd', '{{ REQ-1 }}'));
    commitAll(root, 'add a near-miss file');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([]);
    expect(result.notDetermined).toEqual([]);
  });
});

describe('offerDocumentRegeneration (transitrix-hq#182)', () => {
  it('offers each documents artefact by name and skips a view finding entirely', async () => {
    root = initRepo();
    seedBaseline(root); // dgca view resolves every GOAL element (filter: all)
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc('product.mrd', 'Cites {{ GOAL-1 }} directly.'),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/goals/GOAL-1.yaml', goalYaml('GOAL-1', 'Grow revenue by 20%'));
    git(['add', 'canon/elements/goals/GOAL-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/strategy/dgca.dgca.transitrix.yaml', notation: 'dgca' },
      { file: 'canon/views/documents/product.mrd.ttrs', notation: 'documents' },
    ]);

    const confirm = vi.fn(async () => false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await offerDocumentRegeneration(result, root, confirm);
    log.mockRestore();

    // Asked once, for the documents artefact only — never for the dgca view.
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('canon/views/documents/product.mrd.ttrs');
  });

  it('never offers a coverage-not-determined document, only the determined one', async () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/determined.mrd.ttrs',
      ttrsDoc('determined.mrd', 'Cites {{ REQ-1 }} directly.'),
    );
    write(
      root,
      'canon/views/documents/undetermined.mrd.ttrs',
      ttrsDoc('undetermined.mrd', '{{# each REQUIREMENT }}\n{{ .id }}\n{{/ each }}\n\nAlso cites {{ REQ-1 }}.'),
    );
    commitAll(root, 'add two document sources');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    expect(result.affected).toEqual([
      { file: 'canon/views/documents/determined.mrd.ttrs', notation: 'documents' },
    ]);
    expect(result.notDetermined).toEqual([
      { file: 'canon/views/documents/undetermined.mrd.ttrs', notation: 'documents' },
    ]);

    const confirm = vi.fn(async () => false);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await offerDocumentRegeneration(result, root, confirm);
    log.mockRestore();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('canon/views/documents/determined.mrd.ttrs');
  });

  it('accepting the offer regenerates the document — identical to running the render path directly', async () => {
    root = initRepo();
    seedBaseline(root);
    // `canon: ../..` (from canon/views/documents/ back to canon/) gives Pass 1
    // a real repository to resolve {{ REQ-1 }} against, same as any other
    // document that declares its own repository root.
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      [
        '---',
        'document: "Test document"',
        'kind: mrd',
        'recipe_id: product.mrd',
        'recipe_version: "1.0"',
        'canon: ../..',
        '---',
        '',
        'Cites {{ REQ-1 }} directly.',
        '',
      ].join('\n'),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const result = computeStagedImpact(root);
    const markdownPath = join(root, 'canon/views/documents/product.mrd.md');
    const pdfPath = join(root, 'canon/views/documents/product.mrd.pdf');
    const runRecordPath = join(root, 'canon/views/documents/product.mrd.run-record.json');
    expect(existsSync(markdownPath)).toBe(false);

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await offerDocumentRegeneration(result, root, async () => true);
    log.mockRestore();

    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(pdfPath)).toBe(true);
    expect(existsSync(runRecordPath)).toBe(true);

    const offerMarkdown = readFileSync(markdownPath, 'utf8');
    expect(offerMarkdown).toContain('REQ-1');

    const { renderDocumentToDisk } = await import('../src/render-document.js');
    const direct = await renderDocumentToDisk({
      path: join(root, 'canon/views/documents/product.mrd.ttrs'),
      root,
      outDir: join(root, 'direct-out'),
    });
    expect(direct.ok).toBe(true);
    expect(readFileSync(direct.markdownPath, 'utf8')).toBe(offerMarkdown);
  });

  it('declining performs no regeneration and writes no state — the identical offer reappears', async () => {
    root = initRepo();
    seedBaseline(root);
    write(
      root,
      'canon/views/documents/product.mrd.ttrs',
      ttrsDoc('product.mrd', 'Cites {{ REQ-1 }} directly.'),
    );
    commitAll(root, 'add a document source');
    write(root, 'canon/elements/requirements/REQ-1.yaml', requirementYaml('REQ-1', 'Reworded wording'));
    git(['add', 'canon/elements/requirements/REQ-1.yaml'], root);

    const firstResult = computeStagedImpact(root);
    const markdownPath = join(root, 'canon/views/documents/product.mrd.md');

    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await offerDocumentRegeneration(firstResult, root, async () => false);
    log.mockRestore();

    expect(existsSync(markdownPath)).toBe(false);

    // Nothing was staged or written as a side effect of declining — the same
    // staged change produces the identical offer on a second run.
    const secondResult = computeStagedImpact(root);
    expect(secondResult).toEqual(firstResult);
  });
});
