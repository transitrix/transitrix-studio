import type {
  ActivityDoc,
  Activity,
  ActivityValidationResult,
  ActivityValidationError,
  ActivityValidationWarning,
} from './types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_WEEKDAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export function validateActivities(input: unknown): ActivityValidationResult {
  const errors: ActivityValidationError[] = [];
  const warnings: ActivityValidationWarning[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'ACT-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  // ACT-001: notation must be "action" (canonical) or "activities" (deprecated)
  if (raw.notation === undefined) {
    errors.push({ code: 'ACT-001', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'action' && raw.notation !== 'activities') {
    errors.push({ code: 'ACT-001', message: `notation must be "action", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }
  if (raw.notation === 'activities') {
    warnings.push({ code: 'DEPRECATED_NOTATION', message: 'notation: "activities" is deprecated — migrate to notation: "action"' });
  }

  // Accept "actions:" (canonical) or "activities:" (deprecated)
  const rawArray = Array.isArray(raw.actions) ? raw.actions : (Array.isArray(raw.activities) ? raw.activities : undefined);
  if (Array.isArray(raw.activities) && !Array.isArray(raw.actions)) {
    warnings.push({ code: 'DEPRECATED_FIELD', message: 'Root key "activities:" is deprecated — rename to "actions:"' });
  }
  if (!rawArray) {
    const canonKey = raw.notation === 'action' ? 'actions' : 'activities';
    errors.push({ code: 'SCHEMA_INVALID', message: `${canonKey} must be an array`, path: canonKey });
    return { valid: false, errors, warnings };
  }
  // Normalise onto raw.activities for the rest of this function (avoids touching downstream code)
  if (!Array.isArray(raw.activities)) raw.activities = raw.actions;

  // ACT-014 / ACT-015: project.calendar validation (run before per-activity loop;
  // surfaces clearly even when activities also have issues).
  if (raw.project && typeof raw.project === 'object') {
    const project = raw.project as Record<string, unknown>;
    const cal = project.calendar;
    if (cal && typeof cal === 'object') {
      const calendar = cal as Record<string, unknown>;
      if (calendar.working_days !== undefined) {
        if (!Array.isArray(calendar.working_days)) {
          errors.push({ code: 'ACT-014', message: 'project.calendar.working_days must be an array of weekday names', path: 'project.calendar.working_days' });
        } else {
          const seen = new Set<string>();
          for (let i = 0; i < calendar.working_days.length; i++) {
            const raw = calendar.working_days[i];
            const day = typeof raw === 'string' ? raw.toLowerCase() : '';
            if (!VALID_WEEKDAYS.has(day)) {
              errors.push({
                code: 'ACT-014',
                message: `project.calendar.working_days[${i}] "${String(raw)}" must be one of: mon, tue, wed, thu, fri, sat, sun`,
                path: `project.calendar.working_days[${i}]`,
              });
            } else if (seen.has(day)) {
              errors.push({
                code: 'ACT-014',
                message: `project.calendar.working_days has duplicate entry "${day}"`,
                path: `project.calendar.working_days[${i}]`,
              });
            } else {
              seen.add(day);
            }
          }
        }
      }
      if (calendar.holidays !== undefined) {
        if (!Array.isArray(calendar.holidays)) {
          errors.push({ code: 'ACT-015', message: 'project.calendar.holidays must be an array of ISO 8601 dates', path: 'project.calendar.holidays' });
        } else {
          for (let i = 0; i < calendar.holidays.length; i++) {
            const h = calendar.holidays[i];
            if (typeof h !== 'string' || !DATE_RE.test(h)) {
              errors.push({
                code: 'ACT-015',
                message: `project.calendar.holidays[${i}] "${String(h)}" must be an ISO 8601 date (YYYY-MM-DD)`,
                path: `project.calendar.holidays[${i}]`,
              });
            }
          }
        }
      }
    }
  }

  const doc = raw as unknown as ActivityDoc;
  const idSet = new Set<string>();

  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i] as unknown;
    const path = `activities[${i}]`;

    if (!a || typeof a !== 'object') {
      errors.push({ code: 'SCHEMA_INVALID', message: 'activity entry must be an object', path });
      continue;
    }
    const act = a as Record<string, unknown>;

    // Normalise action_type → activity_type (canonical rename; old name kept for compat)
    if (act['action_type'] !== undefined && act['activity_type'] === undefined) {
      act['activity_type'] = act['action_type'];
    }

    // ACT-010: reject single-value forms
    if ('goal' in act) {
      errors.push({ code: 'ACT-010', message: `Use "goals: []" array form instead of "goal:" (activity at index ${i})`, path });
    }
    if ('predecessor' in act) {
      errors.push({ code: 'ACT-010', message: `Use "predecessors: []" array form instead of "predecessor:" (activity at index ${i})`, path });
    }
    if ('tag' in act) {
      errors.push({ code: 'ACT-010', message: `Use "tags: []" array form instead of "tag:" (activity at index ${i})`, path });
    }

    // ACT-002: non-empty id
    if (!act.id || typeof act.id !== 'string' || (act.id as string).trim() === '') {
      errors.push({ code: 'ACT-002', message: `Activity at index ${i} is missing a non-empty id`, path });
      continue;
    }
    const id = act.id as string;

    // ACT-003: non-empty name
    if (!act.name || typeof act.name !== 'string' || (act.name as string).trim() === '') {
      errors.push({ code: 'ACT-003', message: `Activity "${id}" is missing a non-empty name`, path });
    }

    // ACT-004: unique ids
    if (idSet.has(id)) {
      errors.push({ code: 'ACT-004', message: `Duplicate activity id: "${id}"`, path });
    } else {
      idSet.add(id);
    }

    // ACT-009: non-negative numeric fields
    const numericFields = ['duration', 'duration_days', 'labor_cost', 'resources_cost', 'effort', 'score', 'sort'] as const;
    for (const field of numericFields) {
      const val = act[field];
      if (val !== undefined && val !== null) {
        if (typeof val !== 'number' || val < 0) {
          errors.push({ code: 'ACT-009', message: `Activity "${id}" field "${field}" must be a non-negative number, got ${String(val)}`, path });
        }
      }
    }

    // ACT-011: warn if no duration (duration_days is accepted as an alias)
    if ((act.duration === undefined || act.duration === null) && (act.duration_days === undefined || act.duration_days === null)) {
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

  // ACT-016: milestone (duration=0) with both pinned dates MUST have start == end.
  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    if (a.duration === 0 && a.start_date && a.end_date && a.start_date !== a.end_date) {
      errors.push({
        code: 'ACT-016',
        message: `Milestone "${a.id}" has duration 0 but start_date "${a.start_date}" ≠ end_date "${a.end_date}"`,
        path: `activities[${i}]`,
      });
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  // ACT-017 / ACT-018: phase warnings. A "phase" is an activity that is referenced
  // by another activity's `parent` field. ACT-017 warns when a phase carries its
  // own duration/dates (those roll up from children). ACT-018 warns when an
  // activity that looks like a phase (no duration, no pinned dates) has no
  // children — possibly an unused placeholder.
  const childCount = new Map<string, number>();
  for (const a of doc.activities) {
    if (typeof a.parent === 'string' && a.parent.length > 0) {
      childCount.set(a.parent, (childCount.get(a.parent) ?? 0) + 1);
    }
  }
  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i];
    const isReferencedAsParent = (childCount.get(a.id) ?? 0) > 0;
    if (isReferencedAsParent) {
      const carriesOwnTiming =
        (a.duration !== undefined && a.duration !== null) ||
        typeof a.start_date === 'string' ||
        typeof a.end_date === 'string';
      if (carriesOwnTiming) {
        warnings.push({
          code: 'ACT-017',
          message: `Phase "${a.id}" carries its own duration/dates — those should roll up from children, not be authored directly`,
          path: `activities[${i}]`,
        });
      }
    } else {
      // Not referenced as parent. ACT-018 only fires when the activity LOOKS
      // like a phase: no duration declared and no pinned dates. A leaf without
      // duration is already covered by ACT-011 — the same activity may surface
      // both warnings, which is correct (separate concerns: CPM-unfit vs
      // empty-phase).
      const looksLikePhase =
        (a.duration === undefined || a.duration === null) &&
        !a.start_date &&
        !a.end_date;
      if (looksLikePhase) {
        warnings.push({
          code: 'ACT-018',
          message: `Activity "${a.id}" has no duration and no children — may be an empty phase`,
          path: `activities[${i}]`,
        });
      }
    }
  }

  // ACT-019: Gantt view will not render when neither project.start_date nor
  // any per-activity pinned date pair is present. Network view is unaffected.
  const hasProjectStart = typeof doc.project?.start_date === 'string' && doc.project.start_date.length > 0;
  const hasPinnedActivity = doc.activities.some(
    (a) => typeof a.start_date === 'string' && typeof a.end_date === 'string',
  );
  if (!hasProjectStart && !hasPinnedActivity) {
    warnings.push({
      code: 'ACT-019',
      message: 'Gantt view will not render: project.start_date is absent and no activity has both start_date and end_date pinned. Network view is unaffected.',
    });
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
