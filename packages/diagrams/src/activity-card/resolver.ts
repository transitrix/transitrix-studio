// Activity Card — cross-document resolver (the novel piece of this notation).
//
// Unlike every other Studio preview, the Activity Card is assembled from
// MULTIPLE documents. The card YAML names a project Activity; the resolver
// pulls the rest of the card's content by reference from sibling documents
// in the same view directory:
//
//   *.activities.transitrix.yaml  → the project Activity (name, lifecycle +
//                                    schedule dates, goals[], delivers_changes[])
//                                    and child activities (parent = project id)
//   *.fgca.transitrix.yaml        → expand the project's goals[] /
//                                    delivers_changes[] into Factor / Goal /
//                                    Change definitions and the F→G→C edges
//
// Resolution scope is the SINGLE view directory (exact-dir, non-recursive):
// the extension globs the card file's own directory and hands the parsed
// sibling docs in here. This resolver is filesystem-free and pure so it stays
// unit-testable.
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
  ResolvedChange,
  ResolvedChildActivity,
  ResolvedFactor,
  ResolvedGoal,
  ResolvedMilestone,
  ResolvedProject,
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

/** Flatten every `activities[]` entry across all sibling activities docs. */
function collectActivities(docs: unknown[]): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    const arr = doc['activities'];
    if (!Array.isArray(arr)) continue;
    for (const el of arr) {
      if (!isObject(el)) continue;
      const id = str(el['id']);
      if (!id) continue;
      if (!out.has(id)) out.set(id, el); // first definition wins
    }
  }
  return out;
}

/** Collect canonical FGCA factors/goals/changes (string-ID form) across docs. */
function collectFgca(docs: unknown[]): {
  factors: Map<string, Record<string, unknown>>;
  goals: Map<string, Record<string, unknown>>;
  changes: Map<string, Record<string, unknown>>;
} {
  const factors = new Map<string, Record<string, unknown>>();
  const goals = new Map<string, Record<string, unknown>>();
  const changes = new Map<string, Record<string, unknown>>();
  const ingest = (arr: unknown, into: Map<string, Record<string, unknown>>) => {
    if (!Array.isArray(arr)) return;
    for (const el of arr) {
      if (!isObject(el)) continue;
      const id = str(el['id']);
      if (id && !into.has(id)) into.set(id, el);
    }
  };
  for (const doc of docs) {
    if (!isObject(doc)) continue;
    ingest(doc['factors'], factors);
    ingest(doc['goals'], goals);
    ingest(doc['changes'], changes);
  }
  return { factors, goals, changes };
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

  const activities = collectActivities(sources.activitiesDocs);
  const projectRec = activities.get(projectId);

  // PC-001 — project must resolve to an admitted Activity.
  if (!projectRec) {
    errors.push({
      code: 'PC-001',
      message: `activity_card.project "${projectId}" does not resolve to an Activity in any sibling *.activities.* document`,
    });
    return { valid: false, errors, warnings };
  }

  // PC-002 — resolved Activity must be a Project.
  const activityType = str(projectRec['activity_type']);
  if (activityType !== 'Project') {
    errors.push({
      code: 'PC-002',
      message: `Activity "${projectId}" has activity_type "${activityType ?? '(unset)'}", expected "Project"`,
    });
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
  const projectGoalIds = strArray(projectRec['goals']);

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

  // ── Motivation chain — expand against sibling FGCA docs ─────────────────────
  const fgca = collectFgca(sources.fgcaDocs);

  const changes: ResolvedChange[] = [];
  for (const cid of projectChanges) {
    const rec = fgca.changes.get(cid);
    if (!rec) {
      warnings.push({
        code: 'PC-001',
        message: `Project change "${cid}" not found in any sibling *.fgca.* document; omitted from the motivation chain`,
      });
      continue;
    }
    changes.push({ id: cid, name: str(rec['name']) ?? cid, goalIds: strArray(rec['goals']) });
  }

  // Goals shown = the project's declared goals ∪ goals referenced by in-scope
  // changes (so the F→G→C chain stays connected).
  const goalIdSet = new Set<string>(projectGoalIds);
  for (const ch of changes) for (const g of ch.goalIds) goalIdSet.add(g);

  const goals: ResolvedGoal[] = [];
  for (const gid of goalIdSet) {
    const rec = fgca.goals.get(gid);
    if (!rec) {
      warnings.push({
        code: 'PC-001',
        message: `Goal "${gid}" not found in any sibling *.fgca.* document; omitted from the motivation chain`,
      });
      continue;
    }
    goals.push({ id: gid, name: str(rec['name']) ?? gid, factorIds: strArray(rec['factors']) });
  }

  // Factors shown = those referenced by the in-scope goals.
  const factorIdSet = new Set<string>();
  for (const g of goals) for (const f of g.factorIds) factorIdSet.add(f);

  const factors: ResolvedFactor[] = [];
  for (const fid of factorIdSet) {
    const rec = fgca.factors.get(fid);
    factors.push({ id: fid, name: rec ? str(rec['name']) ?? fid : fid });
  }

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

  const project: ResolvedProject = {
    id: projectId,
    name: str(projectRec['name']) ?? projectId,
    description: str(projectRec['description']),
    valid_from: validFromOk ? (validFrom as string) : undefined,
    valid_to: validToOk ? (validToRaw as string) : undefined,
    start_date: str(projectRec['start_date']),
    end_date: str(projectRec['end_date']),
  };

  const resolved: ResolvedActivityCard = {
    cardId: str(card.id) ?? '',
    cardDescription: str(card.description),
    project,
    milestones,
    motivation: { factors, goals, changes },
    childActivities,
  };

  return { valid: true, errors, warnings, resolved };
}
