// `cervin export-compliance` handler (vkgeorgia/strategy#84 Phase 5 + PDF follow-on).
//
// Lives in its own module — separate from cli.ts — because it imports the
// compliance library from `@transitrix/diagrams` *source*. The root emit build
// (`tsconfig.build.json`, `rootDir: src`) cannot emit files outside `src/`, so
// this module is excluded there and loaded by cli.ts via a runtime dynamic
// import (the dev CLI runs through tsx, which transpiles the source on the fly).
// It is still type-checked by `npm run compile` (the root program has no
// rootDir restriction).

import { writeFileSync, readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import {
  emptyCanon,
  ingestComplianceDoc,
  renderComplianceMarkdown,
  renderComplianceHtml,
  renderImpactMatrixHtml,
  buildImpactMatrix,
  parseImpactViewConfig,
  renderImpactMarkdown,
  type ComplianceCanon,
  type ReportScope,
} from '../packages/diagrams/src/compliance/index.js';

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

/**
 * CV-6: loads a named view-config YAML from a registry directory.
 * Tries `<registry>/<id>.compliance-impact.view.yaml` then `<registry>/<id>.yaml`.
 * Falls back to scanning `<root>` for a file whose `id` field matches.
 */
function loadViewConfigRaw(registry: string | undefined, reportId: string, root: string): unknown | null {
  const candidates: string[] = [];
  if (registry) {
    candidates.push(
      path.join(registry, `${reportId}.compliance-impact.view.yaml`),
      path.join(registry, `${reportId}.yaml`),
    );
  }
  // Always try root as fallback
  candidates.push(
    path.join(root, `${reportId}.compliance-impact.view.yaml`),
    path.join(root, `${reportId}.yaml`),
  );
  for (const candidate of candidates) {
    try {
      const raw = yaml.load(readFileSync(candidate, 'utf-8'));
      return raw;
    } catch { /* try next */ }
  }
  // Scan root for a view-config file whose id matches
  try {
    const entries = readdirSync(root, { recursive: true }) as string[];
    for (const rel of entries) {
      if (typeof rel !== 'string') continue;
      if (!/\.ya?ml$/i.test(rel)) continue;
      if (rel.split(/[\\/]/).includes('node_modules')) continue;
      try {
        const raw = yaml.load(readFileSync(path.join(root, rel), 'utf-8'));
        if (raw && typeof raw === 'object') {
          const r = raw as Record<string, unknown>;
          const inner = r.view && typeof r.view === 'object' ? r.view as Record<string, unknown> : r;
          if (inner.id === reportId) return raw;
        }
      } catch { /* skip */ }
    }
  } catch { /* no root scan */ }
  return null;
}

/** Filesystem scan for compliance canon under `root` (mirrors the extension's
 *  workspace scan; classification is the shared `ingestComplianceDoc`). */
function scanCanonFs(root: string): ComplianceCanon {
  const canon = emptyCanon();
  let entries: string[] = [];
  try {
    entries = readdirSync(root, { recursive: true }) as string[];
  } catch {
    return canon;
  }
  for (const rel of entries) {
    if (typeof rel !== 'string' || !/\.ya?ml$/i.test(rel)) continue;
    if (rel.split(/[\\/]/).includes('node_modules')) continue;
    let parsed: unknown;
    try {
      parsed = yaml.load(readFileSync(path.join(root, rel), 'utf-8'));
    } catch {
      continue;
    }
    ingestComplianceDoc(canon, parsed);
  }
  return canon;
}

function parseScope(scopeArg: string | undefined): ReportScope | null {
  if (!scopeArg || scopeArg === 'matrix') return { mode: 'matrix' };
  if (scopeArg === 'gap') return { mode: 'gap' };
  if (scopeArg.startsWith('law:')) return { mode: 'law', id: scopeArg.slice('law:'.length) };
  if (scopeArg.startsWith('product:')) return { mode: 'product', id: scopeArg.slice('product:'.length) };
  return null;
}

/** Bounded wait for WeasyPrint — pathological HTML/CSS must not hang the CLI. */
export const WEASYPRINT_TIMEOUT_MS = 120_000;

/** Invoke `weasyprint <html> <pdf>`. WeasyPrint is a Python tool; we shell out
 *  rather than re-implement PDF generation in JS, matching the engine the
 *  Transitrix site uses for one-pager renders so the styling stays consistent.
 *  Surfaces ENOENT as an installable-prereq message rather than a stack trace. */
export function runWeasyPrint(
  htmlPath: string,
  pdfPath: string,
  opts?: { timeoutMs?: number },
): { ok: true } | { ok: false; message: string } {
  const timeoutMs = opts?.timeoutMs ?? WEASYPRINT_TIMEOUT_MS;
  const candidates = process.platform === 'win32'
    ? ['weasyprint.exe', 'weasyprint']
    : ['weasyprint'];
  let lastErr: NodeJS.ErrnoException | null = null;
  for (const cmd of candidates) {
    const res = spawnSync(cmd, [htmlPath, pdfPath], { encoding: 'utf-8', timeout: timeoutMs });
    if (res.error) {
      const err = res.error as NodeJS.ErrnoException;
      if (err.code === 'ENOENT') {
        lastErr = err;
        continue;
      }
      if (err.code === 'ETIMEDOUT') {
        return {
          ok: false,
          message:
            `weasyprint timed out after ${Math.round(timeoutMs / 1000)}s — ` +
            'the report may be too large or WeasyPrint may be hung.',
        };
      }
      return { ok: false, message: `weasyprint failed to launch: ${err.message}` };
    }
    if (res.status !== 0) {
      const stderr = (res.stderr || '').trim();
      return {
        ok: false,
        message: `weasyprint exited with code ${res.status}${stderr ? `:\n${stderr}` : ''}`,
      };
    }
    return { ok: true };
  }
  return {
    ok: false,
    message:
      'weasyprint executable not found on PATH. ' +
      'PDF export requires WeasyPrint (https://weasyprint.org/) — install it (e.g. `pipx install weasyprint`) and re-run.' +
      (lastErr ? ` Last error: ${lastErr.message}` : ''),
  };
}

function defaultPdfFilename(scope: ReportScope): string {
  switch (scope.mode) {
    case 'matrix': return 'compliance-matrix.pdf';
    case 'gap': return 'compliance-gap.pdf';
    case 'law': return `compliance-${scope.id}.pdf`;
    case 'product': return `compliance-${scope.id}.pdf`;
  }
}

export async function handleExportComplianceCommand(argv: string[]): Promise<void> {
  const format = (flagValue(argv, '--format') ?? 'md').toLowerCase();
  const output = flagValue(argv, '--output');
  const root = flagValue(argv, '--root') ?? process.cwd();
  const reportId = flagValue(argv, '--report');
  const registry = flagValue(argv, '--registry');

  if (format !== 'md' && format !== 'pdf') {
    console.error(`export-compliance: unknown --format '${format}' (expected md or pdf).`);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);

  // ── CV-6 named view-config path ─────────────────────────────────────────
  if (reportId) {
    const rawCfg = loadViewConfigRaw(registry, reportId, root);
    if (!rawCfg) {
      console.error(`export-compliance: view-config '${reportId}' not found. Searched${registry ? ` registry '${registry}'` : ''} and root '${root}'.`);
      process.exit(1);
    }
    const parseResult = parseImpactViewConfig(rawCfg);
    if (!parseResult.ok) {
      console.error(`export-compliance: view-config '${reportId}' is invalid:\n${parseResult.errors.map(e => `  - ${e}`).join('\n')}`);
      process.exit(1);
    }
    const viewConfig = parseResult.config;
    console.error(`[export-compliance] report: ${viewConfig.id} | format: ${format}`);
    const canon = scanCanonFs(root);
    // Auto-fill products if not specified in the view config
    const effectiveProducts = viewConfig.subjects?.products?.length
      ? viewConfig.subjects.products
      : canon.products.map(p => p.id).sort();
    const matrix = buildImpactMatrix(
      canon,
      { ...viewConfig, subjects: { ...viewConfig.subjects, products: effectiveProducts } },
    );

    if (format === 'md') {
      const markdown = renderImpactMarkdown(matrix);
      if (output) { writeFileSync(output, markdown, 'utf-8'); console.error(`Wrote ${output}`); }
      else { process.stdout.write(markdown); }
      return;
    }
    // format === 'pdf'
    const html = renderImpactMatrixHtml(matrix, { today });
    const pdfPath = output ?? `compliance-impact-${viewConfig.id}.pdf`;
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'transitrix-export-'));
    const htmlPath = path.join(tmpDir, 'report.html');
    try {
      writeFileSync(htmlPath, html, 'utf-8');
      const result = runWeasyPrint(htmlPath, pdfPath);
      if (!result.ok) { console.error(`export-compliance: ${result.message}`); process.exit(1); }
      console.error(`Wrote ${pdfPath}`);
    } finally {
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort */ }
    }
    return;
  }

  // ── Legacy --scope path (Phase 5) ──────────────────────────────────────
  const scope = parseScope(flagValue(argv, '--scope'));
  if (scope === null) {
    console.error('export-compliance: unknown --scope (expected law:<LAW-ID>, product:<PRODUCT-ID>, gap, or omit for the full matrix). Use --report <id> for named view-config.');
    process.exit(1);
  }

  const canon = scanCanonFs(root);

  if (format === 'md') {
    const markdown = renderComplianceMarkdown(canon, scope, { today });
    if (output) {
      writeFileSync(output, markdown, 'utf-8');
      console.error(`Wrote ${output}`);
    } else {
      process.stdout.write(markdown);
    }
    return;
  }

  // format === 'pdf'
  const html = renderComplianceHtml(canon, scope, { today });
  const pdfPath = output ?? defaultPdfFilename(scope);
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'transitrix-export-'));
  const htmlPath = path.join(tmpDir, 'report.html');
  try {
    writeFileSync(htmlPath, html, 'utf-8');
    const result = runWeasyPrint(htmlPath, pdfPath);
    if (!result.ok) {
      console.error(`export-compliance: ${result.message}`);
      process.exit(1);
    }
    console.error(`Wrote ${pdfPath}`);
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
  }
}
