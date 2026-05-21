import type { ProcessGroupType, ProcessStatus } from './types.js';

export interface ValidationError { code: string; message: string; }
export interface ValidationWarning { code: string; message: string; }
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

const VALID_GROUP_TYPES = new Set<ProcessGroupType>(['operating', 'supporting', 'management']);
const VALID_STATUSES = new Set<ProcessStatus>(['Draft', 'Active', 'Deprecated']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateProcessMap(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'PMAP-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'PMAP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'process-map') {
    errors.push({ code: 'PMAP-001', message: `notation must be "process-map", got "${raw['notation']}"` });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  const map = raw['process_map'];
  if (!map || typeof map !== 'object') {
    errors.push({ code: 'PMAP-002', message: 'Missing required field: process_map' });
    return { valid: false, errors, warnings };
  }
  const m = map as Record<string, unknown>;

  if (!m['id'] || typeof m['id'] !== 'string' || !(m['id'] as string).trim()) {
    errors.push({ code: 'PMAP-002', message: 'process_map.id is required' });
  }
  if (!m['name'] || typeof m['name'] !== 'string' || !(m['name'] as string).trim()) {
    errors.push({ code: 'PMAP-002', message: 'process_map.name is required' });
  }
  if (!m['updated_at'] || typeof m['updated_at'] !== 'string') {
    errors.push({ code: 'PMAP-002', message: 'process_map.updated_at is required' });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(m['updated_at'] as string)) {
    errors.push({ code: 'PMAP-008', message: `process_map.updated_at must be YYYY-MM-DD, got "${m['updated_at']}"` });
  }

  const groups = m['groups'];
  if (!Array.isArray(groups)) {
    errors.push({ code: 'PMAP-002', message: 'process_map.groups must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenGroupIds = new Set<string>();
  const seenProcessIds = new Set<string>();

  for (let gi = 0; gi < groups.length; gi++) {
    const rawGroup = groups[gi];
    const gIdx = `groups[${gi}]`;

    if (!rawGroup || typeof rawGroup !== 'object') {
      errors.push({ code: 'PMAP-003', message: `${gIdx} must be an object` });
      continue;
    }
    const g = rawGroup as Record<string, unknown>;

    if (!g['id'] || typeof g['id'] !== 'string' || !(g['id'] as string).trim()) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: id is required` });
    } else {
      const gid = g['id'] as string;
      if (seenGroupIds.has(gid)) {
        errors.push({ code: 'PMAP-010', message: `Duplicate group id: "${gid}"` });
      }
      seenGroupIds.add(gid);
    }

    if (!g['name'] || typeof g['name'] !== 'string' || !(g['name'] as string).trim()) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: name is required` });
    }
    if (!g['type']) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: type is required` });
    } else if (!VALID_GROUP_TYPES.has(g['type'] as ProcessGroupType)) {
      errors.push({ code: 'PMAP-004', message: `${gIdx}: type "${g['type']}" must be one of: operating, supporting, management` });
    }

    const processes = g['processes'];
    if (processes !== undefined && !Array.isArray(processes)) {
      errors.push({ code: 'PMAP-003', message: `${gIdx}: processes must be an array` });
      continue;
    }

    const list = (processes ?? []) as unknown[];
    for (let pi = 0; pi < list.length; pi++) {
      const rawProcess = list[pi];
      const pIdx = `${gIdx}.processes[${pi}]`;

      if (!rawProcess || typeof rawProcess !== 'object') {
        errors.push({ code: 'PMAP-005', message: `${pIdx} must be an object` });
        continue;
      }
      const p = rawProcess as Record<string, unknown>;

      if (!p['process_id'] || typeof p['process_id'] !== 'string' || !(p['process_id'] as string).trim()) {
        errors.push({ code: 'PMAP-005', message: `${pIdx}: process_id is required` });
      } else {
        const pid = p['process_id'] as string;
        if (seenProcessIds.has(pid)) {
          errors.push({ code: 'PMAP-009', message: `Duplicate process_id: "${pid}"` });
        }
        seenProcessIds.add(pid);
      }

      if (!p['name'] || typeof p['name'] !== 'string' || !(p['name'] as string).trim()) {
        errors.push({ code: 'PMAP-005', message: `${pIdx}: name is required` });
      }
      if (!p['status']) {
        errors.push({ code: 'PMAP-005', message: `${pIdx}: status is required` });
      } else if (!VALID_STATUSES.has(p['status'] as ProcessStatus)) {
        errors.push({ code: 'PMAP-006', message: `${pIdx}: status "${p['status']}" must be one of: Draft, Active, Deprecated` });
      }

      if (p['maturity'] !== undefined) {
        const mat = p['maturity'];
        if (typeof mat !== 'number' || !Number.isInteger(mat) || mat < 1 || mat > 5) {
          errors.push({ code: 'PMAP-007', message: `${pIdx}: maturity must be an integer 1–5, got "${mat}"` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
