import type {
  ActivityDoc,
  Activity,
  ActivityValidationResult,
  ActivityValidationError,
  ActivityValidationWarning,
} from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateActivities(input: unknown): ActivityValidationResult {
  const errors: ActivityValidationError[] = [];
  const warnings: ActivityValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'ACT-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  // ACT-001: notation must equal "activities"
  if (raw.notation === undefined) {
    errors.push({ code: 'ACT-001', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'activities') {
    errors.push({ code: 'ACT-001', message: `notation must be "activities", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(raw.activities)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'activities must be an array', path: 'activities' });
    return { valid: false, errors, warnings };
  }

  const doc = raw as unknown as ActivityDoc;
  const idSet = new Set<string>();

  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i] as unknown as Record<string, unknown>;
    const path = `activities[${i}]`;

    // ACT-010: reject single-value forms
    if ('goal' in a) {
      errors.push({ code: 'ACT-010', message: `Use "goals: []" array form instead of "goal:" (activity at index ${i})`, path });
    }
    if ('predecessor' in a) {
      errors.push({ code: 'ACT-010', message: `Use "predecessors: []" array form instead of "predecessor:" (activity at index ${i})`, path });
    }
    if ('tag' in a) {
      errors.push({ code: 'ACT-010', message: `Use "tags: []" array form instead of "tag:" (activity at index ${i})`, path });
    }

    // ACT-002: non-empty id
    if (!a.id || typeof a.id !== 'string' || (a.id as string).trim() === '') {
      errors.push({ code: 'ACT-002', message: `Activity at index ${i} is missing a non-empty id`, path });
      continue;
    }
    const id = a.id as string;

    // ACT-003: non-empty name
    if (!a.name || typeof a.name !== 'string' || (a.name as string).trim() === '') {
      errors.push({ code: 'ACT-003', message: `Activity "${id}" is missing a non-empty name`, path });
    }

    // ACT-004: unique ids
    if (idSet.has(id)) {
      errors.push({ code: 'ACT-004', message: `Duplicate activity id: "${id}"`, path });
    } else {
      idSet.add(id);
    }

    // ACT-009: non-negative numeric fields
    const numericFields = ['duration', 'labor_cost', 'resources_cost', 'effort', 'score', 'sort'] as const;
    for (const field of numericFields) {
      const val = a[field];
      if (val !== undefined && val !== null) {
        if (typeof val !== 'number' || val < 0) {
          errors.push({ code: 'ACT-009', message: `Activity "${id}" field "${field}" must be a non-negative number, got ${String(val)}`, path });
        }
      }
    }

    // ACT-011: warn if no duration
    if (a.duration === undefined || a.duration === null) {
      warnings.push({ code: 'ACT-011', message: `Activity "${id}" has no duration — cannot participate in CPM analysis`, path });
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // Second pass — checks that need the full id set
  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    const path = `activities[${i}]`;

    // ACT-007: self-loop
    if (Array.isArray(a.predecessors) && a.predecessors.includes(a.id)) {
      errors.push({ code: 'ACT-007', message: `Activity "${a.id}" lists itself as a predecessor`, path });
    }

    // ACT-005: predecessor existence (intra-document)
    for (const predId of (a.predecessors ?? [])) {
      if (!idSet.has(predId)) {
        errors.push({ code: 'ACT-005', message: `Activity "${a.id}" references unknown predecessor "${predId}"`, path });
      }
    }

    // ACT-008: date format validation + end_date >= start_date.
    // The orchestrator's pre-release review flagged that the raw lexicographic
    // string compare is only correct for strict YYYY-MM-DD, with no format
    // check applied. Now we validate the format first; the order compare runs
    // only when both dates are valid (otherwise the comparison message would
    // be misleading).
    let startValid = true;
    let endValid = true;
    if (a.start_date !== undefined) {
      if (typeof a.start_date !== 'string' || !DATE_RE.test(a.start_date)) {
        errors.push({ code: 'ACT-008', message: `Activity "${a.id}" start_date "${String(a.start_date)}" must be ISO 8601 YYYY-MM-DD`, path });
        startValid = false;
      }
    }
    if (a.end_date !== undefined) {
      if (typeof a.end_date !== 'string' || !DATE_RE.test(a.end_date)) {
        errors.push({ code: 'ACT-008', message: `Activity "${a.id}" end_date "${String(a.end_date)}" must be ISO 8601 YYYY-MM-DD`, path });
        endValid = false;
      }
    }
    if (a.start_date && a.end_date && startValid && endValid) {
      if (a.end_date < a.start_date) {
        errors.push({ code: 'ACT-008', message: `Activity "${a.id}" end_date "${a.end_date}" is before start_date "${a.start_date}"`, path });
      }
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // ACT-006: no cycles
  const cycleError = detectCycle(doc.activities);
  if (cycleError) errors.push(cycleError);

  if (errors.length > 0) return { valid: false, errors, warnings };

  // ACT-012: date/duration consistency (warning only)
  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    if (a.start_date && a.end_date && a.duration !== undefined) {
      const start = new Date(a.start_date).getTime();
      const end = new Date(a.end_date).getTime();
      const diffDays = Math.round((end - start) / 86400000);
      if (Math.abs(diffDays - a.duration) > 1) {
        warnings.push({
          code: 'ACT-012',
          message: `Activity "${a.id}" duration ${a.duration} is inconsistent with date range of ~${diffDays} days`,
          path: `activities[${i}]`,
        });
      }
    }
  }

  // ACT-013: orphan activities (warning only)
  const successorIds = new Set<string>();
  for (const a of doc.activities) {
    for (const pred of (a.predecessors ?? [])) successorIds.add(pred);
  }
  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    const hasSuccessors = successorIds.has(a.id);
    const hasGoals = Array.isArray(a.goals) && a.goals.length > 0;
    const hasPredecessors = Array.isArray(a.predecessors) && a.predecessors.length > 0;
    if (doc.activities.length > 1 && !hasSuccessors && !hasGoals && !hasPredecessors) {
      warnings.push({
        code: 'ACT-013',
        message: `Activity "${a.id}" appears to be structurally orphan (no predecessors, successors, or goals)`,
        path: `activities[${i}]`,
      });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function detectCycle(activities: Activity[]): ActivityValidationError | null {
  const successors = new Map<string, string[]>();
  for (const a of activities) {
    successors.set(a.id, []);
  }
  for (const a of activities) {
    for (const pred of (a.predecessors ?? [])) {
      const list = successors.get(pred);
      if (list) list.push(a.id);
    }
  }

  // Kahn's algorithm: if we can't process all nodes, there's a cycle
  const inDegree = new Map<string, number>();
  for (const a of activities) inDegree.set(a.id, 0);
  for (const a of activities) {
    for (const pred of (a.predecessors ?? [])) {
      inDegree.set(a.id, (inDegree.get(a.id) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    processed++;
    for (const succ of (successors.get(id) ?? [])) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  if (processed < activities.length) {
    const cycleNodes = activities.filter(a => (inDegree.get(a.id) ?? 0) > 0).map(a => a.id);
    return { code: 'ACT-006', message: `Cycle detected in activity dependency graph involving: ${cycleNodes.join(', ')}` };
  }
  return null;
}
