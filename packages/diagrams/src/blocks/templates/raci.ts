import type { GridRule } from '../validate.js';

/**
 * RACI-as-matrix template (methodology `templates/raci/`), built on the
 * `blocks` matrix subset (08-blocks.md §4a). The base grid validator does not
 * fix a cell-value vocabulary, so this invariant — exactly one Accountable
 * owner per row — lives here, not in `validateGrid` (see §6a).
 */
export const raciExactlyOneAccountableRule: GridRule = {
  ruleId: 'RACI-001',
  severity: 'error',
  check(grid) {
    const findings: Array<{ message: string; path?: string }> = [];
    grid.rows.forEach((row, i) => {
      const accountableCount = Object.values(row.assign ?? {}).filter((v) => v === 'A').length;
      if (accountableCount !== 1) {
        findings.push({
          message:
            `Row "${row.name}" (${row.id}) must have exactly one column assigned "A" (Accountable); found ${accountableCount}`,
          path: `grid.rows[${i}]`,
        });
      }
    });
    return findings;
  },
};

export const RACI_GRID_RULES: GridRule[] = [raciExactlyOneAccountableRule];
