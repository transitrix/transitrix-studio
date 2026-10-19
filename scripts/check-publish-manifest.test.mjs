import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManifest } from './check-publish-manifest.mjs';

const script = fileURLToPath(new URL('./check-publish-manifest.mjs', import.meta.url));
test('all tracked repository files have exact declarations', () => {
  const allowed = parseManifest(readFileSync('publish-manifest.yaml', 'utf8'));
  const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  assert.deepEqual(paths.filter(path => !allowed.has(path)), []);
});
test('directory, wildcard, sibling, duplicate and malformed declarations fail closed', () => {
  for (const path of ['allowed/**', 'allowed/', '*', '../file', '/file', 'a/./b', 'a//b', 'a\\b', 'a\nb']) {
    assert.throws(() => parseManifest(`published:\n  - ${path}\n`));
  }
  for (const text of ['', 'published: []', 'other:\n  - README.md', 'published:\n  - README.md\n  - README.md']) {
    assert.throws(() => parseManifest(text));
  }
  const allowed = parseManifest('published:\n  - allowed/file.txt\n');
  assert.equal(allowed.has('allowed/file.txt'), true);
  for (const path of ['allowed/other.txt', 'allowed-extra/file.txt', 'allowed/file.txt/child']) assert.equal(allowed.has(path), false);
});
test('CLI scans additions and existing undeclared files without diff context', () => {
  const root = mkdtempSync(join(tmpdir(), 'manifest-case-'));
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
  const put = (path, text='fixture') => { mkdirSync(join(root, path, '..'), { recursive: true }); writeFileSync(join(root, path), text); };
  const run = (env={}) => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8', env: { ...process.env, BASE_SHA: '', HEAD_SHA: '', ...env } });
  try {
    git('init', '-q'); git('config', 'user.name', 'fixture'); git('config', 'user.email', 'fixture@example.invalid');
    put('allowed/file.txt');
    put('publish-manifest.yaml', 'published:\n  - allowed/file.txt\n  - publish-manifest.yaml\n');
    git('add', '.'); git('commit', '-qm', 'Fixture baseline');
    assert.equal(run().status, 0);
    put('allowed/file.txt', 'changed'); git('add', '.'); assert.equal(run().status, 0);
    for (const path of ['new.txt', 'allowed/other.txt', 'allowed-extra/file.txt', 'scripts/fixture.txt', '.well-known/fixture.txt']) {
      put(path); git('add', path);
      const result = run(); assert.equal(result.status, 1); assert.ok(result.stderr.includes(JSON.stringify(path)));
      git('rm', '-qf', path);
    }
    put('existing.txt'); git('add', '.'); git('commit', '-qm', 'Fixture existing undeclared');
    put('existing.txt', 'changed'); git('add', '.');
    assert.equal(run().status, 1);
    assert.ok(run().stderr.includes('existing.txt'));
    assert.equal(run({ BASE_SHA: 'invalid', HEAD_SHA: 'invalid' }).status, 1);
    rmSync(join(root, 'publish-manifest.yaml')); assert.equal(run().status, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
