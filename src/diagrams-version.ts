import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Version of `@transitrix/diagrams` bundled into this CLI build — used by
 * `transitrix --version`.
 *
 * The published `@transitrix/cli` package bundles the `@transitrix/diagrams`
 * *source* at prepack (`scripts/build-cli-package.mjs`) rather than
 * depending on it at runtime, so it is not in `node_modules` for a plain
 * `npm i @transitrix/cli` install (and its ESM-only `exports` map has no
 * `require` condition, so `createRequire(...).resolve` can't find it either
 * way). That build script writes a small `diagrams-version.json` manifest
 * next to `dist/cli.js` recording which workspace version was bundled; this
 * reads it back.
 *
 * When running from the monorepo instead (`npm run transitrix` via `tsx`, or
 * the `tsc`-built root `dist/` used by tests) that manifest doesn't exist, so
 * fall back to walking up from this file to the repo root and reading
 * `packages/diagrams/package.json` directly.
 */
export function bundledDiagramsVersion(): string | undefined {
  const here = dirname(fileURLToPath(import.meta.url));

  const manifestPath = join(here, 'diagrams-version.json');
  try {
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown };
      if (typeof manifest.version === 'string') return manifest.version;
    }
  } catch {
    /* fall through to workspace resolution below */
  }

  try {
    let dir = here;
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, 'packages', 'diagrams', 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: unknown; version?: unknown };
        if (pkg.name === '@transitrix/diagrams' && typeof pkg.version === 'string') {
          return pkg.version;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    /* unresolvable — report no diagrams version rather than throwing */
  }

  return undefined;
}
