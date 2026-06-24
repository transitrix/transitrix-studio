// Activity Card — cross-document resolver (the novel piece of this notation).
//
// Unlike every other Studio preview, the Activity Card is assembled from
// MULTIPLE documents. The card YAML names a project Activity; the resolver
// pulls the rest of the card's content BY REFERENCE from the canonical
// ELEMENT and RELATION store — never from other view documents (view-purity:
// a view is a projection over elements + relations, methodology
// ELEMENT_PRIMITIVES.md §1):
//
//   canon/elements/**  → one element per file. The project ACTIVITY (name,
//                        lifecycle + schedule dates, delivers_changes[],
//                        parent) and its child ACTIVITY elements (parent =
//                        project id); the FACTOR / GOAL / CHANGE elements that
//                        the motivation chain expands (goal.factors,
//                        change.goals carried inline on the elements).
//   canon/relations/** → `notation: relation` files. The project's goals come
//                        from the first-class `activity_goal` REL (from =
//                        project id), preferred over the activity element's
//                        transitional inline `goals[]` when present
//                        (07-activities.md §"Time-aware relations").
//
// The extension reads + parses the element and relation files (walking the
// org's `canon/elements` and `canon/relations` trees) and hands the parsed
// docs in. This resolver is filesystem-free and pure so it stays unit-testable.
//
// Cross-document validation lives here (the rules that need the sibling docs):
//   PC-001   project does not resolve to an admitted Activity
//   PC-002   resolved Activity has activity_type other than "Project"
//   PC-003   milestone.delivers_changes[] entry not in the project's own
//            delivers_changes[]
//   PC-004   (warning) milestone.date outside [valid_from, valid_to]
//   LIFECYCLE-001  project valid_from missing / not a parseable ISO date
//   LIFECYCLE-002  project valid_to present, not null, not a parseable date
//   LIFECYCLE-003  project valid_to earlier than valid_from
//
// LIFECYCLE-* are scoped to the RESOLVED PROJECT Activity only — the card is
// built around the project's initiation date, so a missing valid_from there is
// a hard error. Child activities and FGCA elements are not lifecycle-checked
// here (out of this notation's scope; today's Studio activities docs may
// legitimately omit lifecycle fields).

import type {
  ActivityCardDoc,
  ActivityCardSources,
  ResolvedActivityCard,
  ResolvedAssessment,
  ResolvedChange,
  ResolvedChildActivity,
  ResolvedDriver,
  ResolvedGoal,
  ResolvedMilestone,
  ResolvedProject,
  ResolvedStakeholder,
} from './types.js';
import type { ValidationError, ValidationWarning, ValidationResult } from '../validation-types.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface ActivityCardResolution extends ValidationResult {
  /** Present only when resolution succeeded (project found + valid_from OK). */
  resolved?: ResolvedActivityCard;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v : undefined;
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

/** A parseable quoted ISO 8601 date, calendar-checked (rejects 2026-13-40). */
function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  // Round-trip guard so 2026-02-30 (which Date.parse may roll forward) is rejected.
  return new Date(t).toISOString().slice(0, 10) === v;
}

/**
 * Index canon element documents of one `notation` by their `id`. Each element
 * is its own single-element file (`notation: activity|factor|goal|change|…`
 * with a top-level `id`); first definition wins.
 */
function collectByNotation(
  docs: unknown[],
  notation: string,
): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    if (str(doc['notation']) !== notation) continue;
    const id = str(doc['id']);
    if (!id) continue;
    if (!out.has(id)) out.set(id, doc); // first definition wins
  }
  return out;
}

/**
 * GOAL ids reached by an *active* `activity_goal` relation originating at
 * `fromId`. A relation with a non-null `valid_to` has ended (the activity was
 * re-aimed) and is excluded — the card shows the currently-served goals.
 */
function activeActivityGoals(relations: unknown[], fromId: string): string[] {
  const out: string[] = [];
  for (const doc of relations) {
    if (!isObject(doc)) continue;
    if (str(doc['notation']) !== 'relation') continue;
    if (str(doc['type']) !== 'activity_goal') continue;
    if (str(doc['from']) !== fromId) continue;
    const to = str(doc['to']);
    if (!to) continue;
    const validTo = doc['valid_to'];
    if (validTo !== undefined && validTo !== null) continue; // ended relation
    if (!out.includes(to)) out.push(to);
  }
  return out;
}

/**
 * STAKEHOLDER ids + roles reached by an *active* `activity_stakeholder`
 * relation originating at `fromId`. A relation with a non-null `valid_to` has
 * ended and is excluded, so the card shows the project's currently-engaged
 * stakeholders. The optional `role` field on the relation carries the
 * project-role (initiator | owner | sponsor | project_manager).
 */
function activeActivityStakeholders(
  relations: unknown[],
  fromId: string,
): Array<{ id: string; role?: string }> {
  const out: Array<{ id: string; role?: string }> = [];
  for (const doc of relations) {
    if (!isObject(doc)) continue;
    if (str(doc['notation']) !== 'relation') continue;
    if (str(doc['type']) !== 'activity_stakeholder') continue;
    if (str(doc['from']) !== fromId) continue;
    const to = str(doc['to']);
    if (!to) continue;
    const validTo = doc['valid_to'];
    if (validTo !== undefined && validTo !== null) continue; // ended relation
    if (!out.some((s) => s.id === to)) out.push({ id: to, role: str(doc['role']) });
  }
  return out;
}

export function resolveActivityCard(
  doc: ActivityCardDoc,
  sources: ActivityCardSources,
): ActivityCardResolution {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const card = doc?.activity_card;
  const projectId = str(card?.project);
  if (!projectId) {
    // Structural validator already flags this; nothing to resolve.
    errors.push({ code: 'PC-001', message: 'activity_card.project is missing' });
    return { valid: false, errors, warnings };
  }

  const activities = collectByNotation(sources.elements, 'activity');
  const projectRec = activities.get(projectId);

  // PC-001 — project must resolve to an admitted ACTIVITY element after
  // exhausting the canonical resolution scope (§6.1): canon/elements/**
  // recursively first, then canon/views/activities/** as secondary fallback.
  if (!projectRec) {
    errors.push({
      code: 'PC-001',
      message:
        `activity_card.project "${projectId}" not found after searching ` +
        `canon/elements/** and canon/views/activities/** — ` +
        `add a YAML file with notation: activity and id: "${projectId}" ` +
        `(e.g. canon/elements/05_implementation/activities/${projectId}.yaml)`,
    });
    return { valid: false, errors, warnings };
  }

  // LIFECYCLE-001..003 on the project Activity.
  const validFrom = projectRec['valid_from'];
  const validToRaw = projectRec['valid_to'];
  let validFromOk = false;
  if (validFrom === undefined || validFrom === null) {
    errors.push({ code: 'LIFECYCLE-001', message: `Activity "${projectId}" valid_from is required` });
  } else if (!isIsoDate(validFrom)) {
    errors.push({
      code: 'LIFECYCLE-001',
      message: `Activity "${projectId}" valid_from "${String(validFrom)}" is not a parseable ISO 8601 date`,
    });
  } else {
    validFromOk = true;
  }

  let validToOk = false;
  const validToPresent = validToRaw !== undefined && validToRaw !== null;
  if (validToPresent) {
    if (!isIsoDate(validToRaw)) {
      errors.push({
        code: 'LIFECYCLE-002',
        message: `Activity "${projectId}" valid_to "${String(validToRaw)}" is not a parseable ISO 8601 date`,
      });
    } else {
      validToOk = true;
      if (validFromOk && (validToRaw as string) < (validFrom as string)) {
        errors.push({
          code: 'LIFECYCLE-003',
          message: `Activity "${projectId}" valid_to "${String(validToRaw)}" is earlier than valid_from "${String(validFrom)}"`,
        });
      }
    }
  }

  // A failed lifecycle/PC-001 stops us producing a card view-model, but we still
  // return every error collected so the panel lists them all at once.
  const projectChanges = new Set(strArray(projectRec['delivers_changes']));
  // Project goals: prefer the first-class `activity_goal` relations (the
  // canonical, time-aware home for an Activity→Goal link); fall back to the
  // activity element's transitional inline `goals[]` when no relation exists
  // (07-activities.md §"Time-aware relations").
  const relGoalIds = activeActivityGoals(sources.relations, projectId);
  const projectGoalIds = relGoalIds.length > 0 ? relGoalIds : strArray(projectRec['goals']);

  // PC-003 — each milestone change must be a subset of the project's changes.
  const rawMilestones = Array.isArray(card.milestones) ? card.milestones : [];
  const milestones: ResolvedMilestone[] = [];
  for (const m of rawMilestones) {
    if (!isObject(m)) continue;
    const mid = str(m['id']);
    const mname = str(m['name']);
    const mdate = str(m['date']);
    if (!mid || !mname || !mdate) continue; // structural validator already flagged
    const deliversChanges = strArray(m['delivers_changes']);
    for (const c of deliversChanges) {
      if (!projectChanges.has(c)) {
        errors.push({
          code: 'PC-003',
          message: `Milestone "${mid}" delivers_changes "${c}" is not in project "${projectId}" delivers_changes`,
        });
      }
    }
    // PC-004 — milestone date should fall within the project lifecycle window.
    if (validFromOk && mdate < (validFrom as string)) {
      warnings.push({
        code: 'PC-004',
        message: `Milestone "${mid}" date "${mdate}" is before project valid_from "${String(validFrom)}"`,
      });
    }
    if (validToOk && mdate > (validToRaw as string)) {
      warnings.push({
        code: 'PC-004',
        message: `Milestone "${mid}" date "${mdate}" is after project valid_to "${String(validToRaw)}"`,
      });
    }
    milestones.push({
      id: mid,
      name: mname,
      date: mdate,
      description: str(m['description']),
      deliversChanges,
    });
  }
  milestones.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // If we have hard errors, surface them without an assembled card.
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // ── Motivation chain — expand against canon DRIVER / GOAL / CHANGE elements ──
  // Canon elements use `notation: driver`; `notation: factor` accepted for backward compat.
  const driverElemsLegacy = collectByNotation(sources.elements, 'factor');
  const driverElemsNew = collectByNotation(sources.elements, 'driver');
  const driverElems = new Map([...driverElemsLegacy, ...driverElemsNew]);
  const goalElems = collectByNotation(sources.elements, 'goal');
  const changeElems = collectByNotation(sources.elements, 'change');

  const changes: ResolvedChange[] = [];
  for (const cid of projectChanges) {
    const rec = changeElems.get(cid);
    if (!rec) {
      warnings.push({
        code: 'PC-001',
        message: `Project change "${cid}" not found as a CHANGE element in canon; omitted from the motivation chain`,
      });
      continue;
    }
    changes.push({ id: cid, name: str(rec['name']) ?? cid, goalIds: strArray(rec['goals']) });
  }

  // Goals shown = the project's declared goals ∪ goals referenced by in-scope
  // changes (so the D→G→C chain stays connected).
  const goalIdSet = new Set<string>(projectGoalIds);
  for (const ch of changes) for (const g of ch.goalIds) goalIdSet.add(g);

  const goals: ResolvedGoal[] = [];
  for (const gid of goalIdSet) {
    const rec = goalElems.get(gid);
    if (!rec) {
      warnings.push({
        code: 'PC-001',
        message: `Goal "${gid}" not found as a GOAL element in canon; omitted from the motivation chain`,
      });
      continue;
    }
    goals.push({ id: gid, name: str(rec['name']) ?? gid, driverIds: strArray(rec['factors']) });
  }

  // Drivers shown = those referenced by the in-scope goals.
  const driverIdSet = new Set<string>();
  for (const g of goals) for (const d of g.driverIds) driverIdSet.add(d);

  const drivers: ResolvedDriver[] = [];
  for (const did of driverIdSet) {
    const rec = driverElems.get(did);
    drivers.push({ id: did, name: rec ? str(rec['name']) ?? did : did });
  }

  // ── Assessments — findings that assess an in-scope Driver ────────────────────
  // Assessments answer "what specific problem are we solving?" They are resolved
  // from ASSESSMENT elements whose `assesses` field matches a Driver id that
  // appeared in the motivation chain above. Empty when none exist — the gap is
  // intentionally visible on the card so the author knows it needs filling.
  const driverIdLookup = new Set(drivers.map((d) => d.id));
  const assessmentElems = collectByNotation(sources.elements, 'assessment');
  const assessments: ResolvedAssessment[] = [];
  for (const [aid, rec] of assessmentElems) {
    const driverId = str(rec['assesses']);
    if (!driverId || !driverIdLookup.has(driverId)) continue;
    assessments.push({
      id: aid,
      name: str(rec['name']) ?? aid,
      driverId,
      description: str(rec['description']),
      observed_at: str(rec['observed_at']),
    });
  }
  assessments.sort((a, b) => {
    if (!a.observed_at && !b.observed_at) return 0;
    if (!a.observed_at) return 1;
    if (!b.observed_at) return -1;
    return a.observed_at < b.observed_at ? -1 : a.observed_at > b.observed_at ? 1 : 0;
  });

  // ── Child activities — parent = project id ──────────────────────────────────
  const childActivities: ResolvedChildActivity[] = [];
  for (const [id, rec] of activities) {
    if (str(rec['parent']) !== projectId) continue;
    childActivities.push({
      id,
      name: str(rec['name']) ?? id,
      activity_type: str(rec['activity_type']),
      start_date: str(rec['start_date']),
      end_date: str(rec['end_date']),
      owner: str(rec['owner']),
    });
  }
  childActivities.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // ── Project goal text field — names of the DIRECTLY-served goals ────────────
  // The "Project goal" field shows the goals the project itself serves (the
  // `activity_goal` targets), not the wider F→G→C chain (which also pulls in
  // goals referenced only by in-scope changes). Resolve each id to its GOAL
  // element name, falling back to the id when the element is absent.
  const goalNames = projectGoalIds.map((gid) => str(goalElems.get(gid)?.['name']) ?? gid);

  // ── Stakeholders — active `activity_stakeholder` relations from the project ──
  const stakeholderElems = collectByNotation(sources.elements, 'stakeholder');
  const stakeholders: ResolvedStakeholder[] = [];
  for (const { id: sid, role } of activeActivityStakeholders(sources.relations, projectId)) {
    const rec = stakeholderElems.get(sid);
    if (!rec) {
      warnings.push({
        code: 'PC-001',
        message: `Stakeholder "${sid}" not found as a STAKEHOLDER element in canon; shown by id`,
      });
      stakeholders.push({ id: sid, name: sid, role });
      continue;
    }
    stakeholders.push({
      id: sid,
      name: str(rec['name']) ?? sid,
      type: str(rec['type']),
      interest: str(rec['interest']),
      influence: str(rec['influence']),
      role,
    });
  }

  const project: ResolvedProject = {
    id: projectId,
    name: str(projectRec['name']) ?? projectId,
    description: str(projectRec['description']),
    valid_from: validFromOk ? (validFrom as string) : undefined,
    valid_to: validToOk ? (validToRaw as string) : undefined,
    start_date: str(projectRec['start_date']),
    end_date: str(projectRec['end_date']),
    activity_type: str(projectRec['activity_type']),
    status: str(projectRec['status']),
  };

  const resolved: ResolvedActivityCard = {
    cardId: str(card.id) ?? '',
    cardDescription: str(card.description),
    project,
    milestones,
    motivation: { drivers, goals, changes },
    assessments,
    childActivities,
    goalNames,
    stakeholders,
    notes: str(card.notes),
  };

  return { valid: true, errors, warnings, resolved };
}
