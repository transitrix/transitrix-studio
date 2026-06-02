// `cervin export-compliance` handler (vkgeorgia/strategy#84 Phase 5).
//
// Lives in its own module — separate from cli.ts — because it imports the
// compliance library from `@transitrix/diagrams` *source*. The root emit build
// (`tsconfig.build.json`, `rootDir: src`) cannot emit files outside `src/`, so
// this module is excluded there and loaded by cli.ts via a runtime dynamic
// import (the dev CLI runs through tsx, which transpiles the source on the fly).
// It is still type-checked by `npm run compile` (the root program has no
// rootDir restriction).

import { writeFileSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  emptyCanon,
  ingestComplianceDoc,
  renderComplianceMarkdown,
  type ComplianceCanon,
  type ReportScope,
} from '../packages/diagrams/src/compliance/index.js';

function flagValue(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
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

export async function handleExportComplianceCommand(argv: string[]): Promise<void> {
  const format = (flagValue(argv, '--format') ?? 'md').toLowerCase();
  const output = flagValue(argv, '--output');
  const root = flagValue(argv, '--root') ?? process.cwd();
  const scope = parseScope(flagValue(argv, '--scope'));

  if (scope === null) {
    console.error('export-compliance: unknown --scope (expected law:<LAW-ID>, product:<PRODUCT-ID>, gap, or omit for the full matrix).');
    process.exit(1);
  }
  if (format === 'pdf') {
    console.error('export-compliance: PDF export is the Phase 5 follow-on (WeasyPrint, A4 branded). Use --format md for now.');
    process.exit(1);
  }
  if (format !== 'md') {
    console.error(`export-compliance: unknown --format '${format}' (expected md or pdf).`);
    process.exit(1);
  }

  const canon = scanCanonFs(root);
  const today = new Date().toISOString().slice(0, 10);
  const markdown = renderComplianceMarkdown(canon, scope, { today });

  if (output) {
    writeFileSync(output, markdown, 'utf-8');
    console.error(`Wrote ${output}`);
  } else {
    process.stdout.write(markdown);
  }
}
