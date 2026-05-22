import type { ApplicationsCatalogueFile, ApplicationType, ApplicationStatus, IntegrationDirection } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const VALID_TYPES = new Set<ApplicationType>(['application', 'integration', 'platform', 'data_store']);
const VALID_STATUSES = new Set<ApplicationStatus>(['Draft', 'Active', 'Deprecated', 'Decommissioning']);
const VALID_DIRECTIONS = new Set<IntegrationDirection>(['inbound', 'outbound', 'bidirectional']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateApplicationsCatalogue(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'APP-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  // APP-001: notation header
  if (!('notation' in raw)) {
    errors.push({ code: 'APP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'applications') {
    errors.push({ code: 'APP-001', message: `notation must be "applications", got "${raw['notation']}"` });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // APP-002: catalogue header fields
  if (!raw['applications_catalogue'] || typeof raw['applications_catalogue'] !== 'object') {
    errors.push({ code: 'APP-002', message: 'Missing required field: applications_catalogue' });
    return { valid: false, errors, warnings };
  }

  const cat = raw['applications_catalogue'] as Record<string, unknown>;

  if (!cat['id'] || typeof cat['id'] !== 'string' || !(cat['id'] as string).trim()) {
    errors.push({ code: 'APP-002', message: 'applications_catalogue.id is required' });
  }
  if (!cat['name'] || typeof cat['name'] !== 'string' || !(cat['name'] as string).trim()) {
    errors.push({ code: 'APP-002', message: 'applications_catalogue.name is required' });
  }
  if (!cat['updated_at'] || typeof cat['updated_at'] !== 'string') {
    errors.push({ code: 'APP-002', message: 'applications_catalogue.updated_at is required' });
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // APP-007: updated_at format
  if (!DATE_RE.test(cat['updated_at'] as string)) {
    errors.push({ code: 'APP-007', message: `applications_catalogue.updated_at must be YYYY-MM-DD, got "${cat['updated_at']}"` });
  }

  const applications = cat['applications'];
  if (!Array.isArray(applications)) {
    errors.push({ code: 'APP-002', message: 'applications_catalogue.applications must be an array' });
    return { valid: false, errors, warnings };
  }

  // APP-008: unique app_id
  const seenIds = new Set<string>();

  for (let i = 0; i < applications.length; i++) {
    const rawApp = applications[i];
    const idx = `applications[${i}]`;

    if (!rawApp || typeof rawApp !== 'object') {
      errors.push({ code: 'APP-003', message: `${idx} must be an object` });
      continue;
    }
    const a = rawApp as Record<string, unknown>;

    // APP-003: required per-application fields
    if (!a['app_id'] || typeof a['app_id'] !== 'string' || !(a['app_id'] as string).trim()) {
      errors.push({ code: 'APP-003', message: `${idx}: app_id is required` });
    } else {
      const aid = a['app_id'] as string;
      if (seenIds.has(aid)) {
        errors.push({ code: 'APP-008', message: `Duplicate app_id: "${aid}"` });
      }
      seenIds.add(aid);
    }

    if (!a['name'] || typeof a['name'] !== 'string' || !(a['name'] as string).trim()) {
      errors.push({ code: 'APP-003', message: `${idx}: name is required` });
    }
    if (!a['type']) {
      errors.push({ code: 'APP-003', message: `${idx}: type is required` });
    }
    if (!a['status']) {
      errors.push({ code: 'APP-003', message: `${idx}: status is required` });
    }

    // APP-004: type enum
    if (a['type'] && !VALID_TYPES.has(a['type'] as ApplicationType)) {
      errors.push({ code: 'APP-004', message: `${idx}: type "${a['type']}" must be one of: application, integration, platform, data_store` });
    }

    // APP-005: status enum (4 values)
    if (a['status'] && !VALID_STATUSES.has(a['status'] as ApplicationStatus)) {
      errors.push({ code: 'APP-005', message: `${idx}: status "${a['status']}" must be one of: Draft, Active, Deprecated, Decommissioning` });
    }

    // APP-006: maturity range
    if (a['maturity'] !== undefined) {
      const m = a['maturity'];
      if (typeof m !== 'number' || !Number.isInteger(m) || m < 1 || m > 5) {
        errors.push({ code: 'APP-006', message: `${idx}: maturity must be an integer 1–5, got "${m}"` });
      }
    }

    // APP-009: integrations[].direction enum
    if (Array.isArray(a['integrations'])) {
      const integrations = a['integrations'] as unknown[];
      for (let j = 0; j < integrations.length; j++) {
        const rawIntg = integrations[j];
        if (!rawIntg || typeof rawIntg !== 'object') {
          errors.push({ code: 'APP-009', message: `${idx}.integrations[${j}] must be an object` });
          continue;
        }
        const intg = rawIntg as Record<string, unknown>;
        if (intg['direction'] !== undefined && !VALID_DIRECTIONS.has(intg['direction'] as IntegrationDirection)) {
          errors.push({ code: 'APP-009', message: `${idx}.integrations[${j}]: direction "${intg['direction']}" must be one of: inbound, outbound, bidirectional` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
