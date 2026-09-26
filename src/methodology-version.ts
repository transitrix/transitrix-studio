import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import yaml from 'js-yaml';

/** The nearest catalogue manifest owns compatibility, never per-file spec_version. */
export function readMethodologyVersion(directory: string): string | undefined {
  let current = resolve(directory);
  for (;;) {
    const file = join(current, 'transitrix.yaml');
    if (existsSync(file)) {
      const manifest = yaml.load(readFileSync(file, 'utf8')) as Record<string, unknown> | null;
      return typeof manifest?.methodology_version === 'string' ? manifest.methodology_version : undefined;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}
