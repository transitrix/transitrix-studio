// Conformance test — the compliance matrix on the acme_corp worked examples
// (mirrored under tests/fixtures/notation-corpus/product, tests/fixtures/notation-corpus/requirement, tests/fixtures/notation-corpus/assertion).
// Pins the #84 Phase 2 acceptance: the matrix renders correctly and gaps are
// obvious.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceMatrix } from '../build.js';
import type { MatrixAssertionRef, MatrixProduct, MatrixRequirement } from '../types.js';

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus');
function loadAll(dir: string): Record<string, unknown>[] {
  const full = path.join(examples, dir);
  return readdirSync(full)
    .filter(f => f.endsWith('.yaml'))
    .map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')) as Record<string, unknown>);
}

describe('compliance matrix — acme_corp worked examples', () => {
  const products: MatrixProduct[] = loadAll('product').map(p => ({ id: String(p.id), name: String(p.name) }));
  const requirements: MatrixRequirement[] = loadAll('requirement').map(r => ({
    id: String(r.id), name: String(r.name), severity: r.severity as string | undefined,
  }));
  const assertions: MatrixAssertionRef[] = loadAll('assertion').map(a => ({
    id: String(a.id), about: String(a.about), subject: String(a.subject),
    status: a.status as MatrixAssertionRef['status'],
    assessed_at: a.assessed_at as string | undefined,
    next_review_at: a.next_review_at as string | undefined,
  }));

  const m = buildComplianceMatrix({ products, requirements, assertions });

  it('rows = the two product files plus the dangling PRODUCT-MOBILE-1 subject', () => {
    expect(m.products.map(p => p.id)).toEqual([
      'PRODUCT-ECOMM-1', 'PRODUCT-MOBILE-1', 'PRODUCT-SUPPORT-1',
    ]);
    expect(m.products.find(p => p.id === 'PRODUCT-MOBILE-1')?.unresolved).toBe(true);
  });

  it('columns = the two requirements', () => {
    expect(m.requirements.map(r => r.id)).toEqual([
      'REQUIREMENT-AUDIT-LOG-RETENTION-1', 'REQUIREMENT-DATA-ERASURE-1',
    ]);
  });

  it('the only product-subject assertion (mobile → data-erasure) is compliant; everything else is a gap', () => {
    const row = m.products.findIndex(p => p.id === 'PRODUCT-MOBILE-1');
    const col = m.requirements.findIndex(r => r.id === 'REQUIREMENT-DATA-ERASURE-1');
    expect(m.cells[row][col]).toMatchObject({ status: 'compliant', assertionId: 'ASSERTION-MOBILE-DATA-ERASURE-1' });
    // 3 products × 2 requirements = 6 cells; 1 filled → 5 gaps. The CRM
    // (capability) and onboarding (process) assertions are not in the matrix.
    expect(m.summary).toMatchObject({ products: 3, requirements: 2, assertions: 1, gaps: 5 });
  });
});
