import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { buildComplianceIndex } from '../../compliance/reverse-index.js';
import { emptyCanon, ingestComplianceDoc } from '../../compliance/classify.js';
import { buildRequirementVerificationMatrix } from '../build.js';
import type { ComplianceIndexInput } from '../../compliance/types.js';

// ── Inline unit tests — row cardinality, parent resolution, no roll-up,
//    labels, outcomes, explicit gaps ─────────────────────────────────────────

describe('buildRequirementVerificationMatrix', () => {
  const input: ComplianceIndexInput = {
    requirements: [
      { id: 'REQUIREMENT-A-1', name: 'A', severity: 'high' }, // one closed verification
      { id: 'REQUIREMENT-B-1', name: 'B', severity: 'low' }, // no verification -> -001
      { id: 'REQUIREMENT-C-1', name: 'C', severity: 'medium' }, // only unresolved -> -002
      { id: 'REQUIREMENT-D-1', name: 'D', severity: 'high', parent: 'REQUIREMENT-A-1' }, // resolvable parent, own verification
      { id: 'REQUIREMENT-E-1', name: 'E', severity: 'high', parent: 'REQUIREMENT-DOES-NOT-EXIST-1' }, // dangling parent
    ],
    assertions: [],
    verifications: [
      { id: 'VERIFICATION-A-1', verifies: 'REQUIREMENT-A-1', method: 'test', outcome: 'pass', protocol: 'Protocol A' },
      { id: 'VERIFICATION-C-1', verifies: 'REQUIREMENT-C-1', method: 'test', outcome: 'not_yet_run', protocol: 'Protocol C1' },
      { id: 'VERIFICATION-C-2', verifies: 'REQUIREMENT-C-1', method: 'analysis', outcome: 'inconclusive', protocol: 'Protocol C2' },
      { id: 'VERIFICATION-D-1', verifies: 'REQUIREMENT-D-1', method: 'test', outcome: 'fail' }, // no protocol -> label falls back to id
      // Dangling verifies — must never attach to any row.
      { id: 'VERIFICATION-DANGLING-1', verifies: 'REQUIREMENT-DOES-NOT-EXIST-2', method: 'test', outcome: 'pass' },
    ],
  };
  const index = buildComplianceIndex(input);
  const matrix = buildRequirementVerificationMatrix(index);

  it('produces one row per verification for a requirement with a closed verification', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-A-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      requirementLabel: 'A',
      verificationId: 'VERIFICATION-A-1',
      verificationLabel: 'Protocol A',
      verificationOutcome: 'pass',
    });
    expect(rows[0].coverageGap).toBeUndefined();
  });

  it('produces exactly one gap row for a requirement with no verification (REQ-VERIF-COVERAGE-001)', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-B-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].verificationId).toBeUndefined();
    expect(rows[0].coverageGap).toBe('REQ-VERIF-COVERAGE-001');
  });

  it('produces one row per verification, all carrying the gap, when none is closed (REQ-VERIF-COVERAGE-002)', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-C-1');
    expect(rows.map(r => r.verificationId).sort()).toEqual(['VERIFICATION-C-1', 'VERIFICATION-C-2']);
    expect(rows.every(r => r.coverageGap === 'REQ-VERIF-COVERAGE-002')).toBe(true);
    expect(rows.every(r => r.verificationOutcome !== undefined)).toBe(true);
  });

  it('resolves a direct parent id and label when the parent is admitted', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-D-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].parentId).toBe('REQUIREMENT-A-1');
    expect(rows[0].parentLabel).toBe('A');
  });

  it('never rolls a child verification up onto its parent', () => {
    const parentRows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-A-1');
    expect(parentRows.map(r => r.verificationId)).toEqual(['VERIFICATION-A-1']);
    expect(parentRows.some(r => r.verificationId === 'VERIFICATION-D-1')).toBe(false);
  });

  it('falls back to the verification id as its label when protocol is absent', () => {
    const row = matrix.rows.find(r => r.verificationId === 'VERIFICATION-D-1');
    expect(row?.verificationLabel).toBe('VERIFICATION-D-1');
  });

  it('keeps a dangling `parent` visible as a raw id with no resolved label', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-E-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].parentId).toBe('REQUIREMENT-DOES-NOT-EXIST-1');
    expect(rows[0].parentLabel).toBeUndefined();
  });

  it('never attaches a dangling `verifies` to any row, and does not count it', () => {
    expect(matrix.rows.some(r => r.verificationId === 'VERIFICATION-DANGLING-1')).toBe(false);
    // Only the 4 real verification rows (A-1, C-1, C-2, D-1) count.
    expect(matrix.summary.verifications).toBe(4);
  });

  it('summary counts requirements, real-verification rows, and gapped requirements', () => {
    expect(matrix.summary.requirements).toBe(5);
    expect(matrix.summary.gaps).toBe(3); // B-1 (-001), C-1 (-002), E-1 (-001, and also has a dangling parent)
  });

  it('omits parentId/parentLabel entirely for a requirement with no parent', () => {
    const row = matrix.rows.find(r => r.requirementId === 'REQUIREMENT-B-1');
    expect(row).not.toHaveProperty('parentId');
    expect(row).not.toHaveProperty('parentLabel');
  });

  it('orders rows by requirement id, then by verification id within a requirement', () => {
    const seen: string[] = [];
    for (const row of matrix.rows) {
      seen.push(`${row.requirementId}:${row.verificationId ?? ''}`);
    }
    const sorted = [...seen].sort((a, b) => {
      const [reqA, verA] = a.split(':');
      const [reqB, verB] = b.split(':');
      if (reqA !== reqB) return reqA < reqB ? -1 : 1;
      return verA < verB ? -1 : verA > verB ? 1 : 0;
    });
    expect(seen).toEqual(sorted);
  });

  it('is independent of input array order (deterministic ordering)', () => {
    const shuffled: ComplianceIndexInput = {
      requirements: [...input.requirements].reverse(),
      assertions: [],
      verifications: [...(input.verifications ?? [])].reverse(),
    };
    const shuffledMatrix = buildRequirementVerificationMatrix(buildComplianceIndex(shuffled));
    expect(shuffledMatrix).toEqual(matrix);
  });
});

// ── Repository-shaped fixture — loaded through the real classifier ─────────

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
function loadAll(dir: string): unknown[] {
  const full = path.join(fixtures, dir);
  return readdirSync(full)
    .filter(f => f.endsWith('.yaml'))
    .map(f => yaml.load(readFileSync(path.join(full, f), 'utf-8')));
}

describe('requirement-verification matrix — repository-shaped fixture', () => {
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

  it('ingests every requirement and verification with no duplicates', () => {
    expect(canon.duplicateIds).toEqual([]);
    expect(canon.requirements).toHaveLength(6);
  });

  it('covers the passing, multi-verification, and child-with-parent requirements', () => {
    const byReq = (id: string) => matrix.rows.filter(r => r.requirementId === id);

    const pass = byReq('REQUIREMENT-MATRIX-PASS-1');
    expect(pass).toHaveLength(1);
    expect(pass[0]).toMatchObject({ verificationId: 'VERIFICATION-MATRIX-PASS-1', verificationOutcome: 'pass' });
    expect(pass[0].coverageGap).toBeUndefined();

    const multi = byReq('REQUIREMENT-MATRIX-MULTI-1');
    expect(multi.map(r => r.verificationId).sort()).toEqual(['VERIFICATION-MATRIX-MULTI-1', 'VERIFICATION-MATRIX-MULTI-2']);
    expect(multi.every(r => r.coverageGap === undefined)).toBe(true);

    const child = byReq('REQUIREMENT-MATRIX-CHILD-1');
    expect(child).toHaveLength(1);
    expect(child[0].parentId).toBe('REQUIREMENT-MATRIX-PASS-1');
    expect(child[0].parentLabel).toBe('Matrix fixture — closed, passing verification');
  });

  it('flags the no-verification and unresolved-verification gaps exactly as repo validation would', () => {
    const none = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-MATRIX-NONE-1');
    expect(none).toHaveLength(1);
    expect(none[0].coverageGap).toBe('REQ-VERIF-COVERAGE-001');
    expect(none[0].verificationId).toBeUndefined();

    const open = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-MATRIX-OPEN-1');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ coverageGap: 'REQ-VERIF-COVERAGE-002', verificationOutcome: 'not_yet_run' });
  });

  it('keeps the broken parent reference visible as a raw id with no label', () => {
    const rows = matrix.rows.filter(r => r.requirementId === 'REQUIREMENT-MATRIX-BROKENPARENT-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].parentId).toBe('REQUIREMENT-MATRIX-DOES-NOT-EXIST-1');
    expect(rows[0].parentLabel).toBeUndefined();
    // This requirement has no verification of its own -> -001, same as any other unverified requirement.
    expect(rows[0].coverageGap).toBe('REQ-VERIF-COVERAGE-001');
  });

  it('drops the dangling VERIFICATION.verifies reference from every row', () => {
    expect(matrix.rows.some(r => r.verificationId === 'VERIFICATION-MATRIX-DANGLING-1')).toBe(false);
    // It does not fabricate a row for the id it dangles toward, either.
    expect(matrix.rows.some(r => r.requirementId === 'REQUIREMENT-MATRIX-DOES-NOT-EXIST-2')).toBe(false);
  });

  it('produces the same projection regardless of ingestion order', () => {
    const canonReversed = emptyCanon();
    for (const doc of [...loadAll('verification'), ...loadAll('requirement')].reverse()) {
      ingestComplianceDoc(canonReversed, doc);
    }
    const indexReversed = buildComplianceIndex({
      requirements: canonReversed.requirements,
      assertions: canonReversed.assertions,
      verifications: canonReversed.verifications,
    });
    expect(buildRequirementVerificationMatrix(indexReversed)).toEqual(matrix);
  });
});
