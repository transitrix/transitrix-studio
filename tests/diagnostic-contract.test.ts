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


it('reports the published scenario-set template as unsupported instead of applying the legacy singular form', () => {
  const root = fixture({ 'views/scenarios.yaml': 'notation: scenarios\nscenarios: [{id: SCENARIO-1, name: Example}]\n' });
  const result = runRepoValidate(root);
  expect(result.coverage).toMatchObject({ discovered: 1, read: 1, validated: 0, unvalidated: 1 });
  expect(result.views.map(f => f.ruleId)).toEqual(['NOTATION-SKIP-001']);
  expect(repoScopeHasErrors(runRepoValidate(root, { strict: true }))).toBe(true);
  const legacy = validateNotationDoc('scenarios', { notation: 'scenarios', scenario: {id: 'SCENARIO-1', name: 'Example', status: 'Active'} });
  expect(legacy.findings.some(f => f.ruleId === 'NOTATION-SKIP-001')).toBe(false);
});


it('keeps retired orphan diagnostics visible as coverage observations for current catalogues', () => {
  const root = fixture({
    'transitrix.yaml': 'methodology_version: 7.0.0\n',
    'canon/elements/GOAL-1.yaml': 'notation: goal\nid: GOAL-1\nname: Example\n',
  });
  const result = runRepoValidate(root);
  expect(result.canon.some(f => /^FGCA-01[234]$/.test(f.ruleId ?? ''))).toBe(false);
  expect(result.observations).toEqual([{id: 'GOAL-1', kind: 'unreferenced', message: "goal 'GOAL-1' is not referenced by any change or action."}]);
});

it('retains schema field, form and actual type without colliding with projection PROD codes', () => {
  const result = validateNotationDoc('products', {notation: 'products', products_catalogue: {
    id: 'example', name: 'Example', updated_at: '2026-09-26', products: [{product_id: 'P-1', name: 'Example', type: 'service', status: 123}],
  }}, {filePath: '/catalogue/views/products.yaml'});
  expect(result.findings).toEqual([expect.objectContaining({ruleId: 'SCHEMA_INVALID', severity: 'error', message: expect.stringContaining("products[0].status")})]);
  expect(result.findings[0].message).toContain('products inline');
  expect(result.findings[0].message).toContain('actual number (123)');
  expect(result.findings[0].message).toContain('/catalogue/views/products.yaml');
});


it('resolves capability maturity from a sidecar without requiring it inline', () => {
  const root = fixture({
    'canon/elements/CAPABILITY-V1.history.yaml': 'target: CAPABILITY-V1\nattribute_versions:\n  current_maturity:\n    - {valid_from: "2026-01-01", value: 3}\n',
    'views/capabilities.capability-map.transitrix.yaml': 'notation: capability-map\ncapability_map:\n  id: CAPABILITY_MAP-1\n  name: Example\n  assessment_date: "2026-09-26"\n  capabilities: [{id: CAPABILITY-V1, name: Example, type: domain}]\n',
  });
  const result = runRepoValidate(root);
  expect(result.views.filter(f => f.file.includes('capabilities.'))).toEqual([]);
  writeFileSync(join(root, 'canon/elements/CAPABILITY-V1.history.yaml'), 'target: CAPABILITY-V1\nattribute_versions: {}\n');
  expect(runRepoValidate(root).views).toContainEqual(expect.objectContaining({ruleId: 'SCHEMA_INVALID', message: expect.stringContaining('current_maturity')}));
});
