// `transitrix validate --scope=repo` handler (vkgeorgia/transitrix-studio#141).
//
// Lives in its own module — separate from cli.ts — because it imports the
// repo-scope validator from `@transitrix/diagrams` *source*. The root emit build
// (`tsconfig.build.json`, `rootDir: src`) cannot emit files outside `src/`, so
// this module is excluded there and loaded by cli.ts via a runtime dynamic
// import (same pattern as export-compliance.ts). It is still type-checked by
// `npm run compile` (the root program has no rootDir restriction).
//
// The filesystem walk lives here (IO); the checks live in the pure
// `validateRepoModel` so they stay testable and shared.

import { readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import {
  validateRepoModel,
  type RepoDoc,
  type RepoFinding,
  type RepoModelInput,
} from '../packages/diagrams/src/repo-validate/index.js';

/** Directory segments that are tooling/scaffolding, never canon content.
 *  Mirrors lint.py, which skips `.templates/` and `.validators/`. */
const SKIP_SEGMENTS = new Set(['node_modules', '.templates', '.validators']);

function segments(rel: string): string[] {
  return rel.split(/[\\/]/);
}

function isYaml(rel: string): boolean {
  return /\.ya?ml$/i.test(rel);
}

function shouldSkip(rel: string): boolean {
  return segments(rel).some((s) => SKIP_SEGMENTS.has(s));
}

/** Read + parse one YAML file into a RepoDoc, capturing parse errors. */
function readDoc(root: string, rel: string): RepoDoc {
  try {
    const parsed = yaml.load(readFileSync(path.join(root, rel), 'utf-8'));
    const data =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    return { path: rel.replace(/\\/g, '/'), data };
  } catch (e) {
    const err = e as Error;
    return { path: rel.replace(/\\/g, '/'), data: null, parseError: err.message };
  }
}

/** Collect canon docs under `<root>/canon/<zone>/**` exactly as lint.py globs
 *  them: elements from `canon/elements/**`, relations from `canon/relations/**`.
 *  Partitioning by zone (not by `notation`) keeps parity with the reference
 *  linter's element/relation universe. */
export function loadRepoModel(root: string): RepoModelInput {
  const elements: RepoDoc[] = [];
  const relations: RepoDoc[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(path.join(root, 'canon'), { recursive: true }) as string[];
  } catch {
    return { elements, relations };
  }

  for (const rel of entries) {
    if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
    const segs = segments(rel);
    const zone = segs[0]; // first segment under canon/
    const fullRel = path.join('canon', rel);
    if (zone === 'elements') {
      elements.push(readDoc(root, fullRel));
    } else if (zone === 'relations') {
      relations.push(readDoc(root, fullRel));
    }
  }

  return { elements, relations };
}

/** Load the canon model under `root` and run the repo-scope checks. */
export function runRepoValidate(root: string): RepoFinding[] {
  return validateRepoModel(loadRepoModel(root));
}

/** Print findings (human or JSON). Returns nothing; the caller sets exit code. */
export function reportRepoFindings(root: string, findings: RepoFinding[], useJson: boolean): void {
  if (useJson) {
    console.log(
      JSON.stringify(
        { scope: 'repo', root, valid: findings.length === 0, findings },
        null,
        2,
      ),
    );
    return;
  }

  if (findings.length === 0) {
    console.log(`✓ ${root} — repo-scope validation passed`);
    console.log();
    return;
  }

  console.log();
  console.log(`✗ ${root}`);
  console.log();
  console.log('Repo-scope validation:');
  for (const f of findings) {
    const where = f.id ? f.id : '(file)';
    console.log(`  \x1b[31m✗ ${where}\x1b[0m ${f.message}`);
  }
  console.log();
  console.log(
    `Repo-scope validation: \x1b[31m${findings.length} finding${findings.length === 1 ? '' : 's'}\x1b[0m`,
  );
  console.log();
}
