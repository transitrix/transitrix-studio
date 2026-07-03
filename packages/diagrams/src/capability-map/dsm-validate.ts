import type { CapabilityMap, ValidationResult, ValidationError, ValidationWarning } from './dsm-schema.js';

/** Parses an address string loosely enough to tell "wrong shape"
 *  (INVALID_ADDRESS_FORMAT) apart from "right shape, too many levels"
 *  (MAX_DEPTH_EXCEEDED, e.g. '1.2.3.4') — a strict 3-segment regex would
 *  reject both identically and lose that distinction. */
function parseLoose(address: string): { triple: [number, number, number] } | { tooDeep: true } | null {
  const parts = address.trim().split('.');
  if (parts.length < 3 || !parts.every((p) => /^\d+$/.test(p))) return null;
  if (parts.length > 3) return { tooDeep: true };
  return { triple: [Number(parts[0]), Number(parts[1]), Number(parts[2])] };
}

export function validateCapabilityMapData(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings: [] };
  }

  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.capabilities)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'capabilities must be an array', path: 'capabilities' });
    return { valid: false, errors, warnings };
  }

  const map = raw as unknown as CapabilityMap;
  const idSet = new Set<number>();
  const addressToId = new Map<string, number>();
  const onDiagram = new Map<number, [number, number, number]>();

  for (let i = 0; i < map.capabilities.length; i++) {
    const c = map.capabilities[i] as unknown;
    const path = `capabilities[${i}]`;

    if (!c || typeof c !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'capability entry must be an object', path });
      continue;
    }
    const cap = c as { id?: unknown; name?: unknown; address?: unknown; backlog?: unknown; maturity?: unknown };

    if (typeof cap.id !== 'number') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'capability id must be a number', path });
      continue;
    }
    if (idSet.has(cap.id)) {
      errors.push({ code: 'DUPLICATE_ID', message: `Duplicate capability id: ${cap.id}`, path });
    } else {
      idSet.add(cap.id);
    }

    if (!cap.name || typeof cap.name !== 'string' || cap.name.trim() === '') {
      errors.push({ code: 'EMPTY_NAME', message: `Capability ${cap.id} has empty name`, path });
    }

    if (typeof cap.address !== 'string') {
      errors.push({ code: 'INVALID_ADDRESS_FORMAT', message: `Capability ${cap.id} address must be a string`, path });
      continue;
    }
    const parsed = parseLoose(cap.address);
    if (parsed === null) {
      errors.push({ code: 'INVALID_ADDRESS_FORMAT', message: `Capability ${cap.id} address "${cap.address}" is not in 'X.Y.Z' form`, path });
      continue;
    }
    if ('tooDeep' in parsed) {
      errors.push({ code: 'MAX_DEPTH_EXCEEDED', message: `Capability ${cap.id} address "${cap.address}" has more than 3 levels`, path });
      continue;
    }
    const triple = parsed.triple;
    const isBacklog = cap.backlog === true || triple[0] === 0;

    if (!isBacklog) {
      if (addressToId.has(cap.address)) {
        errors.push({ code: 'DUPLICATE_ADDRESS', message: `Duplicate address "${cap.address}" (capability ${cap.id})`, path });
      } else {
        addressToId.set(cap.address, cap.id);
      }
      onDiagram.set(cap.id, triple);
    }

    if (Array.isArray(cap.maturity)) {
      for (const snap of cap.maturity as unknown[]) {
        const level = (snap as { level?: unknown } | null)?.level;
        if (typeof level === 'number' && (level < 1 || level > 5)) {
          warnings.push({ code: 'INVALID_MATURITY_LEVEL', message: `Capability ${cap.id} has maturity level ${level} outside 1..5`, path });
        }
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  for (const [id, [x, y, z]] of onDiagram) {
    if (z !== 0 && !addressToId.has(`${x}.${y}.0`)) {
      warnings.push({ code: 'MISSING_PARENT_BY_ADDRESS', message: `Capability ${id} (${x}.${y}.${z}) has no L2 parent at ${x}.${y}.0` });
    } else if (y !== 0 && z === 0 && !addressToId.has(`${x}.0.0`)) {
      warnings.push({ code: 'MISSING_PARENT_BY_ADDRESS', message: `Capability ${id} (${x}.${y}.0) has no L1 parent at ${x}.0.0` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
