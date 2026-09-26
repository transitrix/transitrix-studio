import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { runRepoValidate, repoScopeHasErrors } from '../src/repo-validate.js';
import { validateNotationDoc } from '../src/validate-notation.js';

const roots: string[] = [];
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'diagnostic-contract-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), text);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it('uses the manifest for both canonical and view ACTIONs, including file validation', () => {
  for (const version of ['6.0.0', '7.0.0']) {
    const root = fixture({
      'transitrix.yaml': `methodology_version: ${version}\n`,
      'canon/elements/ACTION-1.yaml': 'notation: action\nid: ACTION-1\nname: Example\nscore: -1\n',
      'views/actions.yaml': 'notation: action\nactions:\n  - id: ACTION-1\n    score: -1\n',
    });
    const repo = runRepoValidate(root);
    expect(repo.canon.some(f => f.ruleId === 'ACTION-011')).toBe(version === '7.0.0');
    expect(repo.views.some(f => f.ruleId === 'ACTION-011')).toBe(version === '7.0.0');
    const file = validateNotationDoc('action', { notation: 'action', actions: [{ id: 'ACTION-1', score: -1 }] }, { filePath: join(root, 'views/actions.yaml') });
    expect(file.findings.some(f => f.ruleId === 'ACTION-011')).toBe(version === '7.0.0');
  }
});

it('accounts for unsupported projections and rejects them in strict mode', () => {
  const root = fixture({
    'views/products.yaml': 'notation: products\nview_config: {}\n',
    'views/scenarios.yaml': 'notation: scenarios\nview: {id: SCENARIO-1, name: Example}\n',
  });
  const result = runRepoValidate(root);
  expect(result.coverage).toMatchObject({ discovered: 2, read: 2, validated: 0, unvalidated: 2, failed: 0 });
  expect(result.views).toHaveLength(2);
  expect(result.views.every(f => f.ruleId === 'NOTATION-SKIP-001' && f.severity === 'warning')).toBe(true);
  expect(repoScopeHasErrors(runRepoValidate(root, { strict: true }))).toBe(true);
});
