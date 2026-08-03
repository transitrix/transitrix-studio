// Versioned-attribute sidecar validation — CONTRACT.md §9.3, `VERSIONED-00x`.
//
// Split by what each check needs to know:
//   - `parseSidecar` + `validateAttributeArray` here cover VERSIONED-002/003/005,
//     which only need the sidecar document itself (plus, for 005, the target
//     primitive's own lifecycle window).
//   - `VERSIONED-001` (target resolves to an admitted primitive) and
//     `VERSIONED-004` (a time_varying field present inline on the primitive)
//     both need cross-document knowledge — which ids exist, which notation a
//     primitive is — that a single sidecar document doesn't carry. Those are
//     repo-scope concerns; see `repo-validate/check-versioned-attributes.ts`.

import type { AttributeVersionEntry, VersionedAttributeSidecar } from './types.js';

export interface AttributeArrayFinding {
  code: 'VERSIONED-002' | 'VERSIONED-003' | 'VERSIONED-005';
  severity: 'error' | 'warning';
  message: string;
}

function isAttributeVersionEntry(v: unknown): v is AttributeVersionEntry {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && typeof (v as Record<string, unknown>)['valid_from'] === 'string';
}

/** Parse a raw parsed-YAML mapping into a typed sidecar, or `null` if it
 *  isn't shaped like one (missing `target` string or `attribute_versions`
 *  map) — not every doc under `canon/elements/**` is a sidecar. */
export function parseSidecar(data: Record<string, unknown> | null | undefined): VersionedAttributeSidecar | null {
  if (!data) return null;
  const target = data['target'];
  const attributeVersions = data['attribute_versions'];
  if (typeof target !== 'string' || target.trim() === '') return null;
  if (typeof attributeVersions !== 'object' || attributeVersions === null || Array.isArray(attributeVersions)) return null;

  const out: Record<string, AttributeVersionEntry[]> = {};
  for (const [name, value] of Object.entries(attributeVersions as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    out[name] = value.filter(isAttributeVersionEntry);
  }
  return { target, attribute_versions: out };
}

/** VERSIONED-002/003/005 for one attribute's version array.
 *  `targetValidFrom`/`targetValidTo` bound VERSIONED-005 — pass `undefined`
 *  for either to skip that half of the check (e.g. the target element could
 *  not be found, which is already reported separately as VERSIONED-001). */
export function validateAttributeArray(
  attributeName: string,
  entries: AttributeVersionEntry[],
  targetValidFrom?: string,
  targetValidTo?: string | null,
): AttributeArrayFinding[] {
  const findings: AttributeArrayFinding[] = [];
  const seen = new Set<string>();
  let sorted = true;
  let prev: string | undefined;

  for (const entry of entries) {
    if (seen.has(entry.valid_from)) {
      findings.push({
        code: 'VERSIONED-002',
        severity: 'error',
        message: `attribute '${attributeName}': duplicate valid_from '${entry.valid_from}'.`,
      });
    }
    seen.add(entry.valid_from);

    if (prev !== undefined && entry.valid_from < prev) sorted = false;
    prev = entry.valid_from;

    if (targetValidFrom !== undefined && entry.valid_from < targetValidFrom) {
      findings.push({
        code: 'VERSIONED-005',
        severity: 'error',
        message: `attribute '${attributeName}': entry valid_from '${entry.valid_from}' is before the target's valid_from '${targetValidFrom}'.`,
      });
    }
    if (targetValidTo !== undefined && targetValidTo !== null && entry.valid_from > targetValidTo) {
      findings.push({
        code: 'VERSIONED-005',
        severity: 'error',
        message: `attribute '${attributeName}': entry valid_from '${entry.valid_from}' is after the target's valid_to '${targetValidTo}'.`,
      });
    }
  }

  if (!sorted) {
    findings.push({
      code: 'VERSIONED-003',
      severity: 'warning',
      message: `attribute '${attributeName}': entries are not sorted by valid_from ascending.`,
    });
  }

  return findings;
}

/** Run VERSIONED-002/003/005 over every attribute in a parsed sidecar. */
export function validateSidecar(
  sidecar: VersionedAttributeSidecar,
  targetValidFrom?: string,
  targetValidTo?: string | null,
): AttributeArrayFinding[] {
  const findings: AttributeArrayFinding[] = [];
  for (const [name, entries] of Object.entries(sidecar.attribute_versions)) {
    findings.push(...validateAttributeArray(name, entries, targetValidFrom, targetValidTo));
  }
  return findings;
}
