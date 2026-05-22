import type {
  Activity,
  ActivityDoc,
  GanttBar,
  GanttLayout,
  GanttLink,
  GanttResult,
  ProjectCalendar,
  Weekday,
} from './types.js';
import { computeCpm } from './cpm.js';

// ── Calendar helpers (UTC midnight to avoid timezone shifts) ─────────────────

const DEFAULT_WORKING_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_BY_INDEX: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

interface ResolvedCalendar {
  workingDays: Set<Weekday>;
  holidays: Set<string>;
}

function resolveCalendar(cal: ProjectCalendar | undefined): ResolvedCalendar {
  const wdRaw = Array.isArray(cal?.working_days) && cal!.working_days.length > 0
    ? cal!.working_days
    : DEFAULT_WORKING_DAYS;
  const workingDays = new Set<Weekday>();
  for (const d of wdRaw) {
    if (typeof d === 'string') workingDays.add(d.toLowerCase() as Weekday);
  }
  const holidays = new Set<string>();
  for (const h of cal?.holidays ?? []) {
    if (typeof h === 'string') holidays.add(h);
  }
  return { workingDays, holidays };
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map((p) => Number.parseInt(p, 10));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatISO(d: Date): string {
  const yyyy = d.getUTCFullYear().toString().padStart(4, '0');
  const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = d.getUTCDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addUtcDays(d: Date, n: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function isWorkingDay(d: Date, cal: ResolvedCalendar): boolean {
  if (cal.holidays.has(formatISO(d))) return false;
  return cal.workingDays.has(WEEKDAY_BY_INDEX[d.getUTCDay()]);
}

/**
 * Date of the n-th (0-indexed) working day at or after `startDate`.
 *
 * If `startDate` itself is a working day, that's index 0. Walks forward day
 * by day, counting only working days. The loop is bounded by a sanity cap to
 * avoid hangs if the calendar ever has zero working days (which the validator
 * should already have flagged via ACT-014, but defending here too).
 */
function nthWorkingDay(startDate: string, n: number, cal: ResolvedCalendar): string {
  if (n < 0) return startDate;
  let cur = parseISO(startDate);
  let count = 0;
  const sanityLimit = Math.max(10, n) * 10 + 365;
  for (let i = 0; i < sanityLimit; i++) {
    if (isWorkingDay(cur, cal)) {
      if (count === n) return formatISO(cur);
      count++;
    }
    cur = addUtcDays(cur, 1);
  }
  return formatISO(cur);
}

// ── Mode detection + leaf classification ─────────────────────────────────────

interface ActivityRoles {
  childCount: Map<string, number>;
  leaves: Activity[];
  phases: Activity[];
}

function classifyActivities(activities: Activity[]): ActivityRoles {
  const childCount = new Map<string, number>();
  for (const a of activities) {
    if (typeof a.parent === 'string' && a.parent.length > 0) {
      childCount.set(a.parent, (childCount.get(a.parent) ?? 0) + 1);
    }
  }
  const leaves: Activity[] = [];
  const phases: Activity[] = [];
  for (const a of activities) {
    if ((childCount.get(a.id) ?? 0) > 0) phases.push(a);
    else leaves.push(a);
  }
  return { childCount, leaves, phases };
}

function detectMode(doc: ActivityDoc, leaves: Activity[]): 'computed' | 'pinned' | null {
  if (leaves.length === 0) return null;
  const allPinned = leaves.every(
    (a) => typeof a.start_date === 'string' && typeof a.end_date === 'string',
  );
  if (allPinned) return 'pinned';
  const hasProjectStart =
    typeof doc.project?.start_date === 'string' && doc.project.start_date.length > 0;
  const allHaveDuration = leaves.every(
    (a) => typeof a.duration === 'number' && Number.isFinite(a.duration) && a.duration >= 0,
  );
  if (hasProjectStart && allHaveDuration) return 'computed';
  return null;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function computeGanttLayout(doc: ActivityDoc): GanttResult {
  const activities = doc.activities ?? [];
  if (activities.length === 0) {
    return { unavailable: true, reason: 'Document has no activities to render on a Gantt timeline.' };
  }

  const { leaves, phases } = classifyActivities(activities);
  const mode = detectMode(doc, leaves);
  if (mode === null) {
    const reason = leaves.length === 0
      ? 'All activities are parent (phase) activities — no leaf activities to place on the timeline.'
      : 'Gantt view unavailable: provide either project.start_date plus durations on every leaf activity (computed mode), or per-activity start_date and end_date on every leaf (pinned mode).';
    return { unavailable: true, reason };
  }

  const bars: GanttBar[] = [];
  const barById = new Map<string, GanttBar>();

  if (mode === 'pinned') {
    for (const a of leaves) {
      const startDate = a.start_date as string;
      const endDate = a.end_date as string;
      const isMilestone = a.duration === 0 || startDate === endDate;
      const bar: GanttBar = {
        id: a.id,
        name: a.name,
        kind: isMilestone ? 'milestone' : 'leaf',
        startDate,
        endDate,
        isCritical: false, // pinned mode does not compute CPM
        parent: typeof a.parent === 'string' ? a.parent : undefined,
        data: a,
      };
      bars.push(bar);
      barById.set(a.id, bar);
    }
  } else {
    // computed: project.start_date + CPM ES + working-day calendar
    const cpm = computeCpm(activities);
    const projectStart = (doc.project!.start_date as string);
    const calendar = resolveCalendar(doc.project?.calendar);
    for (const a of leaves) {
      const c = cpm.get(a.id);
      const es = c?.es ?? 0;
      const dur = a.duration ?? 0;
      const startDate = nthWorkingDay(projectStart, es, calendar);
      const endDate = dur === 0
        ? startDate
        : nthWorkingDay(projectStart, es + dur - 1, calendar);
      const bar: GanttBar = {
        id: a.id,
        name: a.name,
        kind: dur === 0 ? 'milestone' : 'leaf',
        startDate,
        endDate,
        isCritical: c?.isCritical ?? false,
        parent: typeof a.parent === 'string' ? a.parent : undefined,
        data: a,
      };
      bars.push(bar);
      barById.set(a.id, bar);
    }
  }

  // Phase rollup — earliest child start to latest child end across all
  // descendants. Walk depth-first so nested phases inherit grandchildren too.
  if (phases.length > 0) {
    const childrenOf = new Map<string, Activity[]>();
    for (const a of activities) {
      if (typeof a.parent === 'string' && a.parent.length > 0) {
        if (!childrenOf.has(a.parent)) childrenOf.set(a.parent, []);
        childrenOf.get(a.parent)!.push(a);
      }
    }

    const phaseSpan = new Map<string, { startDate: string; endDate: string; isCritical: boolean }>();
    function spanOf(activityId: string): { startDate: string; endDate: string; isCritical: boolean } | null {
      const cached = phaseSpan.get(activityId);
      if (cached) return cached;
      const leaf = barById.get(activityId);
      if (leaf) return { startDate: leaf.startDate, endDate: leaf.endDate, isCritical: leaf.isCritical };
      const children = childrenOf.get(activityId) ?? [];
      if (children.length === 0) return null;
      let minStart: string | null = null;
      let maxEnd: string | null = null;
      let anyCritical = false;
      for (const child of children) {
        const s = spanOf(child.id);
        if (!s) continue;
        if (minStart === null || s.startDate < minStart) minStart = s.startDate;
        if (maxEnd === null || s.endDate > maxEnd) maxEnd = s.endDate;
        if (s.isCritical) anyCritical = true;
      }
      if (minStart === null || maxEnd === null) return null;
      const span = { startDate: minStart, endDate: maxEnd, isCritical: anyCritical };
      phaseSpan.set(activityId, span);
      return span;
    }

    for (const p of phases) {
      const span = spanOf(p.id);
      if (!span) continue;
      const bar: GanttBar = {
        id: p.id,
        name: p.name,
        kind: 'phase',
        startDate: span.startDate,
        endDate: span.endDate,
        isCritical: span.isCritical,
        parent: typeof p.parent === 'string' ? p.parent : undefined,
        data: p,
      };
      bars.push(bar);
      barById.set(p.id, bar);
    }
  }

  // Predecessor link lines. Only between leaves (phases derive their dates).
  const links: GanttLink[] = [];
  for (const a of leaves) {
    for (const predId of a.predecessors ?? []) {
      const sourceBar = barById.get(predId);
      const targetBar = barById.get(a.id);
      if (!sourceBar || !targetBar) continue;
      links.push({
        sourceId: predId,
        targetId: a.id,
        isCritical: sourceBar.isCritical && targetBar.isCritical,
      });
    }
  }

  // Timeline bounds — pure min/max over the bar set.
  let timelineStart = bars[0].startDate;
  let timelineEnd = bars[0].endDate;
  for (const b of bars) {
    if (b.startDate < timelineStart) timelineStart = b.startDate;
    if (b.endDate > timelineEnd) timelineEnd = b.endDate;
  }

  return {
    mode,
    timelineStart,
    timelineEnd,
    bars,
    links,
  };
}

export function isGanttUnavailable(result: GanttResult): result is { unavailable: true; reason: string } {
  return (result as { unavailable?: boolean }).unavailable === true;
}
