/**
 * Mocha suite loader — the `run()` export @vscode/test-electron's
 * extensionTestsPath contract requires (see ../runTest.ts). Test files are
 * added explicitly rather than glob-discovered: the surface list is fixed
 * and reviewed (transitrix-hq#143), and skipping a glob dependency keeps
 * this harness's own dependency footprint small.
 */
import * as path from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: false,
    timeout: 60000,
    reporter: 'spec',
  });

  const testsRoot = __dirname;
  const files = [
    'preview-surfaces.test.js',
    'png-export.test.js',
  ];
  for (const f of files) {
    mocha.addFile(path.resolve(testsRoot, f));
  }
  // Narrows to a single surface for local/CI diagnosis (e.g. `TX_E2E_GREP=goals`)
  // without editing the fixed SURFACES list itself.
  if (process.env.TX_E2E_GREP) mocha.grep(process.env.TX_E2E_GREP);

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0) {
          reject(new Error(`${failures} extension-e2e test(s) failed.`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
