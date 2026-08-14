/**
 * Root package.json declares `"type": "module"`. The extension-e2e harness
 * (extension/test-e2e/) compiles to CommonJS (tsc `module: CommonJS`,
 * `require`/`module.exports`) because @vscode/test-electron's
 * `extensionTestsPath` is loaded by the Extension Development Host, and the
 * mocha-based suite loader pattern used here is CJS.
 *
 * Node resolves a plain `.js` file's module system from the nearest
 * `package.json` found by walking up from the file — which, with no
 * override, would be the repo root's `"type": "module"`, making every
 * compiled `require(...)` call throw. This script drops a `{"type":
 * "commonjs"}` package.json into the compiled-output directory (gitignored,
 * regenerated on every run) so the compiled harness resolves as CJS
 * regardless of the root package's module type.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '.test-out');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
console.log('prep-test-out-commonjs: wrote .test-out/package.json (type: commonjs)');
