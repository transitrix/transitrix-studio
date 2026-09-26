import type { ResolvedCapabilityAttributes } from './resolve-maturity.js';
import { schemaFinding } from '../schema-finding.js';
import type { CapabilityType } from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

export type { ValidationError, ValidationWarning, ValidationResult };

const VALID_TYPES = new Set<CapabilityType>(['domain', 'supporting']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Canonical form per `IDS_AND_REFERENCES.md` §2: `CAPABILITY-V…` /
// `CAPABILITY-H…` with the dotted address (`V1`, `V1.2.1`, `H1`). The bare
// legacy form (`V1`, `H1`) is still accepted so existing maps without the
// canonical prefix do not break; migration is tracked separately.
const CAP_ID_RE = /^(CAPABILITY-)?(V|H)\d+(\.\d+)*$/;

export function validateCapabilityMap(input: unknown, options: { resolvedAttributes?: ReadonlyMap<string, ResolvedCapabilityAttributes> } = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: [schemaFinding('capability-map inline', '$', 'mapping', input)], warnings };
  }
  const raw = input as Record<string, unknown>;

  // Shared header rules have precedence over generic schema findings.
  if (!('notation' in raw)) {
    errors.push({ code: 'HDR-001', message: 'notation field is missing' });
  } else if (raw['notation'] !== 'capability-map') {
    errors.push({ code: 'HDR-002', message: `notation must be "capability-map", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const map = raw['capability_map'];
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
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
    errors.push(schemaFinding('capability-map inline', 'capability_map.assessment_date', 'YYYY-MM-DD string', m['assessment_date']));

  const caps = m['capabilities'];
  if (!Array.isArray(caps)) {
    errors.push({ code: 'CMAP-002', message: 'capability_map.capabilities must be an array' });
    return { valid: false, errors, warnings };
  }

  const seenIds = new Set<string>();
  validateCapabilityTree(caps, 'capabilities', errors, seenIds, warnings, options.resolvedAttributes);

  return { valid: errors.length === 0, errors, warnings };
}

function validateCapabilityTree(
  nodes: unknown[],
  pathPrefix: string,
  errors: ValidationError[],
  seenIds: Set<string>,
  warnings: ValidationWarning[],
  resolved?: ReadonlyMap<string, ResolvedCapabilityAttributes>,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const rawNode = nodes[i];
    const nodePath = `${pathPrefix}[${i}]`;

    if (!rawNode || typeof rawNode !== 'object' || Array.isArray(rawNode)) {
      errors.push(schemaFinding('capability-map inline', `${nodePath}`, 'mapping', rawNode));
      continue;
    }
    const node = rawNode as Record<string, unknown>;

    if (!node['id'] || typeof node['id'] !== 'string' || !(node['id'] as string).trim()) {
      errors.push(schemaFinding('capability-map inline', `${nodePath}.id`, 'nonempty string', node['id']));
    } else {
      const id = node['id'] as string;
      if (seenIds.has(id)) {
        errors.push(schemaFinding('capability-map inline', `${nodePath}.id`, 'unique identifier', node['id']));
      }
      seenIds.add(id);
      if (!CAP_ID_RE.test(id)) {
        errors.push(schemaFinding('capability-map inline', `${nodePath}.id`, 'CAPABILITY-V[n] / CAPABILITY-H[n] (legacy V[n] / H[n]) with optional .n segments', node['id']));
      }
    }

    if (!node['name'] || typeof node['name'] !== 'string' || !(node['name'] as string).trim())
      errors.push(schemaFinding('capability-map inline', `${nodePath}.name`, 'nonempty string', node['name']));

    for (const field of ['current_maturity', 'target_maturity', 'target_date', 'owner_role']) {
      if (node[field] !== undefined) errors.push({code: 'VERSIONED-004', path: `${nodePath}.${field}`,
        message: `${nodePath}.${field} belongs in ${String(node['id'])}.history.yaml, not inline.`});
    }
    const currentMaturity = node['current_maturity'] ?? resolved?.get(String(node['id']))?.current_maturity;
    if (currentMaturity === undefined && resolved === undefined) {
      warnings.push({code: 'NOTATION-SKIP-001', path: `${nodePath}.current_maturity`,
        message: `${nodePath}.current_maturity cannot be checked without the capability sidecar catalogue; this file remains unvalidated.`});
    } else {
      const cm = currentMaturity;
      if (typeof cm !== 'number' || !Number.isInteger(cm) || cm < 1 || cm > 5)
        errors.push(schemaFinding('capability-map inline', `${nodePath}.current_maturity`, 'integer in 1–5 from the sidecar at the assessment date', currentMaturity));
    }

    if (node['target_maturity'] !== undefined) {
      const tm = node['target_maturity'];
      if (typeof tm !== 'number' || !Number.isInteger(tm) || tm < 1 || tm > 5)
        errors.push(schemaFinding('capability-map inline', `${nodePath}.target_maturity`, 'integer in 1–5', node['target_maturity']));
    }

    if (node['type'] !== undefined && !VALID_TYPES.has(node['type'] as CapabilityType))
      errors.push(schemaFinding('capability-map inline', `${nodePath}.type`, `one of ${[...VALID_TYPES].join(", ")}`, node['type']));

    if (node['target_date'] !== undefined) {
      if (typeof node['target_date'] !== 'string' || !DATE_RE.test(node['target_date'] as string))
        errors.push(schemaFinding('capability-map inline', `${nodePath}.target_date`, 'YYYY-MM-DD string', node['target_date']));
    }

    if (node['applications'] !== undefined && !Array.isArray(node['applications']))
      errors.push(schemaFinding('capability-map inline', `${nodePath}.applications`, 'array', node['applications']));

    // LIFECYCLE-001/004 — DSM's own rule codes (capabilities.go
    // ValidateCapMap/validateCapMapNodes) for `valid_from`/`valid_to`, the
    // CONTRACT.md §7 primitive-lifecycle fields. Net new: this notation's own
    // validator has no equivalent check today — `CapabilityNode` (types.ts)
    // does not even declare these fields, since Studio's own schema tracks
    // lifecycle via `target_date` instead. The fields are still read directly
    // off the raw untyped node here because real capability-map documents
    // (e.g. organizations/acme_corp) author them inline per §7 regardless.
    {
      const id = typeof node['id'] === 'string' ? (node['id'] as string) : nodePath;
      const validFrom = node['valid_from'];
      const validTo = node['valid_to'];
      let fromDate: string | undefined;
      let toDate: string | undefined;
      if (validFrom !== undefined && validFrom !== null) {
        if (typeof validFrom !== 'string' || !DATE_RE.test(validFrom)) {
          errors.push({ code: 'LIFECYCLE-001', message: `capability ${id} valid_from "${String(validFrom)}" is not a valid YYYY-MM-DD date (must be quoted)` });
        } else {
          fromDate = validFrom;
        }
      }
      if (validTo !== undefined && validTo !== null) {
        if (typeof validTo !== 'string' || !DATE_RE.test(validTo)) {
          errors.push({ code: 'LIFECYCLE-001', message: `capability ${id} valid_to "${String(validTo)}" is not a valid YYYY-MM-DD date (must be quoted)` });
        } else {
          toDate = validTo;
        }
      }
      if (fromDate && toDate && toDate < fromDate) {
        errors.push({ code: 'LIFECYCLE-004', message: `capability ${id} valid_to ${toDate} is before valid_from ${fromDate}` });
      }
    }

    if (node['children'] !== undefined) {
      if (!Array.isArray(node['children'])) {
        errors.push(schemaFinding('capability-map inline', `${nodePath}.children`, 'array', node['children']));
      } else {
        validateCapabilityTree(node['children'] as unknown[], `${nodePath}.children`, errors, seenIds, warnings, resolved);
      }
    }
  }
}
