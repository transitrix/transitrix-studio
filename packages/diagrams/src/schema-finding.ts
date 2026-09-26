import type { ValidationError } from './validation-types.js';

/** Shared schema identity; callers supply the owning form and exact field. */
export function schemaFinding(form: string, path: string, expected: string, actual: unknown): ValidationError {
  const type = actual === null ? 'null' : Array.isArray(actual) ? 'array' : typeof actual;
  return { code: 'SCHEMA_INVALID', path,
    message: `${form} field '${path}': expected ${expected}; actual ${type} (${String(actual)}).` };
}
