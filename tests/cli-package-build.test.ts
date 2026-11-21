import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
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

    const organization = {
      notation: 'organization', id: 'ORGANIZATION-1', name: 'Example',
      zone: 'canon', admitted_by: 'author', admitted_at: '2026-01-01',
      gate_checks: { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' },
      valid_from: '2026-01-01', valid_to: null,
    };
    const cases = [
      { name: 'mission', intent: { mission: 'Serve' }, rule: undefined },
      { name: 'vision', intent: { vision: 'Thrive' }, rule: undefined },
      { name: 'both', intent: { mission: 'Serve', vision: 'Thrive' }, rule: undefined },
      { name: 'missing', intent: {}, rule: 'ORG-002' },
      { name: 'boundary', intent: { mission: 'Serve' }, end: '2026-12-31', start: '2026-12-31', rule: 'ORG-001' },
      { name: 'separated', intent: { mission: 'Serve' }, end: '2026-12-31', start: '2027-01-01', rule: undefined },
      { name: 'unbounded', intent: { mission: 'Serve' }, start: '2040-01-01', rule: 'ORG-001' },
    ];
    const parent = mkdtempSync(join(tmpdir(), 'organization-cli-'));
    try {
      for (const test of cases) {
        const root = join(parent, test.name);
        mkdirSync(join(root, 'canon/elements'), { recursive: true });
        writeFileSync(join(root, 'transitrix.yaml'), 'methodology_version: "7.0.0"\nprofile: core\n');
        writeFileSync(join(root, 'canon/elements/one.yaml'), JSON.stringify({
          ...organization, ...test.intent, valid_to: test.end ?? null,
        }));
        if (test.start) writeFileSync(join(root, 'canon/elements/two.yaml'), JSON.stringify({
          ...organization, mission: 'Serve', id: 'ORGANIZATION-2', valid_from: test.start,
        }));
        const result = spawnSync(process.execPath, [join(repoRoot, 'packages/cli/dist/cli.js'),
          'validate', '--scope=repo', '--json', '.'], { cwd: root, encoding: 'utf8' });
        expect(result.error, test.name).toBeUndefined();
        expect(result.status, result.stderr || result.stdout).toBe(test.rule ? 1 : 0);
        const report = JSON.parse(result.stdout);
        expect(report.root).toBe(root);
        expect(report.valid, test.name).toBe(!test.rule);
        const count = test.start ? 2 : 1;
        expect(report.coverage).toMatchObject({
          discovered: count, read: count, validated: count, unvalidated: 0, failed: 0,
        });
        expect(report.skipped).toEqual([]);
        const findings = [...report.findings, ...report.views.findings,
          ...report.codex.findings, ...report.compliance.findings];
        expect(findings.some(f => f.ruleId === 'NOTATION-SKIP-001')).toBe(false);
        if (test.rule) expect(findings).toContainEqual(expect.objectContaining({
          ruleId: test.rule, severity: 'error',
        }));
      }
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
