import type { CapabilityType } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const VALID_TYPES = new Set<CapabilityType>(['domain', 'supporting']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CAP_ID_RE = /^(V|H)\d+(\.\d+)*$/;

export function validateCapabilityMap(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'CMAP-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if (!('notation' in raw)) {
    errors.push({ code: 'CMAP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'capability-map') {
    errors.push({ code: 'CMAP-001', message: `notation must be "capability-map", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const map = raw['capability_map'];
  if (!map || typeof map !== 'object') {
    errors.push({ code: 'CMAP-002', message: 'Missing required field: capability_map' });
    return { valid: false, errors, warnings };
  }
  const m = map as Record<string, unknown>;

  if (!m['id'] || typeof m['id'] !== 'string' || !(m['id'] as string).trim())
    errors.push({ code: 'CMAP-002', message: 'capability_map.id is required' });
  if (!m['name'] || typeof m['name'] !== 'string' || !(m['name'] as string).trim())
    errors.push({ code: 'CMAP-002', message: 'capability_map.name is required' });
  if (!m['assessment_date'] || typeof m['assessment_date'] !== 'string')
    errors.push({ code: 'CMAP-002', message: 'capability_map.assessment_date is required' });

  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(m['assessment_date'] as string))
    errors.push({ code: 'CMAP-007', message: `capability_map.assessment_date must be YYYY-MM-DD, got "${m['assessment_date']}"` });

  const caps = m['capabilities'];
  if (!Array.isArray(caps)) {
    errors.push({ code: 'CMAP-002', message: 'capability_map.capabilities must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  validateCapabilityTree(caps, 'capabilities', errors, seenIds);

  return { valid: errors.length === 0, errors, warnings };
}

function validateCapabilityTree(
  nodes: unknown[],
  pathPrefix: string,
  errors: ValidationError[],
  seenIds: Set<string>,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const rawNode = nodes[i];
    const nodePath = `${pathPrefix}[${i}]`;

    if (!rawNode || typeof rawNode !== 'object') {
      errors.push({ code: 'CMAP-003', message: `${nodePath} must be an object` });
      continue;
    }
    const node = rawNode as Record<string, unknown>;

    if (!node['id'] || typeof node['id'] !== 'string' || !(node['id'] as string).trim()) {
      errors.push({ code: 'CMAP-003', message: `${nodePath}: id is required` });
    } else {
      const id = node['id'] as string;
      if (seenIds.has(id)) {
        errors.push({ code: 'CMAP-008', message: `Duplicate capability id: "${id}"` });
      }
      seenIds.add(id);
      if (!CAP_ID_RE.test(id)) {
        errors.push({ code: 'CMAP-009', message: `${nodePath}: id "${id}" must match pattern V[n] or H[n] with optional .n segments (e.g. V1, V1.2, H1.3)` });
      }
    }

    if (!node['name'] || typeof node['name'] !== 'string' || !(node['name'] as string).trim())
      errors.push({ code: 'CMAP-003', message: `${nodePath}: name is required` });

    if (node['current_maturity'] === undefined) {
      errors.push({ code: 'CMAP-003', message: `${nodePath}: current_maturity is required` });
    } else {
      const cm = node['current_maturity'];
      if (typeof cm !== 'number' || !Number.isInteger(cm) || cm < 1 || cm > 5)
        errors.push({ code: 'CMAP-005', message: `${nodePath}: current_maturity must be an integer 1–5, got "${cm}"` });
    }

    if (node['target_maturity'] !== undefined) {
      const tm = node['target_maturity'];
      if (typeof tm !== 'number' || !Number.isInteger(tm) || tm < 1 || tm > 5)
        errors.push({ code: 'CMAP-006', message: `${nodePath}: target_maturity must be an integer 1–5, got "${tm}"` });
    }

    if (node['type'] !== undefined && !VALID_TYPES.has(node['type'] as CapabilityType))
      errors.push({ code: 'CMAP-004', message: `${nodePath}: type "${node['type']}" must be one of: domain, supporting` });

    if (node['target_date'] !== undefined) {
      if (typeof node['target_date'] !== 'string' || !DATE_RE.test(node['target_date'] as string))
        errors.push({ code: 'CMAP-007', message: `${nodePath}: target_date must be YYYY-MM-DD, got "${node['target_date']}"` });
    }

    if (node['applications'] !== undefined && !Array.isArray(node['applications']))
      errors.push({ code: 'CMAP-003', message: `${nodePath}: applications must be an array` });

    if (node['children'] !== undefined) {
      if (!Array.isArray(node['children'])) {
        errors.push({ code: 'CMAP-003', message: `${nodePath}: children must be an array` });
      } else {
        validateCapabilityTree(node['children'] as unknown[], `${nodePath}.children`, errors, seenIds);
      }
    }
  }
}
