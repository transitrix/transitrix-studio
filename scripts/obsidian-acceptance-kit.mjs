#!/usr/bin/env node
/**
 * Manual acceptance kit for the Obsidian plugin.
 *
 *   prepare  Download the PUBLISHED release assets (main.js, manifest.json,
 *            styles.css), verify them against the release's SHA-256 digests and
 *            build a test vault with the plugin installed, the acceptance notes,
 *            the manual test plan and a report template. Refuses to write into
 *            a non-empty directory and never deletes anything.
 *   check    After testing, re-hash everything: notes (except scratch/) must be
 *            unchanged, plugin files must still equal the release, and the
 *            persisted plugin settings are listed. Writes AUTO-CHECKS.md.
 *
 * Usage:
 *   node scripts/obsidian-acceptance-kit.mjs prepare --out <dir> [--version <x.y.z>] [--repo <owner/name>]
 *   node scripts/obsidian-acceptance-kit.mjs check   --out <dir>
 *
 * Env (optional): GITHUB_TOKEN / GH_TOKEN raises the GitHub API rate limit.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = path.join(ROOT, 'packages', 'obsidian-plugin');
const KIT_DIR = path.join(PLUGIN_DIR, 'acceptance');

export const ASSETS = ['main.js', 'manifest.json', 'styles.css'];
export const PLUGIN_ID = 'transitrix-studio';
export const DEFAULT_REPO = 'transitrix/transitrix-studio-obsidian';
/** Notes under this folder are meant to be edited by the tester. */
export const SCRATCH_PREFIX = 'scratch/';
/** Must stay in sync with MAX_BLOCK_BYTES in the plugin (32 KiB). */
export const OVERSIZE_BYTES = 32 * 1024;

const TAG = '[obsidian-acceptance]';

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function parseSourceCommit(notes) {
  const match = /\/commit\/([0-9a-f]{40})\b/.exec(String(notes ?? ''));
  return match ? match[1] : null;
}

function posix(relative) {
  return relative.split(path.sep).join('/');
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(posix(path.relative(base, full)));
  }
  return out.sort();
}

/** SHA-256 of every note (*.md) in the vault, keyed by vault-relative path. `.obsidian/` is skipped. */
export function hashNotes(vaultDir) {
  const hashes = {};
  for (const rel of listFiles(vaultDir)) {
    if (rel.startsWith('.obsidian/') || !rel.endsWith('.md')) continue;
    hashes[rel] = sha256(readFileSync(path.join(vaultDir, rel)));
  }
  return hashes;
}

/**
 * Compare note hashes taken before and after testing. `scratch/` is excluded
 * from the integrity verdict because the tester edits it on purpose.
 */
export function compareNotes(before, after) {
  const guarded = (rel) => !rel.startsWith(SCRATCH_PREFIX);
  const result = { unchanged: [], changed: [], missing: [], added: [], scratch: {} };
  for (const [rel, hash] of Object.entries(before)) {
    if (!guarded(rel)) {
      result.scratch[rel] = after[rel] === undefined ? 'missing' : after[rel] === hash ? 'unchanged' : 'edited';
    } else if (after[rel] === undefined) result.missing.push(rel);
    else if (after[rel] === hash) result.unchanged.push(rel);
    else result.changed.push(rel);
  }
  for (const rel of Object.keys(after)) {
    if (before[rel] === undefined && guarded(rel)) result.added.push(rel);
  }
  return result;
}

/** The oversize note: one fence of 32 KiB+ (YAML comment), same recipe as the plugin fixture test. */
export function buildOversizeNote() {
  return [
    '# E05 Oversize fence',
    '',
    'Open in **Reading view**. Expected: an error panel saying the source must be at most 32768 bytes. The fence holds just over 32 KiB of YAML comment.',
    '',
    '```transitrix-goals',
    `# ${'x'.repeat(OVERSIZE_BYTES)}`,
    'notation: goals',
    '```',
    '',
  ].join('\n');
}

export function fillTemplate(template, values) {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match);
}

function isEmptyDir(dir) {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

function kitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
}

/**
 * Build the kit from an already downloaded release. Pure with respect to the
 * network, so it can be tested offline.
 *
 * @param {{ out: string, release: { tag_name: string, html_url?: string, body?: string },
 *   assets: Record<string, Buffer>, expectedDigests: Record<string, string>, repo?: string }} input
 */
export function buildKit({ out, release, assets, expectedDigests, repo = DEFAULT_REPO }) {
  const outDir = path.resolve(out);
  if (!isEmptyDir(outDir)) {
    throw new Error(`Output directory must be empty or missing: ${outDir}`);
  }

  const digests = {};
  for (const name of ASSETS) {
    if (!assets[name]) throw new Error(`Release ${release.tag_name} has no asset ${name}`);
    digests[name] = sha256(assets[name]);
    const expected = expectedDigests[name];
    if (!expected) throw new Error(`Release ${release.tag_name} has no SHA-256 digest for ${name}; cannot verify it`);
    if (expected !== digests[name]) {
      throw new Error(`${name} does not match the release digest (expected ${expected}, got ${digests[name]})`);
    }
  }

  const vaultDir = path.join(outDir, 'vault');
  const pluginDir = path.join(vaultDir, '.obsidian', 'plugins', PLUGIN_ID);
  mkdirSync(pluginDir, { recursive: true });
  for (const name of ASSETS) writeFileSync(path.join(pluginDir, name), assets[name]);
  writeFileSync(
    path.join(vaultDir, '.obsidian', 'community-plugins.json'),
    `${JSON.stringify([PLUGIN_ID], null, 2)}\n`,
    'utf8',
  );

  cpSync(path.join(KIT_DIR, 'notes'), vaultDir, { recursive: true });
  mkdirSync(path.join(vaultDir, 'errors'), { recursive: true });
  writeFileSync(path.join(vaultDir, 'errors', 'E05-oversize.md'), buildOversizeNote(), 'utf8');
  mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });

  const manifest = JSON.parse(assets['manifest.json'].toString('utf8'));
  const notes = hashNotes(vaultDir);
  const values = {
    PLUGIN_VERSION: manifest.version,
    RELEASE_URL: release.html_url ?? `https://github.com/${repo}/releases/tag/${release.tag_name}`,
    SOURCE_COMMIT: parseSourceCommit(release.body) ?? 'not recorded in the release notes',
    SHA_MAIN: digests['main.js'],
    SHA_MANIFEST: digests['manifest.json'],
    SHA_STYLES: digests['styles.css'],
    OS: `${os.type()} ${os.release()} (${os.platform()}/${os.arch()})`,
    PREPARED_AT: new Date().toISOString(),
    KIT_COMMIT: kitCommit(),
    VAULT: vaultDir,
  };
  for (const [source, target] of [['MANUAL-TEST.md', 'MANUAL-TEST.md'], ['REPORT-TEMPLATE.md', 'REPORT.md']]) {
    const text = readFileSync(path.join(KIT_DIR, source), 'utf8');
    writeFileSync(path.join(outDir, target), fillTemplate(text, values), 'utf8');
  }

  const kit = {
    schema: 1,
    preparedAt: values.PREPARED_AT,
    kitCommit: values.KIT_COMMIT,
    release: {
      repo,
      version: manifest.version,
      tag: release.tag_name,
      url: values.RELEASE_URL,
      sourceCommit: parseSourceCommit(release.body),
      assets: digests,
    },
    notes,
  };
  writeFileSync(path.join(outDir, 'kit.json'), `${JSON.stringify(kit, null, 2)}\n`, 'utf8');
  return { outDir, vaultDir, kit };
}

export function formatAutoChecks({ kit, pluginFiles, notes, settings, checkedAt }) {
  const mark = (ok) => (ok ? 'PASS' : 'FAIL');
  const pluginOk = pluginFiles.every((f) => f.ok);
  const notesOk = notes.changed.length === 0 && notes.missing.length === 0 && notes.added.length === 0;
  const lines = [
    `# Automatic checks: Transitrix Studio ${kit.release.version}`,
    '',
    `Checked at: ${checkedAt}`,
    `Release: ${kit.release.url}`,
    `Source commit: ${kit.release.sourceCommit ?? 'not recorded'}`,
    `Kit prepared at: ${kit.preparedAt} (commit ${kit.kitCommit})`,
    '',
    `## Plugin files equal the published release: ${mark(pluginOk)}`,
    '',
    '| File | Result | SHA-256 now |',
    '| --- | --- | --- |',
    ...pluginFiles.map((f) => `| ${f.name} | ${mark(f.ok)} | \`${f.actual ?? 'missing'}\` |`),
    '',
    `## Notes unchanged (except scratch/): ${mark(notesOk)}`,
    '',
    `- unchanged: ${notes.unchanged.length}`,
    `- changed: ${notes.changed.length ? notes.changed.join(', ') : 'none'}`,
    `- missing: ${notes.missing.length ? notes.missing.join(', ') : 'none'}`,
    `- added: ${notes.added.length ? notes.added.join(', ') : 'none'}`,
    ...Object.entries(notes.scratch).map(([rel, state]) => `- ${rel} (meant to be edited): ${state}`),
    '',
    '## Persisted plugin settings (data.json)',
    '',
    settings === null
      ? 'No data.json found: the plugin never saved settings (defaults in use).'
      : ['```json', JSON.stringify(settings, null, 2), '```'].join('\n'),
    '',
    `## Verdict: ${mark(pluginOk && notesOk)}`,
    '',
  ];
  return lines.join('\n');
}

export function checkKit({ out }) {
  const outDir = path.resolve(out);
  const kitFile = path.join(outDir, 'kit.json');
  if (!existsSync(kitFile)) throw new Error(`Not a prepared kit (kit.json missing): ${outDir}`);
  const kit = JSON.parse(readFileSync(kitFile, 'utf8'));
  const vaultDir = path.join(outDir, 'vault');
  const pluginDir = path.join(vaultDir, '.obsidian', 'plugins', PLUGIN_ID);

  const pluginFiles = ASSETS.map((name) => {
    const file = path.join(pluginDir, name);
    const actual = existsSync(file) ? sha256(readFileSync(file)) : null;
    return { name, actual, ok: actual === kit.release.assets[name] };
  });
  const notes = compareNotes(kit.notes, hashNotes(vaultDir));
  const dataFile = path.join(pluginDir, 'data.json');
  const settings = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : null;

  const report = formatAutoChecks({ kit, pluginFiles, notes, settings, checkedAt: new Date().toISOString() });
  writeFileSync(path.join(outDir, 'AUTO-CHECKS.md'), report, 'utf8');
  const ok = pluginFiles.every((f) => f.ok)
    && notes.changed.length === 0 && notes.missing.length === 0 && notes.added.length === 0;
  return { ok, report };
}

async function fetchJson(url) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const response = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'transitrix-obsidian-acceptance-kit',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GET ${url} failed: HTTP ${response.status}`);
  return response.json();
}

async function prepare({ out, version, repo }) {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/tags/${version}`);
  const assets = {};
  const expectedDigests = {};
  for (const name of ASSETS) {
    const asset = (release.assets ?? []).find((a) => a.name === name);
    if (!asset) throw new Error(`Release ${version} has no asset ${name}`);
    const response = await fetch(asset.browser_download_url, {
      headers: { 'user-agent': 'transitrix-obsidian-acceptance-kit' },
    });
    if (!response.ok) throw new Error(`Download of ${name} failed: HTTP ${response.status}`);
    assets[name] = Buffer.from(await response.arrayBuffer());
    expectedDigests[name] = typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : '';
  }
  return buildKit({ out, release, assets, expectedDigests, repo });
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, out: '', version: '', repo: DEFAULT_REPO };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (!['--out', '--version', '--repo'].includes(flag)) throw new Error(`Unknown argument: ${flag}`);
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    args[flag.slice(2)] = value;
    i += 1;
  }
  if (!['prepare', 'check'].includes(command)) throw new Error('Usage: obsidian-acceptance-kit.mjs <prepare|check> --out <dir>');
  if (!args.out) throw new Error('--out <dir> is required');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'prepare') {
    const version = args.version
      || JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'manifest.json'), 'utf8')).version;
    const { outDir, vaultDir, kit } = await prepare({ out: args.out, version, repo: args.repo });
    console.log(`${TAG} release ${kit.release.version} downloaded and verified against its SHA-256 digests`);
    console.log(`${TAG} source commit: ${kit.release.sourceCommit ?? 'not recorded'}`);
    console.log(`${TAG} kit:   ${outDir}`);
    console.log(`${TAG} vault: ${vaultDir}`);
    console.log(`${TAG} next:  open "${vaultDir}" as a vault in Obsidian and follow ${path.join(outDir, 'MANUAL-TEST.md')}`);
    return;
  }
  const { ok, report } = checkKit({ out: args.out });
  console.log(report);
  if (!ok) process.exitCode = 1;
}

const isMain = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href,
);
if (isMain) {
  main().catch((err) => {
    console.error(`${TAG} ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
