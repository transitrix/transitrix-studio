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
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = process.env.TX_E2E_EXTENSION_PATH
    ? path.resolve(process.env.TX_E2E_EXTENSION_PATH)
    : path.resolve(__dirname, '..', '..', 'extension');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspacePath = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'notation-corpus');
  const repoRoot = path.resolve(__dirname, '..', '..');

  const captureDir = path.join(repoRoot, '.test-out', 'png-capture');
  fs.rmSync(captureDir, { recursive: true, force: true });
  fs.mkdirSync(captureDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-userdata-'));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-extensions-'));

  console.log(`extension-e2e: extensionDevelopmentPath = ${extensionDevelopmentPath}`);

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: {
      TX_E2E_CAPTURE_DIR: captureDir,
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
  console.log(`extension-e2e: all tests passed. PNG captures in ${captureDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
