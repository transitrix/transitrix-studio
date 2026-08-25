// Deterministic CSV serialiser for the requirement-verification matrix.
// Same row order as `buildRequirementVerificationMatrix` (requirement id,
// then verification id). CRLF line endings, RFC-4180 quoting — the same
// convention as the Gap Dashboard export.

import type { RequirementVerificationMatrix, RequirementVerificationRow } from './types.js';

const HEADER = [
  'requirement_id',
  'requirement_label',
  'parent_id',
  'parent_label',
  'related_test_result_id',
  'related_test_result_label',
  'outcome',
  'coverage_gap',
] as const;

function csvCell(value: string | undefined): string {
  const v = value ?? '';
  return `"${v.replace(/"/g, '""')}"`;
}

function rowCells(row: RequirementVerificationRow): string[] {
  return [
    row.requirementId,
    row.requirementLabel,
    row.parentId ?? '',
    row.parentLabel ?? '',
    row.verificationId ?? '',
    row.verificationLabel ?? '',
    row.verificationOutcome ?? '',
    row.coverageGap ?? '',
  ];
}

/**
 * Serialise the matrix to CSV. Identical input yields byte-identical output;
 * the row order is the builder's stable order.
 */
export function renderRequirementVerificationMatrixCsv(matrix: RequirementVerificationMatrix): string {
  const lines = [HEADER.map(h => csvCell(h)).join(',')];
  for (const row of matrix.rows) {
    lines.push(rowCells(row).map(csvCell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
