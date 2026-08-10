import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { handleExportComplianceCommand } from '../src/export-compliance.js';

// `transitrix export-compliance --format md`'s persisted Markdown output must
// carry the same provenance stamp as `render-compliance-impact.mjs`
// (transitrix-hq#108): source path(s), source commit, generator, generation
// time, in the artefact itself — never a sidecar. This is a separate test
// file (rather than tests/export-compliance.test.ts) because that file
// mocks `node:child_process` wholesale, which would swallow the real
// `execFileSync` git calls the stamp depends on.

describe('export-compliance provenance stamp', () => {
  let dir: string;
  let canonDir: string;
  let outFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-compliance-provenance-test-'));
    canonDir = join(dir, 'canon');
    mkdirSync(canonDir, { recursive: true });
    outFile = join(dir, 'out.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('legacy --scope path: embeds a stamp naming the generator, canon root, scope, and a generation time', async () => {
    await handleExportComplianceCommand(['--scope', 'matrix', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toMatch(/^<!--\n/);
    expect(written).toContain('generated-by: transitrix export-compliance');
    expect(written).toContain(`canon-root: ${canonDir}`);
    expect(written).toContain('scope: matrix');
    // canonDir is a bare tmp directory — no git repository above it in scope.
    expect(written).toContain('source-commit: unknown (canon root is not a git repository)');
    expect(written).toMatch(/generated-at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    expect(written).toContain('# Compliance Matrix');
  });

  it('CV-6 --report path: embeds a stamp naming the generator, canon root, view-config, and a generation time', async () => {
    writeFileSync(
      join(canonDir, 'demo.compliance-impact.view.yaml'),
      'view:\n  id: demo\n  name: Demo\n  subjects:\n    products: []\n',
    );

    await handleExportComplianceCommand(['--report', 'demo', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain('generated-by: transitrix export-compliance');
    expect(written).toContain(`canon-root: ${canonDir}`);
    expect(written).toContain(`view-config: root:${canonDir}#demo`);
    expect(written).toContain('source-commit: unknown (canon root is not a git repository)');
    expect(written).toMatch(/generated-at: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  });

  it('flags a dirty canon-root working tree rather than reading it as clean', async () => {
    spawnSync('git', ['init', '-q'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: canonDir });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: canonDir });
    writeFileSync(join(canonDir, 'placeholder.txt'), 'placeholder\n');
    spawnSync('git', ['add', '-A'], { cwd: canonDir });
    spawnSync('git', ['commit', '-q', '-m', 'initial'], { cwd: canonDir });
    const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: canonDir, encoding: 'utf-8' }).stdout.trim();
    // Uncommitted change after the commit the stamp would otherwise cite.
    writeFileSync(join(canonDir, 'placeholder.txt'), 'changed\n');

    await handleExportComplianceCommand(['--scope', 'matrix', '--root', canonDir, '--format', 'md', '--output', outFile]);

    const written = readFileSync(outFile, 'utf-8');
    expect(written).toContain(`source-commit: ${commit} (dirty`);
  });
});
