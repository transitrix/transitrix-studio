#!/usr/bin/env node
/**
 * Sync the organizations/acme_corp mirror against the transitrix/acme-corp
 * reference-adopter repository.
 *
 * Default behaviour is a dry run that prints the diff between the source
 * repo and the local mirror. Pass --apply to copy added/changed files.
 * Pass --apply --delete-stale to also remove mirror files that have no
 * counterpart in the source repo.
 *
 * When --apply is used, organizations/acme_corp/.source-version is updated
 * with the HEAD commit of the source checkout so the pin stays current.
 *
 * Usage:
 *   node scripts/sync-acme-corp.mjs
 *   node scripts/sync-acme-corp.mjs --from ../acme-corp
 *   node scripts/sync-acme-corp.mjs --apply
 *   node scripts/sync-acme-corp.mjs --apply --delete-stale
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STUDIO_ROOT = path.resolve(HERE, '..');
const MIRROR_ROOT = path.join(STUDIO_ROOT, 'organizations', 'acme_corp');
const SOURCE_VERSION_FILE = path.join(MIRROR_ROOT, '.source-version');

// Paths excluded from sync relative to the source repo root.
// .git/ is always skipped by the walker; .archive/ is preserved locally
// (kept untouched so local-only archival content is not clobbered).
const EXCLUDE_DIRS = new Set(['.git', '.archive']);
// Files that live only in the mirror (studio-side artefacts) — never stale.
const MIRROR_ONLY_FILES = new Set(['.source-version']);

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
        `Usage: node scripts/sync-acme-corp.mjs [options]
  --from <path>     acme-corp repo root (default: ../acme-corp)
  --apply           copy added/changed files (default: dry-run)
  --delete-stale    also remove mirror files with no source counterpart
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

async function walk(root, excludeDirs = EXCLUDE_DIRS) {
  const out = [];
  async function go(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!excludeDirs.has(e.name)) await go(path.join(dir, e.name));
      } else if (e.isFile()) {
        out.push(path.join(dir, e.name));
      }
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

function headCommit(repoPath) {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const srcRoot = path.resolve(
    args.from ?? path.join(STUDIO_ROOT, '..', 'acme-corp'),
  );

  if (!(await exists(srcRoot))) {
    console.error(
      `acme-corp source not found: ${srcRoot}\n` +
        `Pass --from <path-to-acme-corp-checkout> if the repo lives somewhere else.`,
    );
    process.exit(2);
  }

  const srcFiles = await walk(srcRoot);
  const dstFiles = await walk(MIRROR_ROOT);

  const srcRel = new Set(srcFiles.map((p) => relForward(srcRoot, p)));
  const dstRel = new Set(dstFiles.map((p) => relForward(MIRROR_ROOT, p)));

  const plan = { add: [], update: [], skip: [], stale: [] };

  for (const rel of [...srcRel].sort()) {
    if (!dstRel.has(rel)) {
      plan.add.push(rel);
      continue;
    }
    const sBytes = await fs.readFile(path.join(srcRoot, rel), 'utf-8');
    const dBytes = await fs.readFile(path.join(MIRROR_ROOT, rel), 'utf-8');
    if (normalizeLineEndings(sBytes) === normalizeLineEndings(dBytes)) {
      plan.skip.push(rel);
    } else {
      plan.update.push(rel);
    }
  }

  for (const rel of [...dstRel].sort()) {
    if (!srcRel.has(rel) && !MIRROR_ONLY_FILES.has(path.basename(rel))) {
      plan.stale.push(rel);
    }
  }

  const commit = headCommit(srcRoot);
  console.log(`SYNC PLAN — acme-corp → organizations/acme_corp`);
  console.log(`  source:  ${srcRoot}${commit ? ` @ ${commit.slice(0, 7)}` : ''}`);
  console.log(`  mirror:  ${MIRROR_ROOT}`);
  console.log('');
  for (const rel of plan.add) console.log(`  ADD     ${rel}`);
  for (const rel of plan.update) console.log(`  UPDATE  ${rel}`);
  for (const rel of plan.skip) console.log(`  SKIP    ${rel}`);
  for (const rel of plan.stale) console.log(`  STALE   ${rel}`);
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
    const dst = path.join(MIRROR_ROOT, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(path.join(srcRoot, rel), dst);
    console.log(`  + ${rel}`);
  }
  for (const rel of plan.update) {
    const dst = path.join(MIRROR_ROOT, rel);
    await fs.copyFile(path.join(srcRoot, rel), dst);
    console.log(`  ~ ${rel}`);
  }
  if (args.deleteStale) {
    for (const rel of plan.stale) {
      const dst = path.join(MIRROR_ROOT, rel);
      await fs.unlink(dst);
      console.log(`  - ${rel}`);
    }
  } else if (plan.stale.length > 0) {
    console.log(
      `(${plan.stale.length} stale file(s) left untouched — pass --delete-stale to remove.)`,
    );
  }

  if (commit) {
    const today = new Date().toISOString().slice(0, 10);
    await fs.writeFile(
      SOURCE_VERSION_FILE,
      `version: 1\nsource_repo: transitrix/acme-corp\nsource_commit: ${commit}\nsynced_at: "${today}"\n`,
      'utf-8',
    );
    console.log(`  pin updated → .source-version @ ${commit.slice(0, 7)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
