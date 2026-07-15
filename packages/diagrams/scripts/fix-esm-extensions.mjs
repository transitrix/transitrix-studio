// postbuild step: tsc (moduleResolution "bundler") emits relative import/export
// specifiers exactly as written in src/ — which is extensionless barrel-style
// (`from "./capability-map/index"`). That's fine for bundler consumers but
// fails Node's strict ESM resolution (this package declares "type": "module"),
// which is what a plain `import`/CRA-webpack build enforces. Rewrite the
// compiled dist/**/*.js in place so every relative specifier is fully
// specified, without touching src/ or the tsconfig moduleResolution mode.
import { readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, extname } from "node:path";

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const SPECIFIER_RE = /((?:from|import)\s*\(?\s*['"])(\.\.?\/[^'"]+)(['"])/g;
const HAS_EXTENSION_RE = /\.(js|mjs|cjs|json)$/;

function fixFile(path) {
  const src = readFileSync(path, "utf8");
  const fixed = src.replace(SPECIFIER_RE, (match, pre, spec, post) =>
    HAS_EXTENSION_RE.test(spec) ? match : `${pre}${spec}.js${post}`
  );
  if (fixed !== src) writeFileSync(path, fixed, "utf8");
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (extname(path) === ".js") fixFile(path);
  }
}

walk(DIST_DIR);
