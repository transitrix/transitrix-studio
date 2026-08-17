// `transitrix render` — renders a `.ttrs` document end-to-end (Pass 1 + Pass
// 2 + Markdown + PDF + a run-record) and writes the result to disk
// (transitrix-hq#186). A building block for transitrix-hq#182's per-artefact
// regeneration offer — non-interactive, scriptable, no TTY prompt of its own.
//
// No `fill` hook is supplied to Pass 2: this CLI is not itself an agent, and
// the vendored pass2.mjs's own contract is that an omitted `fill` resolves
// every instruction slot `not-attempted` and behaves like Pass 1 alone —
// unfilled and visible, never silently dropped. That keeps this command
// deterministic the same way Pass 1 already is: same source, same Markdown
// and PDF bytes, every run (the run-record's own `run_timestamp` is the one
// field that legitimately varies — recording when a run happened is its
// purpose, not something byte-identity claims apply to).

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

// Vendored from methodology — see scripts/vendor-methodology-document-renderer.mjs
// and tests/document-renderer-vendor.test.ts for the integrity check that
// keeps these import targets trustworthy. Typed by the co-located *.d.mts
// files (vendor/methodology/document-renderer/) — Studio's own type
// contracts for the vendored JS, not part of what's fetched.
import { runPass1 } from '../vendor/methodology/document-renderer/pass1.mjs';
import { runPass2 } from '../vendor/methodology/document-renderer/pass2.mjs';
import { renderMarkdownToPdf } from '../vendor/methodology/document-renderer/render-pdf.mjs';
import { buildRunRecord, serializeRunRecord } from '../vendor/methodology/document-renderer/run-record.mjs';

export interface RenderDocumentOptions {
  /** The `.ttrs` source to render. */
  path: string;
  /** Directory the three output files are written into. Default: alongside the source. */
  outDir?: string;
  /** Repository root `git rev-parse HEAD` is read from for the run-record's
   *  `repository_commit`. Default: the source file's directory. */
  root?: string;
  /** Overrides the run-record's `run_timestamp` — for deterministic tests
   *  only; a real render leaves this to `run-record.mjs`'s own `Date.now()` default. */
  runTimestamp?: string;
}

export interface RenderDocumentResult {
  ok: boolean;
  templateId: string | null;
  markdownPath: string;
  pdfPath: string;
  runRecordPath: string;
  errors: { code: string; message: string }[];
}

/** `git rev-parse HEAD` at `root`, or `null` when it isn't a git repository —
 *  matches export-compliance.ts's own `gitCommit`, duplicated rather than
 *  imported since that module is excluded from the root emit build. */
function gitCommitOf(root: string): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Renders `options.path` end to end and writes three files next to each
 * other: `<basename>.md`, `<basename>.pdf`, `<basename>.run-record.json`.
 *
 * Pass 1 runs `profile: 'strict'` (its own default) — a render persisted to
 * disk fails closed on an unresolved reference rather than rendering it as a
 * visible-but-wrong marker for a reader who may never open the source
 * template to see the warning. That is a deliberate difference from the live
 * `.ttrs` preview (extension/src/ttrs-preview.ts), which runs `review` so an
 * in-progress document stays viewable while it's being written.
 */
export async function renderDocumentToDisk(options: RenderDocumentOptions): Promise<RenderDocumentResult> {
  const srcPath = path.resolve(options.path);
  const text = readFileSync(srcPath, 'utf8');
  const outDir = options.outDir ? path.resolve(options.outDir) : path.dirname(srcPath);
  const repoRoot = options.root ? path.resolve(options.root) : path.dirname(srcPath);

  const pass1Result = await runPass1({ text, templatePath: srcPath, profile: 'strict' });

  const pass2Result = pass1Result.header
    ? await runPass2({ markdown: pass1Result.markdown, instructionSlots: pass1Result.instructionSlots })
    : { markdown: pass1Result.markdown, slotResults: [] };

  const baseName = path.basename(srcPath).replace(/\.ttrs$/i, '');
  const markdownPath = path.join(outDir, `${baseName}.md`);
  const pdfPath = path.join(outDir, `${baseName}.pdf`);
  const runRecordPath = path.join(outDir, `${baseName}.run-record.json`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(markdownPath, pass2Result.markdown, 'utf8');
  writeFileSync(pdfPath, renderMarkdownToPdf(pass2Result.markdown));

  // A run that never got past a missing `---` front matter has no header to
  // build a run-record from (run-record.mjs throws on `header: null`) — the
  // Markdown/PDF above still carry pass 1's own error text, so the failure is
  // visible in the persisted artefacts, not just in `errors` below.
  if (pass1Result.header) {
    const record = buildRunRecord({
      header: pass1Result.header,
      repositoryCommit: gitCommitOf(repoRoot),
      modelId: null,
      runTimestamp: options.runTimestamp,
      renderDate: pass1Result.renderDate,
      profile: pass1Result.profile,
      slotResults: pass2Result.slotResults,
    });
    writeFileSync(runRecordPath, serializeRunRecord(record), 'utf8');
  }

  return {
    ok: pass1Result.ok,
    templateId: pass1Result.header?.template_id ?? null,
    markdownPath,
    pdfPath,
    runRecordPath,
    errors: pass1Result.errors,
  };
}

export async function handleRenderCommand(argv: string[]): Promise<void> {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.error('usage: transitrix render <input.ttrs> [--out <dir>] [--root <dir>] [--json]');
    process.exit(0);
  }
  const useJson = argv.includes('--json');

  function flagValue(name: string): string | undefined {
    const i = argv.indexOf(name);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
  }

  const positional = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--out' && argv[i - 1] !== '--root');
  const [src] = positional;
  if (!src) {
    console.error('transitrix render: missing input file');
    console.error('usage: transitrix render <input.ttrs> [--out <dir>] [--root <dir>] [--json]');
    process.exit(1);
  }

  const result = await renderDocumentToDisk({
    path: src,
    outDir: flagValue('--out'),
    root: flagValue('--root'),
  });

  if (useJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`✓ ${src} → ${result.markdownPath}, ${result.pdfPath}, ${result.runRecordPath}`);
  } else {
    console.error(`✗ ${src}`);
    for (const e of result.errors) {
      console.error(`  ${e.code}: ${e.message}`);
    }
  }

  if (!result.ok) {
    process.exit(1);
  }
}
