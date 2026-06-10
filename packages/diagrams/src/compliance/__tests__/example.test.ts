// Conformance — single-law tree + single-product view on the acme_corp worked
// examples (mirrored under tests/fixtures/notation-corpus/requirement, tests/fixtures/notation-corpus/assertion). Pins the
// #84 Phase 3 acceptance.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildLawTree, buildProductView } from '../views.js';
import type { IndexAssertion, IndexRequirement } from '../types.js';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus');
function loadAll(dir: string): Record<string, unknown>[] {
  const full = path.join(examples, dir);
  return readdirSync(full).filter(f => f.endsWith('.yaml')).map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')) as Record<string, unknown>);
}

const requirements: IndexRequirement[] = loadAll('requirement').map(r => ({
  id: String(r.id), name: String(r.name),
  severity: r.severity as string | undefined,
  derived_from: Array.isArray(r.derived_from) ? (r.derived_from as string[]) : undefined,
}));
const assertions: IndexAssertion[] = loadAll('assertion').map(a => ({
  id: String(a.id), about: String(a.about), subject: String(a.subject),
  status: a.status as IndexAssertion['status'],
  evidenceCount: Array.isArray(a.evidence) ? a.evidence.length : 0,
}));
const index = buildComplianceIndex({ requirements, assertions });

describe('single-law tree — LAW-PERSONAL-DATA-2017-1', () => {
  const tree = buildLawTree('LAW-PERSONAL-DATA-2017-1', index);
  it('derives the data-erasure requirement with its three assertions', () => {
    expect(tree.requirements.map(r => r.requirement.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
    const node = tree.requirements[0];
    expect(node.assertions.map(a => a.id)).toEqual([
      'ASSERTION-CRM-DATA-ERASURE-1',
      'ASSERTION-MOBILE-DATA-ERASURE-1',
      'ASSERTION-ONBOARD-DATA-ERASURE-1',
    ]);
    expect(node.assertions.map(a => a.status).sort()).toEqual(['compliant', 'partial', 'under_review']);
  });
  it('the internal-only audit-log requirement is not under any law', () => {
    expect(index.requirementsByLaw.has('LAW-PERSONAL-DATA-2017-1')).toBe(true);
    expect(tree.requirements.some(r => r.requirement.id === 'REQUIREMENT-AUDIT-LOG-RETENTION-1')).toBe(false);
  });
});

describe('single-product view — PRODUCT-MOBILE-1', () => {
  it('shows the data-erasure requirement as compliant', () => {
    const view = buildProductView('PRODUCT-MOBILE-1', index);
    expect(view.requirements.map(r => r.requirement.id)).toEqual(['REQUIREMENT-DATA-ERASURE-1']);
    expect(view.requirements[0].assertion.status).toBe('compliant');
    expect(view.requirements[0].requirement.name).toBe('Personal-data erasure on request within 30 days');
  });
});
