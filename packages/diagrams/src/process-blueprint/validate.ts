import type { AspectCategory } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import type { CanonCatalog } from '../typed-id.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const ID_GRAMMAR_RE = /^[A-Z][A-Z_]*(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const PROCESS_BLUEPRINT_ID_RE = /^PROCESS_BLUEPRINT(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const STAGE_ID_RE = /^STAGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const PROCESS_ID_RE = /^PROCESS(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const APPLICATION_ID_RE = /^APPLICATION(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ROLE_ID_RE = /^ROLE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

const ASPECT_CATEGORIES: AspectCategory[] = ['systems', 'actors', 'equipment', 'information_entities'];

const RESTATED_COLUMN_FIELDS = ['name', 'goal', 'result'] as const;

export interface ProcessParentEdge {
  /** Child process id (`from`). */
  from: string;
  /** Parent process id (`to`). */
  to: string;
}

export interface ProcessBlueprintValidateOptions {
  /** When provided, BP-012 resolves `PROCESS-…` column ids against admitted canon. */
  catalog?: CanonCatalog;
  /**
   * In-effect `process_parent` edges (child → parent). When provided, BP-014
   * warns if `process_blueprint.process` is set and a `PROCESS-…` column has
   * no such edge to that parent. Omit to skip BP-014 (file-scope without the
   * relation catalogue).
   */
  processParentEdges?: readonly ProcessParentEdge[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function isProcessColumnId(id: string): boolean {
  return PROCESS_ID_RE.test(id);
}

function isStageColumnId(id: string): boolean {
  return STAGE_ID_RE.test(id);
}

function isColumnId(id: string): boolean {
  return isStageColumnId(id) || isProcessColumnId(id);
}

function fieldIsPresent(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function validateProcessBlueprint(
  input: unknown,
  options: ProcessBlueprintValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'BP-001', message: 'Input must be an object' }],
      warnings,
    };
  }

  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'process-blueprint') {
    errors.push({
      code: 'BP-001',
      message: `notation must be "process-blueprint", got "${String(raw['notation'])}"`,
    });
  }

  if (!('process_blueprint' in raw) || !raw['process_blueprint'] || typeof raw['process_blueprint'] !== 'object') {
    errors.push({ code: 'BP-001', message: 'Missing required root key: process_blueprint' });
    return { valid: false, errors, warnings };
  }

  const pb = raw['process_blueprint'] as Record<string, unknown>;

  if (!isNonEmptyString(pb['id'])) {
    errors.push({ code: 'BP-002', message: 'process_blueprint.id is required' });
  } else if (!PROCESS_BLUEPRINT_ID_RE.test(pb['id'])) {
    errors.push({
      code: 'BP-002',
      message: `process_blueprint.id "${pb['id']}" must match PROCESS_BLUEPRINT-[<middle>-]<INTEGER>`,
    });
  }

  if (!isNonEmptyString(pb['name'])) {
    errors.push({ code: 'BP-003', message: 'process_blueprint.name is required' });
  }

  const stagesRaw = pb['stages'];
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
    errors.push({ code: 'BP-004', message: 'process_blueprint.stages must be a non-empty array' });
    return { valid: false, errors, warnings };
  }

  const stageIds = new Set<string>();
  const processColumnIds: string[] = [];
  for (let i = 0; i < stagesRaw.length; i++) {
    const s = stagesRaw[i] as Record<string, unknown> | undefined;
    const path = `stages[${i}]`;
    if (!s || typeof s !== 'object') {
      errors.push({ code: 'BP-005', message: `${path} must be an object` });
      continue;
    }
    if (!isNonEmptyString(s['id'])) {
      errors.push({ code: 'BP-006', message: `${path}.id is required` });
      continue;
    }

    const sid = s['id'].trim();
    if (stageIds.has(sid)) {
      errors.push({ code: 'BP-006', message: `Duplicate stage id: "${sid}"` });
    } else {
      stageIds.add(sid);
    }
    if (!isColumnId(sid)) {
      errors.push({
        code: 'BP-006',
        message: `${path}.id "${sid}" must match STAGE-[<middle>-]<INTEGER> or PROCESS-[<middle>-]<INTEGER>`,
      });
      continue;
    }

    if (isProcessColumnId(sid)) {
      processColumnIds.push(sid);
      for (const field of RESTATED_COLUMN_FIELDS) {
        if (fieldIsPresent(s, field)) {
          errors.push({
            code: 'BP-013',
            message: `${path}.${field} must not be restated on a PROCESS-… column — derive it from the process element`,
          });
        }
      }
      if (options.catalog) {
        const resolved = options.catalog.typeOf(sid);
        if (resolved !== 'PROCESS') {
          errors.push({
            code: 'BP-012',
            message: `${path}.id "${sid}" must resolve to an admitted PROCESS element`,
          });
        }
      }
    } else {
      if (!isNonEmptyString(s['name'])) {
        errors.push({ code: 'BP-005', message: `${path}.name is required` });
      }
      if (!isNonEmptyString(s['goal'])) {
        errors.push({ code: 'BP-005', message: `${path}.goal is required` });
      }
      if (!isNonEmptyString(s['result'])) {
        errors.push({ code: 'BP-005', message: `${path}.result is required` });
      }
    }
  }

  const parentProcess = isNonEmptyString(pb['process']) ? pb['process'].trim() : undefined;
  if (parentProcess && options.processParentEdges && processColumnIds.length > 0) {
    const linked = new Set(
      options.processParentEdges
        .filter((e) => e.to === parentProcess)
        .map((e) => e.from),
    );
    for (const child of processColumnIds) {
      if (!linked.has(child)) {
        warnings.push({
          code: 'BP-014',
          message:
            `Column "${child}" is a PROCESS-… id and process_blueprint.process is "${parentProcess}", ` +
            `but no in-effect process_parent REL links that column to that parent`,
        });
      }
    }
  }

  const usedStageIds = new Set<string>();

  for (const category of ASPECT_CATEGORIES) {
    const arr = pb[category];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      errors.push({ code: 'BP-007', message: `process_blueprint.${category} must be an array` });
      continue;
    }

    for (let i = 0; i < arr.length; i++) {
      const e = arr[i] as Record<string, unknown> | undefined;
      const path = `${category}[${i}]`;
      if (!e || typeof e !== 'object') {
        errors.push({ code: 'BP-007', message: `${path} must be an object` });
        continue;
      }

      if (!isNonEmptyString(e['name'])) {
        errors.push({ code: 'BP-007', message: `${path}.name is required` });
      }

      const entryStages = e['stages'];
      if (!Array.isArray(entryStages) || entryStages.length === 0) {
        errors.push({
          code: 'BP-007',
          message: `${path}.stages must be a non-empty array of declared column ids`,
        });
      } else {
        for (let j = 0; j < entryStages.length; j++) {
          const ref = entryStages[j];
          if (typeof ref !== 'string') {
            errors.push({ code: 'BP-008', message: `${path}.stages[${j}] must be a string` });
            continue;
          }
          const refTrimmed = ref.trim();
          if (!stageIds.has(refTrimmed)) {
            errors.push({
              code: 'BP-008',
              message: `${path}.stages[${j}] references undeclared stage "${ref}"`,
            });
          } else {
            usedStageIds.add(refTrimmed);
          }
        }
      }

      const entryId = e['id'];
      if (entryId !== undefined) {
        if (typeof entryId !== 'string') {
          errors.push({ code: 'BP-009', message: `${path}.id must be a string` });
        } else if (!ID_GRAMMAR_RE.test(entryId)) {
          errors.push({
            code: 'BP-009',
            message: `${path}.id "${entryId}" must match <TYPE>-[<middle>-]<INTEGER>`,
          });
        } else if (category === 'systems' && !APPLICATION_ID_RE.test(entryId)) {
          errors.push({
            code: 'BP-010',
            message: `${path}.id "${entryId}" must use the APPLICATION- prefix`,
          });
        } else if (category === 'actors' && !ROLE_ID_RE.test(entryId)) {
          errors.push({
            code: 'BP-010',
            message: `${path}.id "${entryId}" must use the ROLE- prefix`,
          });
        }
      }
    }
  }

  for (const sid of stageIds) {
    if (!usedStageIds.has(sid)) {
      warnings.push({
        code: 'BP-011',
        message: `Stage "${sid}" has no aspect entries pointing at it — structurally empty`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
