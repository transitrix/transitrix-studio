import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Reads `package.json` next to the compiled compiler (repo root when using `dist/`, or `extension/` in the VS Code bundle). */
export function cervinPackageVersion(): string {
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const j = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: unknown };
    return typeof j.version === 'string' ? j.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}
