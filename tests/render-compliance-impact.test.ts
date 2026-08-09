import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

// `scripts/render-compliance-impact.mjs`'s persisted Markdown output must
// carry the provenance stamp (transitrix-hq#89's regeneration half, unblocked
// by transitrix-hq#98 / the 2026-08-09 amendment to the cross-project
// derived-artefact decision): source path(s), source commit, generator,
// generation time, in the artefact itself — never a sidecar.

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'render-compliance-impact.mjs');

function runScript(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });
}

describe('render-compliance-impact.mjs provenance stamp', () => {
  let dir: string;
  let canonDir: string;
  let viewFile: string;
  let outFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'render-compliance-impact-test-'));
    canonDir = join(dir, 'canon');
    mkdirSync(canonDir, { recursive: true });
    viewFile = join(dir, 'demo.compliance-impact.view.yaml');
    writeFileSync(
      viewFile,
      'view:\n  id: DEMO-1\n  name: Demo\n  subjects:\n    products: []\n',
    );
    outFile = join(dir, 'out.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('embeds a stamp naming the generator, both sources, and a generation time', () => {
    const result = runScript(['--view', viewFile, '--canon', canonDir, '--out', outFile]);
    expect(result.status).toBe(0);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toMatch(/^<!--\n/);
    expect(written).toContain('generated-by: render-compliance-impact.mjs');
    expect(written).toContain(`canon-root: ${canonDir}`);
    expect(written).toContain(`view-config: ${viewFile}`);
    // canonDir is a bare tmp directory — no git repository above it in scope.
    expect(written).toContain('source-commit: unknown (canon root is not a git repository)');
    expect(written).toMatch(/generated-at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    // The stamp precedes the report body, which is unaffected by it.
    expect(written).toContain('# Demo');
  });

  it('records the HEAD commit of a clean canon-root git repository, with no dirty suffix', () => {
    spawnSync('git', ['init', '-q'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: canonDir });
    writeFileSync(join(canonDir, 'placeholder.txt'), 'placeholder\n');
    spawnSync('git', ['add', '-A'], { cwd: canonDir });
    spawnSync('git', ['commit', '-q', '-m', 'initial'], { cwd: canonDir });
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: canonDir, encoding: 'utf-8' }).stdout.trim();

    const result = runScript(['--view', viewFile, '--canon', canonDir, '--out', outFile]);
    expect(result.status).toBe(0);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain(`source-commit: ${commit}\n`);
  });

  it('flags a dirty canon-root working tree rather than reading it as clean', () => {
    spawnSync('git', ['init', '-q'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: canonDir });
    writeFileSync(join(canonDir, 'placeholder.txt'), 'placeholder\n');
    spawnSync('git', ['add', '-A'], { cwd: canonDir });
    spawnSync('git', ['commit', '-q', '-m', 'initial'], { cwd: canonDir });
    // Uncommitted change after the commit the stamp would otherwise cite.
    writeFileSync(join(canonDir, 'placeholder.txt'), 'changed\n');

    const result = runScript(['--view', viewFile, '--canon', canonDir, '--out', outFile]);
    expect(result.status).toBe(0);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('(dirty — uncommitted changes present at generation time)');
  });
});
