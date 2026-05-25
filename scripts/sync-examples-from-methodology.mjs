#!/usr/bin/env node
/**
 * Sync canonical example files from the transitrix/methodology repo into
 * this Studio repo. Both folders share the same role: per-notation
 * example YAMLs used by the spec, by the extension's example folder,
 * and by the conformance tests in packages/diagrams/src/<notation>/__tests__/.
 *
 * Default behaviour is a dry run that prints the diff between
 * <methodology>/notations/examples/ and <studio>/examples/. Pass
 * --apply to copy added/changed files. Pass --apply --delete-stale to
 * also remove files in <studio>/examples/ that have no counterpart in
 * methodology — a strict mirror.
 *
 * Stale detection scans both `.transitrix.yaml` files and the legacy
 * `.bpmn.yaml` files Studio still ships, so the BPMN extension drift
 * surfaces explicitly in the plan instead of hiding behind a filename
 * filter. Whether to remove those files is a separate policy call
 * (still waiting on the BPMN extension decision documented in the
 * methodology repo's NOTATIONS_VALIDATION.md §1.1) — the script reports,
 * the human decides.
 *
 * Usage:
 *   node scripts/sync-examples-from-methodology.mjs
 *   node scripts/sync-examples-from-methodology.mjs --from ../methodology
 *   node scripts/sync-examples-from-methodology.mjs --apply
 *   node scripts/sync-examples-from-methodology.mjs --apply --delete-stale
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(HERE, '..');

function parseArgs(argv) {
  const out = { apply: false, deleteStale: false, from: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') out.apply = true;
    else if (a === '--delete-stale') out.deleteStale = true;
    else if (a === '--from') out.from = argv[++i];
    else if (a.startsWith('--from=')) out.from = a.slice('--from='.length);
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/sync-examples-from-methodology.mjs [options]
  --from <path>     methodology repo root (default: ../methodology)
  --apply           copy added/changed files (default: dry-run)
  --delete-stale    also remove Studio files with no methodology counterpart
                    (only meaningful with --apply)
  -h, --help        show this help`,
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function walk(root, predicate) {
  const out = [];
  async function go(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await go(full);
      else if (e.isFile() && predicate(full)) out.push(full);
    }
  }
  await go(root);
  return out;
}

function normalizeLineEndings(s) {
  return s.replace(/\r\n/g, '\n');
}

function relForward(from, full) {
  return path.relative(from, full).replace(/\\/g, '/');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const methodologyRoot = path.resolve(
    args.from ?? path.join(STUDIO_ROOT, '..', 'methodology'),
  );
  const srcRoot = path.join(methodologyRoot, 'notations', 'examples');
  const dstRoot = path.join(STUDIO_ROOT, 'examples');

  if (!(await exists(srcRoot))) {
    console.error(
      `methodology examples not found: ${srcRoot}\n` +
        `Pass --from <path-to-methodology-checkout> if the repo lives somewhere else.`,
    );
    process.exit(2);
  }

  // Source scope: every *.transitrix.yaml under <methodology>/notations/examples/
  const srcFiles = await walk(srcRoot, (p) => p.endsWith('.transitrix.yaml'));
  // Destination scope: every *.transitrix.yaml AND every *.bpmn.yaml (legacy)
  // under <studio>/examples/ — so stale detection covers both forms.
  const dstFiles = await walk(
    dstRoot,
    (p) => p.endsWith('.transitrix.yaml') || p.endsWith('.bpmn.yaml'),
  );

  const srcRel = new Set(srcFiles.map((p) => relForward(srcRoot, p)));
  const dstRel = new Set(dstFiles.map((p) => relForward(dstRoot, p)));

  const plan = { add: [], update: [], skip: [], stale: [] };

  for (const rel of [...srcRel].sort()) {
    if (!dstRel.has(rel)) {
      plan.add.push(rel);
      continue;
    }
    const sBytes = await fs.readFile(path.join(srcRoot, rel), 'utf-8');
    const dBytes = await fs.readFile(path.join(dstRoot, rel), 'utf-8');
    if (normalizeLineEndings(sBytes) === normalizeLineEndings(dBytes)) {
      plan.skip.push(rel);
    } else {
      plan.update.push(rel);
    }
  }

  for (const rel of [...dstRel].sort()) {
    if (!srcRel.has(rel)) plan.stale.push(rel);
  }

  console.log(`SYNC PLAN — methodology examples → studio examples`);
  console.log(`  methodology: ${srcRoot}`);
  console.log(`  studio:      ${dstRoot}`);
  console.log('');
  for (const rel of plan.add) console.log(`  ADD     examples/${rel}`);
  for (const rel of plan.update) console.log(`  UPDATE  examples/${rel}`);
  for (const rel of plan.skip) console.log(`  SKIP    examples/${rel}`);
  for (const rel of plan.stale) console.log(`  STALE   examples/${rel}`);
  console.log('');
  console.log(
    `Summary: ${plan.add.length} to add, ${plan.update.length} to update, ` +
      `${plan.skip.length} identical, ${plan.stale.length} stale.`,
  );

  if (!args.apply) {
    console.log(
      `Dry run. Pass --apply to copy added/changed files; ` +
        `--apply --delete-stale also removes stale files.`,
    );
    return;
  }

  for (const rel of plan.add) {
    const dst = path.join(dstRoot, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(path.join(srcRoot, rel), dst);
    console.log(`  + ${rel}`);
  }
  for (const rel of plan.update) {
    const dst = path.join(dstRoot, rel);
    await fs.copyFile(path.join(srcRoot, rel), dst);
    console.log(`  ~ ${rel}`);
  }
  if (args.deleteStale) {
    for (const rel of plan.stale) {
      const dst = path.join(dstRoot, rel);
      await fs.unlink(dst);
      console.log(`  - ${rel}`);
    }
  } else if (plan.stale.length > 0) {
    console.log(
      `(${plan.stale.length} stale file(s) left untouched — pass --delete-stale to remove.)`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
