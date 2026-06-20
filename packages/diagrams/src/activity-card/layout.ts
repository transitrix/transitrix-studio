// Activity Card — single-page layout (pure geometry; the preview paints SVG).
//
// Card structure (top to bottom):
//   Header  — title row (name + type badge + status badge)
//             dates row (Initiation · Planned start · Planned end)
//             roles row (Initiator · Owner · Sponsor · PM)
//   Body    — description (optional)
//             chain: Drivers → Assessments → Goals → Changes (vertical)
//             milestones
//             child activities
//   Footer  — notes (optional)
//
// The §5.1 ArchiMate-class convention is applied here, derived from element
// TYPE — there is no archimate_class data field.

import type {
  ActivityCardLayout,
  ActivityCardLayoutOptions,
  Badge,
  ChainEdge,
  ChainNode,
  ChainSectionLayout,
  ChildActivityRow,
  DateField,
  InfoRow,
  MilestoneMarker,
  ResolvedActivityCard,
  StakeholderRoleSlot,
} from './types.js';

const DEFAULTS = {
  cardWidth: 780,
  rowGap: 10,
} as const;

// Fixed metrics (px).
const PAD = 20;
const TITLE_H = 44;
const BADGE_H = 22;
const BADGE_HPAD = 12;
const BADGE_GAP = 8;
const DATES_H = 56;
const ROLES_H = 52;
const CELL_GAP = 12;
const SECTION_GAP = 16;
const CONNECTOR_H = 20;
const CHAIN_HEADER_H = 24;
const CHAIN_NODE_H = 40;
const CHAIN_GAP_H = 32;
const CHAIN_INNER_PAD = 12;
const MILESTONE_W = 168;
const MILESTONE_H = 64;
const MILESTONE_GAP = 16;
const CHILD_ROW_H = 42;
const INFO_LINE_H = 18;
const INFO_ROW_BASE_H = 38;
const INFO_CHAR_W = 7;

/** §5.1 ArchiMate class — derived from element TYPE, never stored. */
export const ARCHIMATE_CLASS = {
  ACTIVITY: 'Work Package',
  MILESTONE: 'Implementation Event',
} as const;

function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) return [];
  const budget = Math.max(1, maxChars);
  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    if (cur.length > 0) { lines.push(cur); cur = ''; }
  };
  for (const word of words) {
    if (word.length > budget) {
      flush();
      let rest = word;
      while (rest.length > budget) { lines.push(rest.slice(0, budget)); rest = rest.slice(budget); }
      cur = rest;
      continue;
    }
    const candidate = cur.length > 0 ? `${cur} ${word}` : word;
    if (candidate.length > budget) { flush(); cur = word; } else { cur = candidate; }
  }
  flush();
  if (lines.length > maxLines) {
    const capped = lines.slice(0, maxLines);
    const last = capped[maxLines - 1];
    const clipped = last.length > budget - 1 ? last.slice(0, budget - 1) : last;
    capped[maxLines - 1] = `${clipped.replace(/…$/, '')}…`;
    return capped;
  }
  return lines;
}

function formatBadgeLabel(raw: string): string {
  return raw.replace(/_/g, ' ');
}

function badgeWidth(label: string): number {
  return Math.max(56, label.length * 7 + BADGE_HPAD * 2);
}

export function layoutActivityCard(
  card: ResolvedActivityCard,
  options?: ActivityCardLayoutOptions,
): ActivityCardLayout {
  const opts = { ...DEFAULTS, ...(options ?? {}) };
  const contentX = PAD;
  const contentW = opts.cardWidth - PAD * 2;
  const maxChars = Math.max(8, Math.floor(contentW / INFO_CHAR_W));
  let cursorY = PAD;

  // ── 1. Title row — name + type badge + status badge ──────────────────────
  const titleRow = { name: card.project.name, x: contentX, y: cursorY + TITLE_H / 2 };

  let badgeRightX = contentX + contentW;
  let statusBadge: Badge | undefined;
  let activityTypeBadge: Badge | undefined;

  if (card.project.status) {
    const label = formatBadgeLabel(card.project.status);
    const w = badgeWidth(label);
    badgeRightX -= w;
    statusBadge = { label, x: badgeRightX, y: cursorY + (TITLE_H - BADGE_H) / 2, width: w, height: BADGE_H };
    badgeRightX -= BADGE_GAP;
  }
  if (card.project.activity_type) {
    const label = formatBadgeLabel(card.project.activity_type);
    const w = badgeWidth(label);
    badgeRightX -= w;
    activityTypeBadge = { label, x: badgeRightX, y: cursorY + (TITLE_H - BADGE_H) / 2, width: w, height: BADGE_H };
  }
  cursorY += TITLE_H;

  // ── 2. Dates row ─────────────────────────────────────────────────────────
  const dateDefs: Array<{ label: string; value: string }> = [
    { label: 'Initiation', value: card.project.valid_from ?? '—' },
    { label: 'Planned start', value: card.project.start_date ?? '—' },
    { label: 'Planned end', value: card.project.end_date ?? '—' },
  ];
  const dateCellW = (contentW - CELL_GAP * (dateDefs.length - 1)) / dateDefs.length;
  const dateFields: DateField[] = dateDefs.map((d, i) => ({
    label: d.label, value: d.value,
    x: contentX + i * (dateCellW + CELL_GAP), y: cursorY,
    width: dateCellW, height: DATES_H,
  }));
  cursorY += DATES_H + CELL_GAP;

  // ── 3. Stakeholder role slots row ────────────────────────────────────────
  const ROLE_DEFS: Array<{ role: string; label: string }> = [
    { role: 'initiator', label: 'Initiator' },
    { role: 'owner', label: 'Owner' },
    { role: 'sponsor', label: 'Sponsor' },
    { role: 'project_manager', label: 'PM' },
  ];
  const roleSlotW = (contentW - CELL_GAP * (ROLE_DEFS.length - 1)) / ROLE_DEFS.length;
  const stakeholderRoleSlots: StakeholderRoleSlot[] = ROLE_DEFS.map(({ role, label }, i) => {
    const match = (card.stakeholders ?? []).find((s) => s.role === role);
    return {
      role: label,
      name: match?.name ?? '—',
      x: contentX + i * (roleSlotW + CELL_GAP), y: cursorY,
      width: roleSlotW, height: ROLES_H,
    };
  });
  cursorY += ROLES_H + SECTION_GAP;

  // ── 4. Description row (optional) ────────────────────────────────────────
  let descriptionRow: InfoRow | undefined;
  const description = (card.cardDescription ?? '').trim();
  if (description.length > 0) {
    const valueLines = wrapText(description, maxChars, 5);
    const lines = valueLines.length > 0 ? valueLines : ['—'];
    const height = INFO_ROW_BASE_H + lines.length * INFO_LINE_H;
    descriptionRow = { label: 'Description', valueLines: lines, x: contentX, y: cursorY, width: contentW, height };
    cursorY += height + SECTION_GAP;
  }

  // ── 5. Chain: Drivers → Assessments → Goals → Changes ────────────────────
  // Each section is a full-width band with a header label and stacked node rows.
  // An empty section shows a gap indicator ("— not on file") so the author
  // sees which parts of the narrative are missing.

  const chainSections: ChainSectionLayout[] = [];
  const chainEdges: ChainEdge[] = [];

  function pushChainSection(
    type: ChainSectionLayout['type'],
    label: string,
    rawNodes: Array<{ id: string; name: string; meta?: string }>,
  ): void {
    const isEmpty = rawNodes.length === 0;
    const sectionY = cursorY;
    const nodeStartY = sectionY + CHAIN_HEADER_H + 8;
    const nodeW = contentW - CHAIN_INNER_PAD * 2;

    const nodes: ChainNode[] = isEmpty ? [] : rawNodes.map((n, i) => ({
      id: n.id,
      name: n.name,
      meta: n.meta,
      x: contentX + CHAIN_INNER_PAD,
      y: nodeStartY + i * (CHAIN_NODE_H + opts.rowGap),
      width: nodeW,
      height: CHAIN_NODE_H,
    }));

    const bodyH = isEmpty
      ? CHAIN_GAP_H
      : rawNodes.length * (CHAIN_NODE_H + opts.rowGap) - opts.rowGap;
    const sectionH = CHAIN_HEADER_H + 8 + bodyH + 8;

    chainSections.push({ type, label, nodes, isEmpty, x: contentX, y: sectionY, width: contentW, height: sectionH });
    cursorY += sectionH + CONNECTOR_H;
  }

  const { factors, goals, changes } = card.motivation;
  const assessments = card.assessments ?? [];

  pushChainSection('drivers', 'Drivers',
    factors.map((f) => ({ id: f.id, name: f.name })));

  pushChainSection('assessments', 'Assessments',
    assessments.map((a) => ({ id: a.id, name: a.name, meta: a.observed_at })));

  pushChainSection('goals', 'Goals',
    goals.map((g) => ({ id: g.id, name: g.name })));

  pushChainSection('changes', 'Changes',
    changes.map((c) => ({ id: c.id, name: c.name })));

  // Remove trailing CONNECTOR_H — last section connects to milestones with SECTION_GAP.
  cursorY = cursorY - CONNECTOR_H + SECTION_GAP;

  // Node-level chain edges.
  const driverIdSet = new Set(factors.map((f) => f.id));
  const goalIdSet = new Set(goals.map((g) => g.id));
  for (const a of assessments) {
    if (driverIdSet.has(a.driverId)) chainEdges.push({ sourceId: a.driverId, targetId: a.id });
  }
  for (const g of goals) {
    for (const fid of g.factorIds) {
      if (driverIdSet.has(fid)) chainEdges.push({ sourceId: fid, targetId: g.id });
    }
  }
  for (const c of changes) {
    for (const gid of c.goalIds) {
      if (goalIdSet.has(gid)) chainEdges.push({ sourceId: gid, targetId: c.id });
    }
  }

  // ── 6. Milestones ────────────────────────────────────────────────────────
  const milestones: MilestoneMarker[] = [];
  if (card.milestones.length > 0) {
    const perRow = Math.max(1, Math.floor((contentW + MILESTONE_GAP) / (MILESTONE_W + MILESTONE_GAP)));
    card.milestones.forEach((m, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      milestones.push({
        id: m.id, name: m.name, date: m.date,
        archimateClass: ARCHIMATE_CLASS.MILESTONE,
        x: contentX + col * (MILESTONE_W + MILESTONE_GAP),
        y: cursorY + row * (MILESTONE_H + opts.rowGap),
        width: MILESTONE_W, height: MILESTONE_H,
      });
    });
    const rows = Math.ceil(card.milestones.length / perRow);
    cursorY += rows * (MILESTONE_H + opts.rowGap) - opts.rowGap + SECTION_GAP;
  }

  // ── 7. Child activities ───────────────────────────────────────────────────
  const childActivities: ChildActivityRow[] = [];
  if (card.childActivities.length > 0) {
    card.childActivities.forEach((a, i) => {
      const metaBits: string[] = [];
      if (a.start_date || a.end_date) metaBits.push(`${a.start_date ?? '?'} → ${a.end_date ?? '?'}`);
      if (a.owner) metaBits.push(a.owner);
      childActivities.push({
        id: a.id, name: a.name,
        archimateClass: ARCHIMATE_CLASS.ACTIVITY,
        meta: metaBits.join(' · '),
        x: contentX,
        y: cursorY + i * (CHILD_ROW_H + opts.rowGap),
        width: contentW, height: CHILD_ROW_H,
      });
    });
    cursorY += card.childActivities.length * (CHILD_ROW_H + opts.rowGap) - opts.rowGap + SECTION_GAP;
  }

  // ── 8. Footer — notes ────────────────────────────────────────────────────
  let footerRow: InfoRow | undefined;
  const notes = (card.notes ?? '').trim();
  if (notes.length > 0) {
    const valueLines = wrapText(notes, maxChars, 10);
    const lines = valueLines.length > 0 ? valueLines : ['—'];
    const height = INFO_ROW_BASE_H + lines.length * INFO_LINE_H;
    footerRow = { label: 'Notes', valueLines: lines, x: contentX, y: cursorY, width: contentW, height };
    cursorY += height + SECTION_GAP;
  }

  const totalHeight = cursorY - SECTION_GAP + PAD;

  return {
    bounds: { x: 0, y: 0, width: opts.cardWidth, height: Math.max(totalHeight, PAD * 2 + TITLE_H) },
    titleRow,
    activityTypeBadge,
    statusBadge,
    dateFields,
    stakeholderRoleSlots,
    descriptionRow,
    chainSections,
    chainEdges,
    milestones,
    childActivities,
    footerRow,
  };
}
