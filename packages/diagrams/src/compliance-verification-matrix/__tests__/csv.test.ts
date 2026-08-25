import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceIndex } from '../../compliance/reverse-index.js';
import { emptyCanon, ingestComplianceDoc } from '../../compliance/classify.js';
import { buildRequirementVerificationMatrix } from '../build.js';
import { renderRequirementVerificationMatrixCsv } from '../csv.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function loadAll(dir: string): unknown[] {
  const full = path.join(fixtures, dir);
  return readdirSync(full)
    .filter(f => f.endsWith('.yaml'))
    .map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')));
}

describe('renderRequirementVerificationMatrixCsv', () => {
  const canon = emptyCanon();
  for (const doc of [...loadAll('requirement'), ...loadAll('verification')]) {
    ingestComplianceDoc(canon, doc);
  }
  const index = buildComplianceIndex({
    requirements: canon.requirements,
    assertions: canon.assertions,
    verifications: canon.verifications,
  });
  const matrix = buildRequirementVerificationMatrix(index);
  const csv = renderRequirementVerificationMatrixCsv(matrix);

  it('is byte-identical across two serialisations of the same matrix', () => {
    expect(renderRequirementVerificationMatrixCsv(matrix)).toBe(csv);
  });

  it('preserves the builder row order', () => {
    const lines = csv.trimEnd().split('\r\n').slice(1);
    expect(lines).toHaveLength(matrix.rows.length);
    for (let i = 0; i < matrix.rows.length; i++) {
      expect(lines[i]).toContain(`"${matrix.rows[i].requirementId}"`);
      if (matrix.rows[i].verificationId) {
        expect(lines[i]).toContain(`"${matrix.rows[i].verificationId}"`);
      }
    }
  });

  it('carries coverage gaps as REQ-VERIF-COVERAGE-001/002, not a new verdict', () => {
    expect(csv).toContain('REQ-VERIF-COVERAGE-001');
    expect(csv).toContain('REQ-VERIF-COVERAGE-002');
  });

  it('keeps a dangling parent id in the parent_id column', () => {
    expect(csv).toContain('REQUIREMENT-MATRIX-DOES-NOT-EXIST-1');
  });

  it('does not emit a dangling verifies id as a related_test_result row', () => {
    expect(csv).not.toContain('VERIFICATION-MATRIX-DANGLING-1');
  });
});
