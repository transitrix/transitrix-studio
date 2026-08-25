import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliPkg = JSON.parse(readFileSync(join(repoRoot, 'packages/cli/package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('@transitrix/cli package assembly', () => {
  it('declares @resvg/resvg-js so PNG compile can resolve the native addon', () => {
    expect(cliPkg.dependencies['@resvg/resvg-js']).toMatch(/^\^?2\./);
  });

  it('prepack leaves @resvg/resvg-js external and does not emit a .node binary', () => {
    const r = spawnSync(process.execPath, [join(repoRoot, 'scripts/build-cli-package.mjs')], {
      encoding: 'utf8',
      cwd: repoRoot,
    });
    expect(r.status, r.stderr || r.stdout).toBe(0);

    const bundled = readFileSync(join(repoRoot, 'packages/cli/dist/cli.js'), 'utf8');
    expect(bundled).toMatch(/@resvg\/resvg-js/);
    expect(bundled).not.toMatch(/\.node['"]/);
  });
});
