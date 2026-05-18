import type { ScenarioStatus, FactorRelevance } from './types.js';

export interface ValidationError { code: string; message: string; }
export interface ValidationWarning { code: string; message: string; }
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const VALID_STATUSES = new Set<ScenarioStatus>(['Draft', 'Active', 'Archived']);
const VALID_RELEVANCE = new Set<FactorRelevance>(['High', 'Medium', 'Low']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RefSpec {
  field: string;
  idField: string;
  errorCode: string;
}

const REF_SPECS: RefSpec[] = [
  { field: 'goals',        idField: 'goal_id',       errorCode: 'SCN-007' },
  { field: 'capabilities', idField: 'capability_id', errorCode: 'SCN-008' },
  { field: 'activities',   idField: 'activity_id',   errorCode: 'SCN-009' },
  { field: 'products',     idField: 'product_id',    errorCode: 'SCN-010' },
  { field: 'processes',    idField: 'process_id',    errorCode: 'SCN-011' },
  { field: 'applications', idField: 'app_id',        errorCode: 'SCN-012' },
];

export function validateScenario(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCN-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'SCN-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'scenarios') {
    errors.push({ code: 'SCN-001', message: `notation must be "scenarios", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const scn = raw['scenario'];
  if (!scn || typeof scn !== 'object') {
    errors.push({ code: 'SCN-002', message: 'Missing required field: scenario' });
    return { valid: false, errors, warnings };
  }
  const s = scn as Record<string, unknown>;

  if (!s['id'] || typeof s['id'] !== 'string' || !(s['id'] as string).trim())
    errors.push({ code: 'SCN-002', message: 'scenario.id is required' });
  if (!s['name'] || typeof s['name'] !== 'string' || !(s['name'] as string).trim())
    errors.push({ code: 'SCN-002', message: 'scenario.name is required' });
  if (!s['status']) {
    errors.push({ code: 'SCN-002', message: 'scenario.status is required' });
  } else if (!VALID_STATUSES.has(s['status'] as ScenarioStatus)) {
    errors.push({ code: 'SCN-003', message: `scenario.status "${s['status']}" must be one of: Draft, Active, Archived` });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  if (s['created_at'] !== undefined) {
    if (typeof s['created_at'] !== 'string' || !DATE_RE.test(s['created_at'] as string)) {
      errors.push({ code: 'SCN-004', message: `scenario.created_at must be YYYY-MM-DD, got "${s['created_at']}"` });
    }
  }

  if (s['factors_view'] !== undefined) {
    if (!Array.isArray(s['factors_view'])) {
      errors.push({ code: 'SCN-005', message: 'scenario.factors_view must be an array' });
    } else {
      const seen = new Set<string>();
      const fv = s['factors_view'] as unknown[];
      for (let i = 0; i < fv.length; i++) {
        const f = fv[i] as Record<string, unknown>;
        const idx = `factors_view[${i}]`;
        if (!f['factor_id'] || typeof f['factor_id'] !== 'string' || !(f['factor_id'] as string).trim()) {
          errors.push({ code: 'SCN-005', message: `${idx}: factor_id is required` });
        } else {
          const fid = f['factor_id'] as string;
          if (seen.has(fid)) errors.push({ code: 'SCN-013', message: `Duplicate factor_id: "${fid}"` });
          seen.add(fid);
        }
        if (f['relevance'] !== undefined && !VALID_RELEVANCE.has(f['relevance'] as FactorRelevance)) {
          errors.push({ code: 'SCN-006', message: `${idx}: relevance "${f['relevance']}" must be one of: High, Medium, Low` });
        }
      }
    }
  }

  for (const spec of REF_SPECS) {
    const list = s[spec.field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push({ code: spec.errorCode, message: `scenario.${spec.field} must be an array` });
      continue;
    }
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as Record<string, unknown>;
      const idx = `${spec.field}[${i}]`;
      const id = item?.[spec.idField];
      if (!id || typeof id !== 'string' || !(id as string).trim()) {
        errors.push({ code: spec.errorCode, message: `${idx}: ${spec.idField} is required` });
      } else {
        const sid = id as string;
        if (seen.has(sid)) errors.push({ code: spec.errorCode, message: `${idx}: duplicate ${spec.idField} "${sid}"` });
        seen.add(sid);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
