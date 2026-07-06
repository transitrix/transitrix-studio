// CODEX validator — methodology notations/elements/14-codex.md §4.
//
// CODEX-001 — shape, zone, id grammar, admission envelope.
// CODEX-002 — `type` field matches the id TYPE prefix when present.
// CODEX-003 — external artefact frontmatter (jurisdiction, effective_date).
// CODEX-004 — internal artefact frontmatter (issuing_authority, effective_date).
// CODEX-005 — jurisdiction must match the parent folder under codex/external/
//             (when `folderJurisdiction` is supplied by the repo sweep).

import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';
import { isCanonicalId, typeOfId } from '../typed-id.js';
import {
  CODEX_ARTEFACT_TYPES,
  EXTERNAL_CODEX_TYPES,
  INTERNAL_CODEX_TYPES,
  type CodexArtefactType,
} from './types.js';

export interface CodexValidateOptions {
  /** Lowercased jurisdiction folder segment from `codex/external/<jurisdiction>/`. */
  folderJurisdiction?: string;
}

function isCodexType(type: string | null): type is CodexArtefactType {
  return type !== null && (CODEX_ARTEFACT_TYPES as readonly string[]).includes(type);
}

function normalizeType(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  return value.trim().toUpperCase();
}

export function validateCodex(input: unknown, options: CodexValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ code: 'CODEX-001', message: 'Codex artefact must be a YAML mapping.' });
    return { valid: false, errors, warnings };
  }
  const c = input as Record<string, unknown>;

  if (c.zone !== 'codex') {
    errors.push({ code: 'CODEX-001', message: 'zone must be the fixed value "codex".', path: 'zone' });
  }

  const idType = typeOfId(c.id);
  if (!isCanonicalId(c.id) || !isCodexType(idType)) {
    errors.push({
      code: 'CODEX-001',
      message: `id "${String(c.id)}" must be a typed codex id (LAW, REGULATION, POLICY, or INTERNAL_STANDARD).`,
      path: 'id',
    });
  }

  if (typeof c.name !== 'string' || c.name.trim() === '') {
    errors.push({ code: 'CODEX-001', message: 'name is required.', path: 'name' });
  }
  for (const field of ['admitted_at', 'admitted_by'] as const) {
    const v = c[field];
    if (typeof v !== 'string' || v.trim() === '') {
      errors.push({ code: 'CODEX-001', message: `${field} is required.`, path: field });
    }
  }
  if (c.gate_checks === null || typeof c.gate_checks !== 'object' || Array.isArray(c.gate_checks)) {
    errors.push({ code: 'CODEX-001', message: 'gate_checks is required and must be a mapping.', path: 'gate_checks' });
  }

  const declaredType = normalizeType(c.type);
  if (declaredType !== undefined && idType && declaredType !== idType) {
    errors.push({
      code: 'CODEX-002',
      message: `type "${String(c.type)}" does not match the id TYPE prefix "${idType}".`,
      path: 'type',
    });
  }

  const artefactType = (declaredType ?? idType) as CodexArtefactType | null;

  if (artefactType && (EXTERNAL_CODEX_TYPES as readonly string[]).includes(artefactType)) {
    const jurisdiction = typeof c.jurisdiction === 'string' ? c.jurisdiction.trim() : '';
    if (!jurisdiction) {
      errors.push({ code: 'CODEX-003', message: 'jurisdiction is required for external codex artefacts.', path: 'jurisdiction' });
    } else if (options.folderJurisdiction && jurisdiction.toLowerCase() !== options.folderJurisdiction.toLowerCase()) {
      errors.push({
        code: 'CODEX-005',
        message: `jurisdiction "${jurisdiction}" must match the parent folder "${options.folderJurisdiction}" (CODEX-001).`,
        path: 'jurisdiction',
      });
    }
    if (typeof c.effective_date !== 'string' || c.effective_date.trim() === '') {
      errors.push({ code: 'CODEX-003', message: 'effective_date is required for external codex artefacts.', path: 'effective_date' });
    }
  }

  if (artefactType && (INTERNAL_CODEX_TYPES as readonly string[]).includes(artefactType)) {
    if (typeof c.issuing_authority !== 'string' || c.issuing_authority.trim() === '') {
      errors.push({
        code: 'CODEX-004',
        message: 'issuing_authority is required for internal codex artefacts.',
        path: 'issuing_authority',
      });
    }
    if (typeof c.effective_date !== 'string' || c.effective_date.trim() === '') {
      errors.push({ code: 'CODEX-004', message: 'effective_date is required for internal codex artefacts.', path: 'effective_date' });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** True when a parsed document is a codex-zone artefact candidate. */
export function isCodexDoc(data: unknown): boolean {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return false;
  return (data as Record<string, unknown>).zone === 'codex';
}

/** Infer codex folder jurisdiction from a repo-relative path such as
 *  `codex/external/eu/LAW-GDPR-1.yaml` → `eu`. */
export function folderJurisdictionFromPath(filePath: string): string | undefined {
  const parts = filePath.replace(/\\/g, '/').toLowerCase().split('/');
  const extIdx = parts.indexOf('external');
  if (extIdx < 0 || extIdx + 1 >= parts.length) return undefined;
  return parts[extIdx + 1] || undefined;
}
