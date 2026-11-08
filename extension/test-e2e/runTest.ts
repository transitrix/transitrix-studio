/**
 * Entry point: launches a real VS Code Extension Development Host and runs
 * the mocha suite in ./suite against it (hold 6 — "a green build is not
 * evidence").
 *
 * By default targets the built `extension/` source tree — requires
 * `npm run extension:prep` to have already produced extension/out,
 * extension/media, extension/compiler (this script does not rebuild them —
 * invoke via `npm run test:e2e-extension`, which does both).
 *
 * Set `TX_E2E_EXTENSION_PATH` to instead target an unpacked packaged
 * `.vsix` (its `extension/` subfolder) — the artefact that actually ships,
 * per hold 6's own acceptance criterion. See
 * `npm run test:e2e-extension:packaged` and .github/workflows/extension-e2e.yml,
 * which unpacks the attested build-vsix.yml artifact before setting this.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = process.env.TX_E2E_EXTENSION_PATH
    ? path.resolve(process.env.TX_E2E_EXTENSION_PATH)
    : path.resolve(__dirname, '..', '..', 'extension');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspacePath = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'notation-corpus');
  const repoRoot = path.resolve(__dirname, '..', '..');
  const consumerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-cli-'));
  try {
    const cliVersion: unknown = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/cli/package.json'), 'utf8')).version;
    if (typeof cliVersion !== 'string' || !cliVersion.trim()) throw new Error('CLI release manifest must contain a non-empty version');
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('Run the packaged suite through npm to prepare its CLI consumer');
    const npm = (args: string[]) => execFileSync(process.execPath, [npmCli, ...args], {
      cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    });
    npm(['run', 'build:diagrams']);
    npm(['pack', '--workspace', 'packages/cli', '--pack-destination', consumerDir, '--cache', path.join(consumerDir, 'cache'), '--json']);
    // Lifecycle stdout may precede npm's JSON. Use the manifest-bound filename
    // and hash actual archive bytes rather than parsing mixed stdout.
    const tarball = `transitrix-cli-${cliVersion}.tgz`;
    if (!tarball) throw new Error('CLI packaging produced no tarball');
    const packagePath = path.join(consumerDir, tarball);
    const packageBytes = fs.readFileSync(packagePath);
    const packageHash = createHash('sha256').update(packageBytes).digest('hex');
    const packageIntegrity = 'sha512-' + createHash('sha512').update(packageBytes).digest('base64');
    npm(['install', '--prefix', consumerDir, '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(consumerDir, 'cache'), packagePath]);
    const callerPath = path.join(consumerDir, 'node_modules', '@transitrix', 'cli', 'dist', 'cli.js');
    const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
    console.log(`Report caller package: ${tarball}; sha256=${packageHash}; source=${sourceRevision}`);

    const captureDir = path.join(repoRoot, '.test-out', 'png-capture');
    fs.rmSync(captureDir, { recursive: true, force: true });
    fs.mkdirSync(captureDir, { recursive: true });

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-userdata-'));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-extensions-'));
    // WorkspaceEdit deletions exercise file watchers on temporary fixtures. CI
    // has no desktop trash service; configure only this disposable test profile.
    const settingsDir = path.join(userDataDir, 'User');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      'files.enableTrash': false,
    }));

    console.log(`extension-e2e: extensionDevelopmentPath = ${extensionDevelopmentPath}`);

    const exitCode = await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      extensionTestsEnv: {
        TX_E2E_CAPTURE_DIR: captureDir,
        TX_E2E_CLI: callerPath,
        TX_E2E_CLI_VERSION: cliVersion,
        TX_E2E_SOURCE_REVISION: sourceRevision,
        // See extension.ts's E2ETestHooks — makes activate() hand back the
        // exact `vscode` binding the extension bundle uses internally.
        TX_E2E_TESTING: '1',
      },
      launchArgs: [
        workspacePath,
        '--disable-extensions',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
    });

    if (exitCode !== 0) {
      throw new Error(`extension-e2e: VS Code test host exited with code ${exitCode}`);
    }
    // Retain the exact installed/tested archive, never a post-test rebuild.
    const packageOutput = process.env.TX_E2E_PACKAGE_OUTPUT;
    if (packageOutput) {
      const audit = JSON.parse(npm(['audit', '--prefix', consumerDir, '--omit=dev', '--json']));
      if (audit.metadata?.vulnerabilities?.total !== 0) throw new Error('Candidate runtime audit must report zero vulnerabilities');
      fs.mkdirSync(packageOutput, { recursive: true });
      const target = path.join(packageOutput, tarball!);
      if (fs.existsSync(target) || fs.existsSync(path.join(packageOutput, 'cli-qualification.json'))) throw new Error('Refusing to overwrite retained candidate evidence');
      fs.copyFileSync(packagePath, target);
      fs.writeFileSync(path.join(packageOutput, 'runtime-audit.json'), JSON.stringify(audit, null, 2) + '\n');
      fs.writeFileSync(path.join(packageOutput, 'cli-qualification.json'), JSON.stringify({
        schema: 'transitrix-packaged-ui-cli-qualification/1', sourceRevision,
        cliVersion, diagramsVersion: JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/diagrams/package.json'), 'utf8')).version,
        artifact: tarball, sha256: packageHash, integrity: packageIntegrity,
        vsixSha256: process.env.VSIX_SHA256 ?? null,
        reportContract: 'requirement-chain/0.3', transport: 'requirements-report/1',
        exactArchiveUsedByPackagedUiTests: true, runtimeAuditVulnerabilities: 0,
      }, null, 2) + '\n');
    }
    console.log(`extension-e2e: all tests passed. PNG captures in ${captureDir}`);
  } finally {
    fs.rmSync(consumerDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
