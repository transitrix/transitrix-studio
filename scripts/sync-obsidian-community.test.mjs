import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';

import {
  OUTPUT_DIR,
  assertSafeStagingDir,
  buildCommunityMirror,
  redactSecrets,
  stripMaintainerSections,
  validateReleaseMetadata,
} from './sync-obsidian-community.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_DIR = path.join(ROOT, 'packages', 'obsidian-plugin');
const STAGING = path.join(OUTPUT_DIR, 'obsidian-community-mirror-test');
const sourceManifest = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'manifest.json'), 'utf8'));

/** Removes a symlink or Windows junction without following it. */
function removeLink(target) {
  try {
    unlinkSync(target);
  } catch {
    rmdirSync(target);
  }
}

describe('buildCommunityMirror', () => {
  let packageDir;

  before(() => {
    packageDir = mkdtempSync(path.join(tmpdir(), 'obsidian-package-'));
    copyFileSync(path.join(PLUGIN_DIR, 'manifest.json'), path.join(packageDir, 'manifest.json'));
    copyFileSync(path.join(PLUGIN_DIR, 'styles.css'), path.join(packageDir, 'styles.css'));
    writeFileSync(path.join(packageDir, 'main.js'), '/* bundle */\n', 'utf8');
  });

  after(() => {
    rmSync(packageDir, { recursive: true, force: true });
    rmSync(STAGING, { recursive: true, force: true });
  });

  it('stages plugin sources without build files, tests or main.js', () => {
    const { version, stagingDir } = buildCommunityMirror({ stagingDir: STAGING, packageDir });
    assert.equal(version, sourceManifest.version);

    for (const rel of ['manifest.json', 'versions.json', 'styles.css', 'LICENSE', 'README.md', 'src/main.ts', 'demo/goals-preview.md']) {
      assert.ok(existsSync(path.join(stagingDir, rel)), `${rel} should be mirrored`);
    }
    for (const rel of ['main.js', 'package.json', 'tsconfig.json', 'esbuild.config.mjs', 'vitest.config.ts', 'test', 'src/__tests__']) {
      assert.equal(existsSync(path.join(stagingDir, rel)), false, `${rel} should not be mirrored`);
    }
  });

  it('keeps manifest.json byte-identical to the release asset', () => {
    const { stagingDir } = buildCommunityMirror({ stagingDir: STAGING, packageDir });
    assert.equal(
      readFileSync(path.join(stagingDir, 'manifest.json'), 'utf8'),
      readFileSync(path.join(packageDir, 'manifest.json'), 'utf8'),
    );
  });

  it('publishes a user README without maintainer sections', () => {
    const { stagingDir } = buildCommunityMirror({ stagingDir: STAGING, packageDir });
    const readme = readFileSync(path.join(stagingDir, 'README.md'), 'utf8');
    assert.match(readme, /Distribution repository/);
    assert.doesNotMatch(readme, /OBSIDIAN_PLUGIN_DEPLOY_TOKEN/);
    assert.doesNotMatch(readme, /npm run/);
    assert.doesNotMatch(readme, /maintainer:/);
  });

  it('rejects a stale packaged manifest', () => {
    const stale = mkdtempSync(path.join(tmpdir(), 'obsidian-stale-'));
    try {
      copyFileSync(path.join(packageDir, 'styles.css'), path.join(stale, 'styles.css'));
      copyFileSync(path.join(packageDir, 'main.js'), path.join(stale, 'main.js'));
      writeFileSync(path.join(stale, 'manifest.json'), JSON.stringify({ ...sourceManifest, version: '9.9.9' }), 'utf8');
      assert.throws(() => buildCommunityMirror({ stagingDir: STAGING, packageDir: stale }), /stale/);
    } finally {
      rmSync(stale, { recursive: true, force: true });
    }
  });
});

describe('assertSafeStagingDir', () => {
  it('accepts a subdirectory of output/', () => {
    assert.equal(assertSafeStagingDir(STAGING), STAGING);
  });

  it('rejects output/ itself, the repo root, cwd and outside paths', () => {
    for (const dir of [OUTPUT_DIR, ROOT, process.cwd(), tmpdir(), path.join(OUTPUT_DIR, '..', 'packages')]) {
      assert.throws(() => assertSafeStagingDir(dir), /must be inside/, dir);
    }
  });

  it('rejects symlinked staging paths without touching external bytes', () => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const outside = mkdtempSync(path.join(tmpdir(), 'obsidian-staging-outside-'));
    const suffix = path.basename(outside);
    const parentLink = path.join(OUTPUT_DIR, `${suffix}-parent`);
    const stagingLink = path.join(OUTPUT_DIR, `${suffix}-staging`);
    const sentinel = path.join(outside, 'sentinel');
    writeFileSync(sentinel, 'retain');
    symlinkSync(outside, parentLink, 'junction');
    symlinkSync(outside, stagingLink, 'junction');

    try {
      assert.throws(
        () => assertSafeStagingDir(path.join(parentLink, 'new-staging')),
        /symbolic links/,
      );
      assert.throws(() => assertSafeStagingDir(stagingLink), /symbolic links/);
      assert.equal(readFileSync(sentinel, 'utf8'), 'retain');
    } finally {
      removeLink(parentLink);
      removeLink(stagingLink);
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('staging symlink escape through buildCommunityMirror', () => {
  const SENTINEL = 'external bytes\n';
  let packageDir;
  let external;
  let link;

  before(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    packageDir = mkdtempSync(path.join(tmpdir(), 'obsidian-package-'));
    copyFileSync(path.join(PLUGIN_DIR, 'manifest.json'), path.join(packageDir, 'manifest.json'));
    copyFileSync(path.join(PLUGIN_DIR, 'styles.css'), path.join(packageDir, 'styles.css'));
    writeFileSync(path.join(packageDir, 'main.js'), '/* bundle */\n', 'utf8');
    external = mkdtempSync(path.join(tmpdir(), 'obsidian-escape-'));
    mkdirSync(path.join(external, 'victim'));
    writeFileSync(path.join(external, 'sentinel'), SENTINEL, 'utf8');
    writeFileSync(path.join(external, 'victim', 'sentinel'), SENTINEL, 'utf8');
    link = path.join(OUTPUT_DIR, `symlink-proof-${process.pid}`);
    // Junctions need no elevation on Windows; the type is ignored elsewhere.
    symlinkSync(external, link, 'junction');
  });

  after(() => {
    if (link) removeLink(link);
    if (external) rmSync(external, { recursive: true, force: true });
    if (packageDir) rmSync(packageDir, { recursive: true, force: true });
  });

  function assertExternalIntact() {
    assert.equal(readFileSync(path.join(external, 'sentinel'), 'utf8'), SENTINEL);
    assert.equal(readFileSync(path.join(external, 'victim', 'sentinel'), 'utf8'), SENTINEL);
  }

  it('keeps external bytes when the staging directory is a symlink', () => {
    assert.throws(() => buildCommunityMirror({ stagingDir: link, packageDir }), /symbolic links/);
    assertExternalIntact();
  });

  it('keeps external bytes when a staging parent is a symlink', () => {
    const staging = path.join(link, 'victim');
    assert.throws(() => buildCommunityMirror({ stagingDir: staging, packageDir }), /symbolic links/);
    assertExternalIntact();
  });

  it('creates nothing outside output/ for a missing path below a symlinked parent', () => {
    const staging = path.join(link, 'missing', 'deeper');
    assert.throws(() => buildCommunityMirror({ stagingDir: staging, packageDir }), /symbolic links/);
    assertExternalIntact();
    assert.equal(existsSync(path.join(external, 'missing')), false);
  });
});

describe('validateReleaseMetadata', () => {
  const ok = {
    manifest: { version: '1.2.3', minAppVersion: '1.0.0' },
    versions: { '1.2.3': '1.0.0' },
    pkg: { version: '1.2.3' },
  };

  it('accepts consistent metadata', () => {
    assert.equal(validateReleaseMetadata(ok), '1.2.3');
  });

  it('rejects non x.y.z versions', () => {
    for (const version of ['v1.2.3', '1.2', '1.2.3-beta.1']) {
      assert.throws(
        () => validateReleaseMetadata({
          manifest: { ...ok.manifest, version },
          versions: { [version]: '1.0.0' },
          pkg: { version },
        }),
        /x\.y\.z/,
      );
    }
  });

  it('rejects package.json drift', () => {
    assert.throws(() => validateReleaseMetadata({ ...ok, pkg: { version: '1.2.2' } }), /package\.json/);
  });

  it('rejects a missing or mismatched versions.json entry', () => {
    assert.throws(() => validateReleaseMetadata({ ...ok, versions: {} }), /versions\.json/);
    assert.throws(() => validateReleaseMetadata({ ...ok, versions: { '1.2.3': '0.15.0' } }), /versions\.json/);
  });
});

describe('stripMaintainerSections', () => {
  it('removes marked sections', () => {
    const md = 'a\n\n<!-- maintainer:start -->\nsecret\n<!-- maintainer:end -->\n\nb\n';
    assert.equal(stripMaintainerSections(md), 'a\n\nb\n');
  });

  it('fails on unbalanced markers', () => {
    assert.throws(() => stripMaintainerSections('<!-- maintainer:start -->\nx'), /unbalanced/);
    assert.throws(() => stripMaintainerSections('x\n<!-- maintainer:end -->'), /unbalanced/);
  });
});

describe('redactSecrets', () => {
  it('masks the raw token and its basic-auth encoding', () => {
    const token = 'github_pat_EXAMPLE';
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
    const out = redactSecrets(`url ${token} header ${basic}`, token);
    assert.equal(out.includes(token), false);
    assert.equal(out.includes(basic), false);
  });
});
