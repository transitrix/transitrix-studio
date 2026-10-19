#!/usr/bin/env node
/**
 * Mirror the Obsidian plugin into transitrix/transitrix-studio-obsidian and
 * create a GitHub Release when manifest.version has no matching tag yet.
 *
 * The mirror carries plugin sources, demos, manifest, versions.json, styles,
 * README and LICENSE. It is not a standalone build: main.js bundles
 * @transitrix/diagrams from this monorepo, so it ships only as a Release asset
 * and each release note links the exact source commit.
 *
 * Everything in the community repo except `.git/` and `.github/` is replaced
 * on every sync.
 *
 * Prerequisites: run `npm run package:obsidian-plugin` first (produces
 * output/obsidian-plugin/{main.js,manifest.json,styles.css}).
 *
 * Usage:
 *   node scripts/sync-obsidian-community.mjs [--dry-run] [--force-release] [--staging <dir>]
 *
 * Env:
 *   OBSIDIAN_PLUGIN_DEPLOY_TOKEN  PAT/App token with contents:write on the
 *                                 community repo (required unless --dry-run)
 *   OBSIDIAN_COMMUNITY_REPO       default: transitrix/transitrix-studio-obsidian
 *   GITHUB_SHA                    optional source commit for release notes
 *   GITHUB_SERVER_URL             optional, default https://github.com
 */

import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_DIR = path.join(ROOT, 'output');
const PLUGIN_DIR = path.join(ROOT, 'packages', 'obsidian-plugin');
const PACKAGE_DIR = path.join(OUTPUT_DIR, 'obsidian-plugin');
const DEFAULT_STAGING = path.join(OUTPUT_DIR, 'obsidian-community-mirror');
const DEFAULT_REPO = 'transitrix/transitrix-studio-obsidian';
const SOURCE_REPO = 'transitrix/transitrix-studio';

const RELEASE_ASSETS = ['main.js', 'manifest.json', 'styles.css'];
/** Kept in the community repo across syncs. */
const PRESERVED_ENTRIES = new Set(['.git', '.github']);
const MAINTAINER_START = '<!-- maintainer:start -->';
const MAINTAINER_END = '<!-- maintainer:end -->';
const SEMVER = /^\d+\.\d+\.\d+$/;

const TAG = '[sync-obsidian]';

function parseArgs(argv) {
  const args = {
    dryRun: false,
    forceRelease: false,
    staging: DEFAULT_STAGING,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force-release') args.forceRelease = true;
    else if (arg === '--staging') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error('--staging requires a path');
      args.staging = path.resolve(value);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/** Staging is wiped before every build, so it must be a subdirectory of output/. */
export function assertSafeStagingDir(dir) {
  const resolved = path.resolve(dir);
  const rel = path.relative(OUTPUT_DIR, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Staging directory must be inside ${OUTPUT_DIR}: ${resolved}`);
  }

  // The staging tree is deleted recursively below. A lexical containment check
  // is not sufficient because an existing symlink below output/ can redirect
  // that removal outside the repository. Walk every existing component and
  // refuse links (including a link used as the staging directory itself).
  // The nearest existing component must also canonicalise inside output/.
  const components = [OUTPUT_DIR];
  for (const segment of rel.split(path.sep)) {
    components.push(path.join(components.at(-1), segment));
  }

  let nearestExisting = null;
  for (const current of components) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch (err) {
      if (err?.code === 'ENOENT') break;
      throw err;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Staging directory must not contain symbolic links: ${current}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Staging path component must be a directory: ${current}`);
    }
    nearestExisting = current;
  }

  if (nearestExisting && nearestExisting !== OUTPUT_DIR) {
    const realOutput = realpathSync(OUTPUT_DIR);
    const realNearest = realpathSync(nearestExisting);
    const realRel = path.relative(realOutput, realNearest);
    if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
      throw new Error(`Staging directory resolves outside ${realOutput}: ${realNearest}`);
    }
  }
  return resolved;
}

/** Remove maintainer-only README sections; fails on unbalanced markers. */
export function stripMaintainerSections(markdown) {
  let out = '';
  let rest = markdown;
  for (;;) {
    const start = rest.indexOf(MAINTAINER_START);
    const end = rest.indexOf(MAINTAINER_END);
    if (start === -1 && end === -1) break;
    if (start === -1 || end === -1 || end < start) {
      throw new Error('README maintainer markers are unbalanced');
    }
    out += rest.slice(0, start);
    rest = rest.slice(end + MAINTAINER_END.length);
  }
  return `${out}${rest}`.replace(/\n{3,}/g, '\n\n');
}

/**
 * Obsidian resolves installs by the manifest version tag; versions.json maps
 * each version to its minAppVersion.
 */
export function validateReleaseMetadata({ manifest, versions, pkg }) {
  const errors = [];
  const version = manifest?.version;
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    errors.push(`manifest.json version must be x.y.z, got ${JSON.stringify(version)}`);
  }
  if (pkg?.version !== version) {
    errors.push(`package.json version ${JSON.stringify(pkg?.version)} must equal manifest.json version ${JSON.stringify(version)}`);
  }
  if (versions?.[version] !== manifest?.minAppVersion) {
    errors.push(`versions.json must map ${JSON.stringify(version)} to minAppVersion ${JSON.stringify(manifest?.minAppVersion)}`);
  }
  if (errors.length > 0) {
    throw new Error(`Release metadata is inconsistent:\n  - ${errors.join('\n  - ')}`);
  }
  return version;
}

function assertPackaged(packageDir, pluginDir) {
  for (const name of RELEASE_ASSETS) {
    const file = path.join(packageDir, name);
    if (!existsSync(file)) {
      throw new Error(`Missing ${file}. Run \`npm run package:obsidian-plugin\` before syncing.`);
    }
  }
  const packaged = readFileSync(path.join(packageDir, 'manifest.json'), 'utf8');
  const source = readFileSync(path.join(pluginDir, 'manifest.json'), 'utf8');
  if (packaged !== source) {
    throw new Error('Packaged manifest.json is stale. Re-run `npm run package:obsidian-plugin`.');
  }
}

function copySourcesWithoutTests(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => path.basename(src) !== '__tests__',
  });
}

/**
 * Build the community-repo tree. main.js is excluded — it ships only as a
 * Release asset. manifest.json and styles.css are the packaged files, so the
 * repo and the Release carry identical bytes.
 */
export function buildCommunityMirror({
  stagingDir = DEFAULT_STAGING,
  packageDir = PACKAGE_DIR,
  pluginDir = PLUGIN_DIR,
} = {}) {
  const staging = assertSafeStagingDir(stagingDir);
  assertPackaged(packageDir, pluginDir);

  const manifest = readJson(path.join(packageDir, 'manifest.json'));
  const version = validateReleaseMetadata({
    manifest,
    versions: readJson(path.join(pluginDir, 'versions.json')),
    pkg: readJson(path.join(pluginDir, 'package.json')),
  });

  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  copySourcesWithoutTests(path.join(pluginDir, 'src'), path.join(staging, 'src'));
  cpSync(path.join(pluginDir, 'demo'), path.join(staging, 'demo'), { recursive: true });
  copyFileSync(path.join(pluginDir, 'versions.json'), path.join(staging, 'versions.json'));
  copyFileSync(path.join(packageDir, 'manifest.json'), path.join(staging, 'manifest.json'));
  copyFileSync(path.join(packageDir, 'styles.css'), path.join(staging, 'styles.css'));
  copyFileSync(path.join(ROOT, 'LICENSE'), path.join(staging, 'LICENSE'));

  const banner = [
    '# Transitrix Studio',
    '',
    '> **Distribution repository** for the Obsidian Desktop plugin.',
    `> Source of truth, build and tests live in [\`${SOURCE_REPO}\`](https://github.com/${SOURCE_REPO})`,
    '> (`packages/obsidian-plugin`). `main.js` is attached to each GitHub Release here',
    '> and its release note links the exact source commit. Please open issues and',
    '> pull requests against the monorepo.',
    '',
  ].join('\n');
  const readme = readFileSync(path.join(pluginDir, 'README.md'), 'utf8');
  const body = stripMaintainerSections(readme).replace(/^#\s+Transitrix Studio\s*\n+/, '');
  writeFileSync(path.join(staging, 'README.md'), `${banner}\n${body}`, 'utf8');

  writeFileSync(
    path.join(staging, '.gitignore'),
    ['node_modules/', 'dist/', 'main.js', '*.js.map', '.DS_Store', ''].join('\n'),
    'utf8',
  );

  return { stagingDir: staging, version, minAppVersion: manifest.minAppVersion };
}

function listFilesRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFilesRecursive(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

/** Credentials travel in env vars, never in argv or remote URLs that errors echo. */
function gitAuthEnv(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
    GIT_TERMINAL_PROMPT: '0',
  };
}

export function redactSecrets(text, token) {
  if (!token) return text;
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return String(text).split(token).join('***').split(basic).join('***');
}

function git(args, { cwd, env, stdio = 'pipe' } = {}) {
  return execFileSync('git', args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio,
  });
}

function gh(args, { env, stdio = 'pipe' } = {}) {
  return execFileSync('gh', args, {
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio,
  });
}

function releaseExists(repo, version, env) {
  try {
    gh(['api', `repos/${repo}/releases/tags/${version}`], { env });
    return true;
  } catch (err) {
    if (/HTTP 404/.test(String(err?.stderr ?? ''))) return false;
    throw err;
  }
}

function syncGitRepo({ stagingDir, repo, token, sourceSha }) {
  const cloneDir = mkdtempSync(path.join(tmpdir(), 'obsidian-community-'));
  const env = gitAuthEnv(token);
  try {
    git(['clone', '--depth', '1', `https://github.com/${repo}.git`, cloneDir], { env });

    for (const name of readdirSync(cloneDir)) {
      if (PRESERVED_ENTRIES.has(name)) continue;
      rmSync(path.join(cloneDir, name), { recursive: true, force: true });
    }
    cpSync(stagingDir, cloneDir, { recursive: true });

    git(['config', 'user.name', 'github-actions[bot]'], { cwd: cloneDir });
    git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], {
      cwd: cloneDir,
    });
    git(['add', '-A'], { cwd: cloneDir });

    const status = git(['status', '--porcelain'], { cwd: cloneDir }).trim();
    if (status) {
      const short = sourceSha ? sourceSha.slice(0, 7) : 'local';
      git(['commit', '-m', `chore: sync from ${SOURCE_REPO}@${short}`], { cwd: cloneDir });
      git(['push', 'origin', 'HEAD'], { cwd: cloneDir, env, stdio: 'inherit' });
      console.log(`${TAG} pushed mirror to ${repo}`);
    } else {
      console.log(`${TAG} ${repo} already up to date`);
    }
    return git(['rev-parse', 'HEAD'], { cwd: cloneDir }).trim();
  } finally {
    rmSync(cloneDir, { recursive: true, force: true });
  }
}

function publishRelease({ repo, version, token, forceRelease, sourceSha, targetSha, packageDir }) {
  const env = { GH_TOKEN: token, GITHUB_TOKEN: token };
  const assets = RELEASE_ASSETS.map((name) => path.join(packageDir, name));
  const exists = releaseExists(repo, version, env);

  if (exists && !forceRelease) {
    console.log(`${TAG} release ${version} already exists — skip`);
    return;
  }

  const server = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const sha = sourceSha || 'unknown';
  const notes = [
    'Automated release of Transitrix Studio for Obsidian.',
    '',
    `Built from [\`${SOURCE_REPO}@${sha.slice(0, 7)}\`](${server}/${SOURCE_REPO}/commit/${sha}).`,
  ].join('\n');
  const notesDir = mkdtempSync(path.join(tmpdir(), 'obsidian-release-notes-'));
  const notesFile = path.join(notesDir, 'notes.md');
  writeFileSync(notesFile, notes, 'utf8');

  try {
    if (exists) {
      gh(['release', 'upload', version, ...assets, '--repo', repo, '--clobber'], {
        env,
        stdio: 'inherit',
      });
      gh(['release', 'edit', version, '--repo', repo, '--notes-file', notesFile], {
        env,
        stdio: 'inherit',
      });
      console.log(`${TAG} re-uploaded assets to release ${version}`);
      return;
    }

    gh(
      [
        'release', 'create', version, ...assets,
        '--repo', repo,
        '--title', version,
        '--notes-file', notesFile,
        '--target', targetSha,
      ],
      { env, stdio: 'inherit' },
    );
    console.log(`${TAG} published release ${version}`);
  } finally {
    rmSync(notesDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/sync-obsidian-community.mjs [--dry-run] [--force-release] [--staging <dir>]');
    return;
  }

  const repo = process.env.OBSIDIAN_COMMUNITY_REPO || DEFAULT_REPO;
  const sourceSha = process.env.GITHUB_SHA || '';
  const mirror = buildCommunityMirror({ stagingDir: args.staging });
  const files = listFilesRecursive(mirror.stagingDir);
  console.log(`${TAG} staged ${files.length} files at ${mirror.stagingDir}`);
  console.log(`${TAG} version ${mirror.version} (minAppVersion ${mirror.minAppVersion})`);

  if (args.dryRun) {
    console.log(`${TAG} dry-run: skipping git push and release`);
    console.log(files.map((f) => `  ${f}`).join('\n'));
    return;
  }

  const token = process.env.OBSIDIAN_PLUGIN_DEPLOY_TOKEN;
  if (!token) {
    throw new Error(
      'OBSIDIAN_PLUGIN_DEPLOY_TOKEN is required (fine-grained PAT or GitHub App with contents:write on the community repo)',
    );
  }

  const targetSha = syncGitRepo({ stagingDir: mirror.stagingDir, repo, token, sourceSha });
  publishRelease({
    repo,
    version: mirror.version,
    token,
    forceRelease: args.forceRelease,
    sourceSha,
    targetSha,
    packageDir: PACKAGE_DIR,
  });
}

const isMain = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href,
);
if (isMain) {
  try {
    main();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`${TAG} ${redactSecrets(detail, process.env.OBSIDIAN_PLUGIN_DEPLOY_TOKEN)}`);
    process.exit(1);
  }
}
