// Compliance matrix model (vkgeorgia/strategy#84 Phase 2).
//
// The matrix is Products × Requirements. Each cell is the status of the
// (Product, Requirement) ASSERTION when one exists, or a gap when none does.
// Pure data — the layout is computed by `build.ts`; the Studio preview renders
// it. Non-product-subject assertions (CAPABILITY / PROCESS) belong to the
// single-product / single-law views (Phase 3) and are ignored here.

import type { AssertionStatus } from '../assertion/types.js';

/** A row of the matrix — a discovered PRODUCT element. */
export interface MatrixProduct {
  id: string;
  name: string;
  /** True when the product was discovered only as an assertion subject (no
   *  product element file resolves it) — a dangling subject reference. */
  unresolved?: boolean;
}

/** A column of the matrix — a discovered REQUIREMENT. */
export interface MatrixRequirement {
  id: string;
  name: string;
  /** Organisation-defined priority (high | medium | low), used by the filter. */
  severity?: string;
}

/** The assertion fields the matrix needs (a projection of the full Assertion). */
export interface MatrixAssertionRef {
  id: string;
  about: string;
  subject: string;
  status: AssertionStatus;
  assessed_at?: string;
  next_review_at?: string;
}

/** One grid cell. `status === undefined` is a gap (no assertion for the pair). */
export interface MatrixCell {
  productId: string;
  requirementId: string;
  /** The assertion filling this cell, when one exists. */
  assertionId?: string;
  status?: AssertionStatus;
  assessed_at?: string;
  next_review_at?: string;
}

export interface ComplianceMatrix {
  /** Rows, sorted by id. */
  products: MatrixProduct[];
  /** Columns, sorted by id. */
  requirements: MatrixRequirement[];
  /** `cells[rowIndex][colIndex]`, aligned to `products` × `requirements`. */
  cells: MatrixCell[][];
  /** Counts for the summary strip. */
  summary: {
    products: number;
    requirements: number;
    assertions: number;
    /** Cells with no assertion (compliance gaps). */
    gaps: number;
  };
}

export interface ComplianceMatrixInput {
  products: MatrixProduct[];
  requirements: MatrixRequirement[];
  assertions: MatrixAssertionRef[];
}

/** Toolbar filter — empty/omitted fields mean "no filter on that dimension". */
export interface MatrixFilter {
  /** Keep only requirement columns whose severity is in this set. */
  severities?: string[];
  /** Keep only the cell status badges in this set; others render as filtered. */
  statuses?: AssertionStatus[];
}
