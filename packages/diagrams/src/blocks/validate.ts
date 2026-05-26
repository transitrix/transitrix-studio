import type { Block } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

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

/** Element-level TYPE registry — IDS_AND_REFERENCES.md §3.1. */
const REGISTERED_ELEMENT_TYPES = new Set<string>([
  'FACTOR',
  'GOAL',
  'CHANGE',
  'ACTIVITY',
  'CAPABILITY',
  'PROCESS',
  'PRODUCT',
  'APPLICATION',
  'INTEGRATION',
  'ROLE',
  'UNIT',
  'EMPLOYEE',
  'SCENARIO',
  'ISSUE',
  'STAGE',
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
