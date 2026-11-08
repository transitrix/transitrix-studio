import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const sha = (file, algorithm = 'sha256') => createHash(algorithm).update(readFileSync(file)).digest(algorithm === 'sha512' ? 'base64' : 'hex');
export function verifyPackages(dir, source, versions, expectedVsixSha256) {
  if (!/^[a-f0-9]{40}$/.test(source ?? '')) throw Error('Exact source commit required');
  const receipt = JSON.parse(readFileSync(join(dir, 'cli-qualification.json'), 'utf8'));
  if (receipt.sourceRevision !== source || receipt.cliVersion !== versions.cli || receipt.diagramsVersion !== versions.diagrams
      || receipt.exactArchiveUsedByPackagedUiTests !== true || receipt.runtimeAuditVulnerabilities !== 0
      || !/^[a-f0-9]{64}$/.test(expectedVsixSha256 ?? '') || receipt.vsixSha256 !== expectedVsixSha256) throw Error('Qualification identity mismatch');
  const sums = new Map(readFileSync(join(dir, 'SHA256SUMS'), 'utf8').trim().split('\n').map(line => {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9.-]+)$/.exec(line);
    if (!match) throw Error('Malformed checksum manifest');
    return [match[2], match[1]];
  }));
  for (const evidence of ['cli-qualification.json', 'runtime-audit.json']) {
    if (sha(join(dir, evidence)) !== sums.get(evidence)) throw Error('Evidence checksum mismatch');
  }
  if (JSON.parse(readFileSync(join(dir, 'runtime-audit.json'))).metadata?.vulnerabilities?.total !== 0) throw Error('Runtime audit must be clean');
  for (const name of ['diagrams', 'cli']) {
    const version = versions[name];
    if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Stable version required');
    const filename = `transitrix-${name}-${version}.tgz`, archive = join(dir, filename);
    if (sha(archive) !== sums.get(filename)) throw Error('Archive checksum mismatch');
    const content = path => JSON.parse(execFileSync('tar', ['-xOf', archive, `package/${path}`], { encoding: 'utf8' }));
    const pkg = content('package.json');
    if (pkg.name !== `@transitrix/${name}` || pkg.version !== version) throw Error('Package version mismatch');
    if (name === 'cli' && (receipt.artifact !== filename || receipt.sha256 !== sha(archive)
        || receipt.integrity !== `sha512-${sha(archive, 'sha512')}`
        || content('dist/requirements-build.json').sourceRevision !== source
        || content('dist/diagrams-version.json').version !== versions.diagrams)) throw Error('CLI archive provenance mismatch');
  }
  return receipt;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const versions = Object.fromEntries(['cli', 'diagrams'].map(name => [name, JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'))).version]));
  if (!process.argv[3]) throw Error('Actual VSIX path required');
  verifyPackages(resolve(process.argv[2] ?? 'qualified'), process.env.GITHUB_SHA, versions, sha(resolve(process.argv[3])));
  console.log('PASS: exact release-qualified package bytes and source identities');
}
