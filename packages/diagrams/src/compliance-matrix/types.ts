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
  /** Typed IDs of the codex sources this requirement derives from (verbatim
   *  from `derived_from`). Carried so the renderer can surface provenance and
   *  resolve jurisdictions without re-scanning. */
  derived_from?: string[];
  /** Jurisdictions resolved by walking `derived_from` → codex artefacts and
   *  collecting their `jurisdiction` (Codex §1.1). Unique, sorted. Empty when
   *  no codex source resolves with a jurisdiction (internal-only requirements,
   *  or codex artefacts the scan did not find / has no jurisdiction). The
   *  toolbar jurisdiction filter (F16) keys on this set. */
  jurisdictions?: string[];
}

/** A codex source document the matrix uses to resolve `Requirement.jurisdictions`. */
export interface MatrixCodexDoc {
  id: string;
  jurisdiction?: string;
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
  /** Codex source documents — used to resolve each Requirement's jurisdictions
   *  by walking `derived_from`. Optional: when omitted the builder still works
   *  and every requirement's `jurisdictions` is left empty. */
  codex?: MatrixCodexDoc[];
}

/** Toolbar filter — empty/omitted fields mean "no filter on that dimension". */
export interface MatrixFilter {
  /** Keep only requirement columns whose severity is in this set. */
  severities?: string[];
  /** Keep only the cell status badges in this set; others render as filtered. */
  statuses?: AssertionStatus[];
  /** Keep only requirement columns whose resolved jurisdictions intersect this
   *  set. Requirements with no resolved jurisdiction are filtered out when this
   *  is non-empty (F16, epic #84). */
  jurisdictions?: string[];
}
