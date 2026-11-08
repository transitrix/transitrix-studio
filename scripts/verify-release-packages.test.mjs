import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyPackages } from './verify-release-packages.mjs';
const digest = (file, alg) => createHash(alg).update(readFileSync(file)).digest(alg === 'sha512' ? 'base64' : 'hex');
test('release verification accepts bound archives and refuses changed bytes, source, version and unqualified receipts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'release-packages-'));
  try {
    const source = 'a'.repeat(40), versions = { cli: '2.13.0', diagrams: '1.17.0' };
    for (const name of ['cli', 'diagrams']) {
      const stage = join(dir, name); mkdirSync(join(stage, 'package', 'dist'), { recursive: true });
      const put = (path, data) => writeFileSync(join(stage, 'package', path), JSON.stringify(data));
      put('package.json', { name: `@transitrix/${name}`, version: versions[name] });
      if (name === 'cli') { put('dist/requirements-build.json', { sourceRevision: source }); put('dist/diagrams-version.json', { version: versions.diagrams }); }
      execFileSync('tar', ['-czf', join(dir, `transitrix-${name}-${versions[name]}.tgz`), '-C', stage, 'package']);
    }
    const artifact = 'transitrix-cli-2.13.0.tgz', archive = join(dir, artifact);
    const receipt = { sourceRevision: source, cliVersion: versions.cli, diagramsVersion: versions.diagrams,
      artifact, sha256: digest(archive, 'sha256'), integrity: 'sha512-' + digest(archive, 'sha512'),
      exactArchiveUsedByPackagedUiTests: true, runtimeAuditVulnerabilities: 0, vsixSha256: 'b'.repeat(64) };
    writeFileSync(join(dir, 'runtime-audit.json'), JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } }));
    const save = value => writeFileSync(join(dir, 'cli-qualification.json'), JSON.stringify(value)); save(receipt);
    const saveSums = () => writeFileSync(join(dir, 'SHA256SUMS'), [
      ...['cli', 'diagrams'].map(name => `transitrix-${name}-${versions[name]}.tgz`), 'cli-qualification.json', 'runtime-audit.json',
    ].map(f => `${digest(join(dir, f), 'sha256')}  ${f}`).join('\n') + '\n');
    saveSums();
    const verify = (src = source, vers = versions, vsix = 'b'.repeat(64)) => verifyPackages(dir, src, vers, vsix);
    assert.equal(verify().sha256, receipt.sha256);
    assert.throws(() => verify('c'.repeat(40)), /identity/);
    assert.throws(() => verify(source, { ...versions, cli: '2.14.0' }), /identity/);
    for (const change of [{ exactArchiveUsedByPackagedUiTests: false }, { runtimeAuditVulnerabilities: 1 }, { integrity: 'sha512-bad' }]) {
      save({ ...receipt, ...change }); assert.throws(() => verify());
    }
    save(receipt); saveSums();
    assert.throws(() => verify(source, versions, 'c'.repeat(64)), /identity/);
    save({ ...receipt, vsixSha256: 'c'.repeat(64) }); saveSums(); assert.throws(() => verify(), /identity/);
    save(receipt); saveSums();
    save({ ...receipt, extra: 'changed' }); assert.throws(() => verify(), /Evidence checksum/);
    save(receipt); saveSums();
    writeFileSync(join(dir, 'runtime-audit.json'), '{}'); assert.throws(() => verify(), /Evidence checksum/);
    writeFileSync(join(dir, 'runtime-audit.json'), JSON.stringify({ metadata: { vulnerabilities: { total: 1 } } })); saveSums(); assert.throws(() => verify(), /audit/);
    writeFileSync(join(dir, 'runtime-audit.json'), JSON.stringify({ metadata: { vulnerabilities: { total: 0 } } })); saveSums();
    writeFileSync(archive, 'tampered'); assert.throws(() => verify(), /checksum/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
