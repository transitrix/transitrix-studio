// Strict raw history validation. Never filter malformed entries before checking them.
import type { ValidationResult } from '../validation-types.js';
import { mapping, isoDate, type StandaloneOptions } from './validate.js';
import { validateAttributeArray } from '../versioned-attribute/validate.js';
import { isCanonicalIdOfType } from '../typed-id.js';

export function validateHistory(input: unknown, options: StandaloneOptions = {}): ValidationResult {
  const errors: ValidationResult['errors'] = [], warnings: ValidationResult['warnings'] = [];
  const fail = (field: string, expected: string, actual: unknown, code = 'SCHEMA_INVALID') => errors.push({code, message: `history sidecar: ${field}: expected ${expected}; actual ${JSON.stringify(actual) ?? 'missing'}.`, path:field});
  if (!mapping(input)) { fail('$', 'mapping', input); return {valid:false, errors, warnings}; }
  const d = input;
  if (typeof d.target !== 'string' || !d.target.trim()) fail('target', 'canonical target ID', d.target, 'VERSIONED-001');
  const target = typeof d.target === 'string' ? options.documents?.get(d.target) : undefined;
  if (options.documents && (!target || !options.catalog?.typeOf(d.target as string))) fail('target', 'admitted primitive', d.target, 'VERSIONED-001');
  const notation = target?.notation;
  const attributes: Record<string, string[]> = {capability: ['current_maturity','target_maturity','target_date','owner_role'], application: ['maturity','vendor','owner_role']};
  const allowed = typeof notation === 'string' ? attributes[notation] : undefined;
  if (!allowed) warnings.push({code:'NOTATION-SKIP-001', message: 'History target schema is unavailable; attribute coverage remains unvalidated.'});
  if (!mapping(d.attribute_versions)) fail('attribute_versions', 'mapping', d.attribute_versions);
  else for (const [attribute, entries] of Object.entries(d.attribute_versions)) {
    const field = `attribute_versions.${attribute}`;
    if (allowed && !allowed.includes(attribute)) fail(field, 'declared time_varying attribute', attribute);
    if (!Array.isArray(entries)) { fail(field, 'array', entries); continue; }
    const checked: {valid_from: string; value: string | number | boolean | null}[] = [];
    for (const [i, entry] of entries.entries()) {
      const key = `${field}[${i}]`;
      if (!mapping(entry)) { fail(key, 'mapping', entry); continue; }
      if (!isoDate(entry.valid_from)) fail(`${key}.valid_from`, 'ISO calendar date', entry.valid_from);
      const value = entry.value;
      const scalar = value === null || ['string','number','boolean'].includes(typeof value);
      if (!('value' in entry) || !scalar) fail(`${key}.value`, 'scalar or null', value);
      if (scalar && isoDate(entry.valid_from)) checked.push({valid_from: entry.valid_from, value: value as string | number | boolean | null});
      if (value === null || !allowed?.includes(attribute)) continue;
      if (['current_maturity','target_maturity','maturity'].includes(attribute) && !(Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5)) fail(`${key}.value`, 'integer 1..5 or null', value);
      if (attribute === 'target_date' && !isoDate(value)) fail(`${key}.value`, 'ISO calendar date or null', value);
      if (attribute === 'vendor' && typeof value !== 'string') fail(`${key}.value`, 'string or null', value);
      if (attribute === 'owner_role' && (!isCanonicalIdOfType(value, 'ROLE') || (options.catalog && options.catalog.typeOf(value as string) !== 'ROLE'))) fail(`${key}.value`, 'admitted ROLE reference or null', value);
    }
    for (const finding of validateAttributeArray(attribute, checked, typeof target?.valid_from === 'string' ? target.valid_from : undefined, target?.valid_to === null || typeof target?.valid_to === 'string' ? target.valid_to : undefined)) {
      (finding.severity === 'error' ? errors : warnings).push({code:finding.code, message:finding.message});
    }
  }
  for (const key of ['notation','id','zone','admitted_at','admitted_by','valid_from','valid_to']) if (key in d) fail(key, 'absent on headerless history sidecar', d[key]);
  return {valid:errors.length === 0, errors, warnings};
}
