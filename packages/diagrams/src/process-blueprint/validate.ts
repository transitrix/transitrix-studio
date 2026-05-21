import type { AspectCategory } from './types.js';

export interface ValidationError { code: string; message: string; }
export interface ValidationWarning { code: string; message: string; }
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const ID_GRAMMAR_RE = /^[A-Z][A-Z_]*(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const PROCESS_BLUEPRINT_ID_RE = /^PROCESS_BLUEPRINT(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const STAGE_ID_RE = /^STAGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const APPLICATION_ID_RE = /^APPLICATION(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ROLE_ID_RE = /^ROLE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;

const ASPECT_CATEGORIES: AspectCategory[] = ['systems', 'actors', 'equipment', 'information_entities'];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function validateProcessBlueprint(input: unknown): ValidationResult {
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
  for (let i = 0; i < stagesRaw.length; i++) {
    const s = stagesRaw[i] as Record<string, unknown> | undefined;
    const path = `stages[${i}]`;
    if (!s || typeof s !== 'object') {
      errors.push({ code: 'BP-005', message: `${path} must be an object` });
      continue;
    }
    if (!isNonEmptyString(s['id'])) {
      errors.push({ code: 'BP-005', message: `${path}.id is required` });
    } else {
      const sid = s['id'];
      if (stageIds.has(sid)) {
        errors.push({ code: 'BP-006', message: `Duplicate stage id: "${sid}"` });
      } else {
        stageIds.add(sid);
      }
      if (!STAGE_ID_RE.test(sid)) {
        errors.push({
          code: 'BP-006',
          message: `${path}.id "${sid}" must match STAGE-[<middle>-]<INTEGER>`,
        });
      }
    }
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
          message: `${path}.stages must be a non-empty array of STAGE-… ids`,
        });
      } else {
        for (let j = 0; j < entryStages.length; j++) {
          const ref = entryStages[j];
          if (typeof ref !== 'string') {
            errors.push({ code: 'BP-008', message: `${path}.stages[${j}] must be a string` });
            continue;
          }
          if (!stageIds.has(ref)) {
            errors.push({
              code: 'BP-008',
              message: `${path}.stages[${j}] references undeclared stage "${ref}"`,
            });
          } else {
            usedStageIds.add(ref);
          }
        }

        if (entryStages.length === 1) {
          warnings.push({
            code: 'BP-012',
            message: `${path}.stages references a single stage — entry may be a candidate for inlining into the stage description`,
          });
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
