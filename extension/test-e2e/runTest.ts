/**
 * Entry point: launches a real VS Code Extension Development Host with the
 * built `extension/` and runs the mocha suite in ./suite against it
 * (transitrix-hq#143, hold 6 — "a green build is not evidence").
 *
 * Requires `npm run extension:prep` to have already produced
 * extension/out, extension/media, extension/compiler (this script does not
 * rebuild them — invoke via `npm run test:e2e-extension`, which does both).
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, '..', '..', 'extension');
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.js');
  const workspacePath = path.resolve(__dirname, '..', '..', 'tests', 'fixtures', 'notation-corpus');
  const repoRoot = path.resolve(__dirname, '..', '..');

  const captureDir = path.join(repoRoot, '.test-out', 'png-capture');
  fs.rmSync(captureDir, { recursive: true, force: true });
  fs.mkdirSync(captureDir, { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-userdata-'));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tx-e2e-extensions-'));

  const exitCode = await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    extensionTestsEnv: {
      TX_E2E_CAPTURE_DIR: captureDir,
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
