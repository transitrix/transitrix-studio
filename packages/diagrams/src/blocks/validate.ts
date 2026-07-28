import type { Block, GridColumn, GridHeader, GridRow } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

/**
 * A template-level check over an already well-formed grid document (matrix
 * subset, §4a). Templates built on the `grid:` root (e.g. RACI) supply their
 * own `GridRule`s for vocabulary-specific invariants — the base validator
 * intentionally does not fix what `assign` values mean (08-blocks.md §6a), so
 * those invariants never live inside `validateGrid` itself.
 */
export interface GridRule {
  /** Template-namespaced rule code, e.g. "RACI-001" — never a BL-0xx code. */
  ruleId: string;
  severity: 'error' | 'warning';
  check(grid: GridHeader): Array<{ message: string; path?: string }>;
}

export interface ValidateGridOptions {
  /** Extra template-level rules to run once the base grid is well-formed. */
  rules?: GridRule[];
}

/** Document-level ID grammar: BLOCKS-[<middle>-]<INTEGER>. */
const BLOCKS_DOC_ID_RE = /^BLOCKS(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

/**
 * Canonical cross-reference ID grammar — `<TYPE>-[<middle>-]<INTEGER>` with
 * an uppercase TYPE prefix and a positive-integer terminal.
 *
 * Block IDs that match this shape are treated as cross-references to an
 * organisational catalogue and must use a TYPE registered in
 * IDS_AND_REFERENCES.md §3.1. IDs that do not match the shape (e.g.
 * `APPLICATION_LAYER`, `FRONTEND`) are notation-local labels and are
 * accepted as-is.
 */
const CANONICAL_ID_RE = /^[A-Z][A-Z0-9_]*(-[A-Z0-9][A-Z0-9_]*)+-\d+$/;

/**
 * `CAPABILITY` is the registered exception in IDS_AND_REFERENCES.md §2 — its
 * terminal is a V/H diagram address (`V1`, `V1.2`, `V1.2.3`, `H1.2`), not a
 * plain integer. A capability ID never matches CANONICAL_ID_RE because of the
 * dot, so we recognise it separately.
 */
const CAPABILITY_ID_RE = /^CAPABILITY-[VH]\d+(\.\d+){0,2}$/;

/**
 * Element-level TYPE registry — IDS_AND_REFERENCES.md §3.1, plus
 * `VERIFICATION` (§3.7): block diagrams cross-reference the full
 * hazard → risk-control → requirement → verification chain, and
 * `VERIFICATION` is the terminal link in that chain.
 *
 * `FACTOR` and `ACTIVITY` are kept alongside their canonical replacements
 * `DRIVER` and `ACTION` — both still-valid grandfathered/deprecated aliases
 * per §3.1 and §6, not yet forced to migrate.
 *
 * `UNIT`/`EMPLOYEE` (replaced by `ACTOR`, removed from canon 2026-05-29) and
 * `ISSUE` (retired 2026-06-07, no replacement TYPE — see methodology
 * `docs/decisions/2026-06-07-retire-model-issue-type.md`) are deliberately
 * not carried forward. `STAGE` was never a canonical TYPE.
 */
export const REGISTERED_ELEMENT_TYPES = new Set<string>([
  'DRIVER',
  'FACTOR',
  'GOAL',
  'CHANGE',
  'ACTION',
  'ACTIVITY',
  'CAPABILITY',
  'PROCESS',
  'STEP',
  'PRODUCT',
  'APPLICATION',
  'INTEGRATION',
  'ROLE',
  'ACTOR',
  'LOCATION',
  'BUSINESS_SERVICE',
  'SCENARIO',
  'EQUIPMENT',
  'NODE',
  'TECHNOLOGY_SERVICE',
  'BUSINESS_OBJECT',
  'RULE',
  'REGISTRY',
  'CONSTRAINT',
  'REQUIREMENT',
  'STAKEHOLDER',
  'ASSESSMENT',
  'HAZARD',
  'RISK_CONTROL',
  'TARGET_STATE',
  'REL',
  'MILESTONE',
  'VERIFICATION',
]);

/**
 * Recommended maximum nesting depth (1-indexed). The spec warns at depth 6+;
 * deeper nesting tends to produce inner boxes too small to read.
 */
const RECOMMENDED_MAX_DEPTH = 5;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function extractTypePrefix(id: string): string {
  const dash = id.indexOf('-');
  return dash >= 0 ? id.slice(0, dash) : id;
}

export function validateNestedBlocks(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'BL-001', message: 'Input must be an object' }],
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'blocks') {
    errors.push({
      code: 'BL-001',
      message: `notation must be "blocks", got "${String(raw['notation'])}"`,
    });
  }

  if (!('nested_blocks' in raw) || !raw['nested_blocks'] || typeof raw['nested_blocks'] !== 'object') {
    errors.push({ code: 'BL-001', message: 'Missing required root key: nested_blocks' });
    return { valid: false, errors, warnings };
  }

  const nb = raw['nested_blocks'] as Record<string, unknown>;

  if (!isNonEmptyString(nb['id'])) {
    errors.push({ code: 'BL-002', message: 'nested_blocks.id is required' });
  } else if (!BLOCKS_DOC_ID_RE.test(nb['id'])) {
    errors.push({
      code: 'BL-002',
      message: `nested_blocks.id "${nb['id']}" must match BLOCKS-[<middle>-]<INTEGER>`,
    });
  }

  if (!isNonEmptyString(nb['name'])) {
    errors.push({ code: 'BL-003', message: 'nested_blocks.name is required' });
  }

  const topLevel = nb['blocks'];
  if (!Array.isArray(topLevel) || topLevel.length === 0) {
    errors.push({ code: 'BL-004', message: 'nested_blocks.blocks must be a non-empty array' });
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  let maxDepthSeen = 0;

  function walk(node: unknown, path: string, depth: number): void {
    if (depth > maxDepthSeen) maxDepthSeen = depth;

    if (!node || typeof node !== 'object') {
      errors.push({ code: 'BL-005', message: `${path} must be an object`, path });
      return;
    }
    const b = node as Record<string, unknown>;

    if (!isNonEmptyString(b['id'])) {
      errors.push({ code: 'BL-005', message: `${path}.id is required`, path });
    } else {
      const id = b['id'].trim();
      if (seenIds.has(id)) {
        errors.push({ code: 'BL-007', message: `Duplicate block id: "${id}"`, path });
      } else {
        seenIds.add(id);
      }

      // BL-006 — only enforce when the id LOOKS canonical (uppercase TYPE prefix
      // + dashed segments + integer terminal, or the CAPABILITY V/H exception).
      // Free-form local labels with whitespace, lowercase, etc. are accepted.
      const looksCanonical = CANONICAL_ID_RE.test(id) || CAPABILITY_ID_RE.test(id);
      if (looksCanonical) {
        const typePrefix = extractTypePrefix(id);
        if (!REGISTERED_ELEMENT_TYPES.has(typePrefix)) {
          errors.push({
            code: 'BL-006',
            message: `${path}.id "${id}" uses TYPE prefix "${typePrefix}" which is not in the registered element-type list. Use a registered TYPE (FACTOR, GOAL, CAPABILITY, APPLICATION, …) or a free-form local label.`,
            path,
          });
        }
      } else if (/\s/.test(id)) {
        errors.push({
          code: 'BL-005',
          message: `${path}.id "${id}" must not contain whitespace; use a slug-style local label or a canonical cross-reference id`,
          path,
        });
      }
    }

    if (!isNonEmptyString(b['name'])) {
      errors.push({ code: 'BL-005', message: `${path}.name is required`, path });
    }

    const children = b['children'];
    if (children === undefined) return;
    if (!Array.isArray(children)) {
      errors.push({ code: 'BL-005', message: `${path}.children must be an array when present`, path });
      return;
    }
    if (children.length === 0) {
      warnings.push({
        code: 'BL-009',
        message: `${path}.children is an empty array — omit the key for leaf blocks`,
        path,
      });
      return;
    }
    for (let i = 0; i < children.length; i++) {
      walk(children[i], `${path}.children[${i}]`, depth + 1);
    }
  }

  for (let i = 0; i < topLevel.length; i++) {
    walk(topLevel[i], `blocks[${i}]`, 1);
  }

  if (maxDepthSeen > RECOMMENDED_MAX_DEPTH) {
    warnings.push({
      code: 'BL-008',
      message: `Nesting depth ${maxDepthSeen} exceeds the recommended maximum of ${RECOMMENDED_MAX_DEPTH}; inner blocks may render too small to read`,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Matrix subset (§4a): validate a `grid:` root document — BL-021..BL-025. */
export function validateGrid(input: unknown, options: ValidateGridOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'BL-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'blocks') {
    errors.push({
      code: 'BL-001',
      message: `notation must be "blocks", got "${String(raw['notation'])}"`,
    });
  }

  if (!('grid' in raw) || !raw['grid'] || typeof raw['grid'] !== 'object') {
    errors.push({ code: 'BL-020', message: 'Missing required root key: grid' });
    return { valid: false, errors, warnings };
  }

  const grid = raw['grid'] as Record<string, unknown>;
  const rawColumns = grid['columns'];
  const rawRows = grid['rows'];

  if (!Array.isArray(rawColumns) || rawColumns.length === 0) {
    errors.push({ code: 'BL-021', message: 'grid.columns must be a non-empty array' });
  }
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    errors.push({ code: 'BL-022', message: 'grid.rows must be a non-empty array' });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const columnIds = new Set<string>();
  const columns: GridColumn[] = [];
  (rawColumns as unknown[]).forEach((entry, i) => {
    const path = `grid.columns[${i}]`;
    const c = entry as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || !isNonEmptyString(c['id']) || !isNonEmptyString(c['name'])) {
      errors.push({ code: 'BL-023', message: `${path} must have non-empty id and name`, path });
      return;
    }
    const id = c['id'].trim();
    if (columnIds.has(id)) {
      errors.push({ code: 'BL-024', message: `Duplicate column id: "${id}"`, path });
    } else {
      columnIds.add(id);
    }
    columns.push({ id, name: c['name'] });
  });

  const rowIds = new Set<string>();
  const rows: GridRow[] = [];
  (rawRows as unknown[]).forEach((entry, i) => {
    const path = `grid.rows[${i}]`;
    const r = entry as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || !isNonEmptyString(r['id']) || !isNonEmptyString(r['name'])) {
      errors.push({ code: 'BL-023', message: `${path} must have non-empty id and name`, path });
      return;
    }
    const id = r['id'].trim();
    if (rowIds.has(id)) {
      errors.push({ code: 'BL-024', message: `Duplicate row id: "${id}"`, path });
    } else {
      rowIds.add(id);
    }

    const rawAssign = r['assign'];
    let assign: Record<string, unknown> | undefined;
    if (rawAssign !== undefined) {
      if (!rawAssign || typeof rawAssign !== 'object' || Array.isArray(rawAssign)) {
        errors.push({ code: 'BL-023', message: `${path}.assign must be a map when present`, path });
      } else {
        assign = rawAssign as Record<string, unknown>;
        for (const colId of Object.keys(assign)) {
          if (!columnIds.has(colId)) {
            errors.push({
              code: 'BL-025',
              message: `${path}.assign references unknown column id "${colId}"`,
              path,
            });
          }
        }
      }
    }
    rows.push({ id, name: r['name'], assign });
  });

  if (errors.length > 0) return { valid: false, errors, warnings };

  const grid_: GridHeader = { columns, rows };
  for (const rule of options.rules ?? []) {
    for (const finding of rule.check(grid_)) {
      const entry = { code: rule.ruleId, message: finding.message, path: finding.path };
      if (rule.severity === 'error') errors.push(entry);
      else warnings.push(entry);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export interface ValidateBlocksOptions extends ValidateGridOptions {}

/**
 * Root-form dispatcher (§4/§4a): a document declares exactly one of
 * `nested_blocks` (tree form) or `grid` (matrix subset) — never both, never
 * neither (BL-020). Delegates to whichever form is present.
 */
export function validateBlocks(input: unknown, options: ValidateBlocksOptions = {}): ValidationResult {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'BL-001', message: 'Input must be an object' }], warnings: [] };
  }

  const raw = input as Record<string, unknown>;
  const hasNested = raw['nested_blocks'] !== undefined && raw['nested_blocks'] !== null;
  const hasGrid = raw['grid'] !== undefined && raw['grid'] !== null;

  if (hasNested && hasGrid) {
    return {
      valid: false,
      errors: [{ code: 'BL-020', message: 'Document root must declare exactly one of nested_blocks or grid, not both' }],
      warnings: [],
    };
  }
  if (hasGrid) return validateGrid(input, options);
  if (hasNested) return validateNestedBlocks(input);

  return {
    valid: false,
    errors: [{ code: 'BL-020', message: 'Document root must declare exactly one of nested_blocks or grid' }],
    warnings: [],
  };
}

/**
 * Convenience: validate a single `Block` subtree. Used by tests and by
 * downstream consumers that need to check a sub-document.
 */
export function isWellFormedBlock(b: Block): boolean {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.id !== 'string' || b.id.trim() === '') return false;
  if (typeof b.name !== 'string' || b.name.trim() === '') return false;
  if (b.children !== undefined) {
    if (!Array.isArray(b.children)) return false;
    for (const c of b.children) {
      if (!isWellFormedBlock(c)) return false;
    }
  }
  return true;
}
