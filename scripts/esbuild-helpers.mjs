/**
 * Shared constants for Node-target esbuild bundle scripts.
 * Used by build-extension-bundle.mjs, build-compiler-bundle.mjs,
 * and build-cli-package.mjs.
 */

// Injects createRequire so bundled CJS dependencies' dynamic require() calls
// fall through to Node's real module resolver instead of esbuild's stub.
export const REQUIRE_BANNER = {
  js: "import { createRequire as __createRequire__ } from 'node:module'; const require = __createRequire__(import.meta.url);",
};

// Node.js built-in modules — kept external across all Node-target bundles.
// Includes both `node:` prefixed and bare forms for CJS compatibility.
export const NODE_BUILTIN_EXTERNALS = [
  'node:path', 'node:url', 'node:fs', 'node:fs/promises',
  'node:child_process', 'node:os', 'node:http', 'node:https',
  'node:stream', 'node:util', 'node:events', 'node:buffer',
  'node:crypto', 'node:worker_threads', 'node:module', 'node:process',
  'path', 'url', 'fs', 'os', 'child_process', 'crypto',
  'http', 'https', 'stream', 'util', 'events', 'buffer',
  'worker_threads', 'process',
];

// npm runtime dependencies bundled as externals in both the extension compiler
// and the CLI package. Kept external so they resolve via node_modules at
// runtime — notably ajv has dynamic require patterns esbuild cannot inline.
export const COMPILER_RUNTIME_EXTERNALS = [
  'ajv',
  'ajv-formats',
  'bpmn-moddle',
  'elkjs',
  'js-yaml',
  'xmlbuilder2',
];
