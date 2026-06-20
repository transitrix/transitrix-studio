import type {
  AspectCategory,
  AspectEntry,
  AspectPill,
  AspectRow,
  ComplianceChip,
  ComplianceDecoration,
  ComplianceLaneAssertion,
  ComplianceLaneInput,
  ComplianceLaneRequirement,
  ComplianceRow,
  ProcessBlueprintLayoutOptions,
  LegendCell,
  ProcessBlueprintFile,
  ProcessBlueprintLayout,
  RowId,
  Stage,
  StageHeaderCell,
  StageTextCell,
} from './types.js';

const ASPECT_CATEGORIES: AspectCategory[] = ['systems', 'actors', 'equipment', 'information_entities'];

const ASPECT_LABEL: Record<AspectCategory, string> = {
  systems: 'Systems',
  actors: 'Actors',
  equipment: 'Equipment',
  information_entities: 'Information',
};

// Sizing options always resolve to a number; the non-sizing options are opt-in
// (absent = feature disabled) and must stay optional in the resolved type.
type SizingOptionKeys = Exclude<
  keyof ProcessBlueprintLayoutOptions,
  'complianceLane' | 'complianceInput' | 'visibleAspects' | 'visibleRows' | 'visibleStages'
>;

/**
 * Options after defaults are applied: every sizing field is guaranteed present;
 * the opt-in feature fields stay optional (undefined = feature disabled).
 */
type ResolvedLayoutOptions = Required<Pick<ProcessBlueprintLayoutOptions, SizingOptionKeys>> &
  Pick<ProcessBlueprintLayoutOptions, 'complianceLane' | 'complianceInput' | 'visibleAspects' | 'visibleRows' | 'visibleStages'>;

const DEFAULTS = {
  legendColumnWidth: 140,
  stageColumnWidth: 220,
  stageHeaderHeight: 40,
  goalRowHeight: 56,
  resultRowHeight: 56,
  aspectRowMinHeight: 60,
  pillHeight: 40,
  pillGap: 4,
  cellPadding: 8,
  // 17px gives comfortable breathing room between wrapped lines at typical
  // webview font sizes (VS Code uses ~13–14px body, SVG text-secondary ≈ same).
  textLineHeight: 17,
  // 7.5px per char is a conservative estimate that causes wrap to trigger
  // before text visually overflows the cell border.
  textCharWidth: 7.5,
  cellTextPadX: 10,
  cellTextPadY: 10,
  // No hard truncation: rows grow to fit all wrapped lines.
  maxTextLines: 100,
} satisfies Required<Pick<ProcessBlueprintLayoutOptions, SizingOptionKeys>>;

interface RawPill {
  category: AspectCategory;
  entryIndex: number;
  name: string;
  id?: string;
  startStageIndex: number;
  endStageIndex: number;
}

function resolveOptions(options: ProcessBlueprintLayoutOptions | undefined): ResolvedLayoutOptions {
  return { ...DEFAULTS, ...(options ?? {}) };
}

/**
 * Greedy word-wrap to a max characters-per-line budget. Words longer than the
 * budget are hard-split; if the result exceeds `maxLines`, the last kept line
 * is truncated with an ellipsis so a single pathological cell can't grow the
 * whole row unbounded.
 */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const trimmed = (text ?? '').trim();
  if (trimmed.length === 0) return [];
  const budget = Math.max(1, maxChars);

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    if (cur.length > 0) {
      lines.push(cur);
      cur = '';
    }
  };

  for (const word of words) {
    if (word.length > budget) {
      // Token wider than the cell: hard-break it across lines.
      flush();
      let rest = word;
      while (rest.length > budget) {
        lines.push(rest.slice(0, budget));
        rest = rest.slice(budget);
      }
      cur = rest;
      continue;
    }
    const candidate = cur.length > 0 ? `${cur} ${word}` : word;
    if (candidate.length > budget) {
      flush();
      cur = word;
    } else {
      cur = candidate;
    }
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

function buildStageIndex(stages: Stage[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (let i = 0; i < stages.length; i++) {
    const sid = typeof stages[i]?.id === 'string' ? stages[i].id.trim() : '';
    if (sid.length > 0 && !idx.has(sid)) {
      idx.set(sid, i);
    }
  }
  return idx;
}

function pillsForEntry(
  category: AspectCategory,
  entryIndex: number,
  entry: AspectEntry,
  stageIndexById: Map<string, number>,
): RawPill[] {
  if (!Array.isArray(entry.stages)) return [];

  const idxs: number[] = [];
  const seen = new Set<number>();
  for (const ref of entry.stages) {
    if (typeof ref !== 'string') continue;
    const i = stageIndexById.get(ref.trim());
    if (i === undefined) continue;
    if (seen.has(i)) continue;
    seen.add(i);
    idxs.push(i);
  }
  idxs.sort((a, b) => a - b);

  const pills: RawPill[] = [];
  let runStart: number | null = null;
  let runEnd: number | null = null;
  for (const i of idxs) {
    if (runStart === null || runEnd === null) {
      runStart = i;
      runEnd = i;
      continue;
    }
    if (i === runEnd + 1) {
      runEnd = i;
    } else {
      pills.push({
        category,
        entryIndex,
        name: entry.name,
        id: entry.id,
        startStageIndex: runStart,
        endStageIndex: runEnd,
      });
      runStart = i;
      runEnd = i;
    }
  }
  if (runStart !== null && runEnd !== null) {
    pills.push({
      category,
      entryIndex,
      name: entry.name,
      id: entry.id,
      startStageIndex: runStart,
      endStageIndex: runEnd,
    });
  }
  return pills;
}

function packPillsIntoSlots(pills: RawPill[]): { slot: number[]; maxSlot: number } {
  // Greedy interval scheduling: stable order by startStageIndex.
  const order = pills
    .map((_, i) => i)
    .sort((a, b) => {
      const ds = pills[a].startStageIndex - pills[b].startStageIndex;
      if (ds !== 0) return ds;
      return pills[a].endStageIndex - pills[b].endStageIndex;
    });

  const slotEndByLevel: number[] = []; // slotEndByLevel[s] = last endStageIndex placed in slot s
  const slot = new Array<number>(pills.length).fill(0);
  let maxSlot = 0;

  for (const i of order) {
    const p = pills[i];
    let placed = false;
    for (let s = 0; s < slotEndByLevel.length; s++) {
      if (slotEndByLevel[s] < p.startStageIndex) {
        slot[i] = s;
        slotEndByLevel[s] = p.endStageIndex;
        placed = true;
        break;
      }
    }
    if (!placed) {
      slot[i] = slotEndByLevel.length;
      slotEndByLevel.push(p.endStageIndex);
    }
    if (slot[i] > maxSlot) maxSlot = slot[i];
  }

  return { slot, maxSlot };
}

// ── Compliance lane derivation ────────────────────────────────────────────────

/** ISO 8601 date comparison helper — no Date parsing, string comparison is valid for YYYY-MM-DD. */
function deadlineStatus(
  deadline: string | undefined,
  today: string,
): 'past_due' | 'in_force' | 'upcoming' | 'none' {
  if (!deadline) return 'none';
  if (deadline < today) return 'past_due';
  const daysAway = Math.round(
    (new Date(deadline).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24),
  );
  return daysAway <= 30 ? 'in_force' : 'upcoming';
}

/**
 * Derive the laid-out compliance row for a process blueprint.
 *
 * For each stage, gathers the laws that bind that stage (via the
 * assertion → requirement → derived_from chain), applies the jurisdiction
 * filter, and computes the three orthogonal decorations per law chip.
 */
function deriveComplianceRow(
  stages: Stage[],
  stageIndexById: Map<string, number>,
  input: ComplianceLaneInput,
  opts: ResolvedLayoutOptions,
  yStart: number,
): ComplianceRow | undefined {
  const {
    complianceLane: laneConfig,
    legendColumnWidth,
    stageColumnWidth,
    cellPadding,
    pillHeight,
    pillGap,
    aspectRowMinHeight,
  } = opts;

  if (!laneConfig?.enabled) return undefined;

  const today = laneConfig.referenceDate ?? new Date().toISOString().slice(0, 10);
  const filterJurisdictions = laneConfig.jurisdictions?.length ? new Set(laneConfig.jurisdictions) : null;

  // Build requirement index: id → requirement.
  const reqById = new Map<string, ComplianceLaneRequirement>();
  for (const r of input.requirements) {
    if (r?.id) reqById.set(r.id, r);
  }

  // Per-stage accumulation: stageIdx → lawId → { worstStatus, deadline }
  type LawAccumulator = { gap: boolean; deadline: string | undefined };
  const stageAccum = new Map<number, Map<string, LawAccumulator>>();

  for (const a of input.assertions) {
    if (!a || typeof a !== 'object') continue;
    const realisedVia: string[] = Array.isArray(a.realised_via) ? a.realised_via : [];
    if (realisedVia.length === 0) continue;

    const req = reqById.get(a.about);
    if (!req) continue;

    const lawIds: string[] = Array.isArray(req.derived_from)
      ? (req.derived_from as string[]).filter((x): x is string => typeof x === 'string')
      : [];
    if (lawIds.length === 0) continue;

    for (const stageRef of realisedVia) {
      if (typeof stageRef !== 'string') continue;
      const idx = stageIndexById.get(stageRef.trim());
      if (idx === undefined) continue;

      for (const lawId of lawIds) {
        // Apply jurisdiction filter.
        if (filterJurisdictions) {
          const jur = input.codexJurisdictions?.[lawId];
          if (!jur || !filterJurisdictions.has(jur)) continue;
        }

        if (!stageAccum.has(idx)) stageAccum.set(idx, new Map());
        const lawMap = stageAccum.get(idx)!;
        const existing = lawMap.get(lawId);
        const isGap = a.status === 'non_compliant' || a.status === 'partial';
        if (!existing) {
          lawMap.set(lawId, { gap: isGap, deadline: req.deadline });
        } else {
          existing.gap = existing.gap || isGap;
          // Keep the earlier deadline (more urgent).
          if (req.deadline && (!existing.deadline || req.deadline < existing.deadline)) {
            existing.deadline = req.deadline;
          }
        }
      }
    }
  }

  if (stageAccum.size === 0) return undefined;

  // Determine how many slots (rows) per stage.
  const slotsPerStage = new Map<number, number>();
  for (const [idx, lawMap] of stageAccum) {
    slotsPerStage.set(idx, lawMap.size);
  }
  const maxSlots = Math.max(0, ...slotsPerStage.values());
  if (maxSlots === 0) return undefined;

  const contentHeight = maxSlots * (pillHeight + pillGap) - pillGap;
  const rowHeight = Math.max(aspectRowMinHeight, contentHeight + 2 * cellPadding);

  const chips: ComplianceChip[] = [];

  for (const [stageIdx, lawMap] of stageAccum) {
    const prevLawIds = new Set<string>(laneConfig.previousSnapshot?.[stages[stageIdx]?.id ?? ''] ?? []);
    let slot = 0;

    for (const [lawId, accum] of lawMap) {
      const decorations: ComplianceDecoration[] = [];
      if (!prevLawIds.has(lawId)) decorations.push('new');
      if (accum.gap) {
        decorations.push('gap');
        const ds = deadlineStatus(accum.deadline, today);
        if (ds !== 'none') decorations.push('deadline');
      }

      const x = legendColumnWidth + stageIdx * stageColumnWidth + cellPadding;
      const width = stageColumnWidth - 2 * cellPadding;
      const y = yStart + cellPadding + slot * (pillHeight + pillGap);
      chips.push({ stageIndex: stageIdx, lawId, decorations, x, y, width, height: pillHeight });
      slot++;
    }
  }

  return { y: yStart, height: rowHeight, chips };
}

export function layoutProcessBlueprint(
  file: ProcessBlueprintFile,
  options?: ProcessBlueprintLayoutOptions,
): ProcessBlueprintLayout {
  const opts = resolveOptions(options);

  const pb = file.process_blueprint;

  // Filter stages by visibleStages if set
  const allStages = Array.isArray(pb?.stages) ? pb.stages : [];
  const stages = opts.visibleStages
    ? allStages.filter(s => s?.id != null && opts.visibleStages!.includes(s.id))
    : allStages;
  const stageIndexById = buildStageIndex(stages);

  // Row visibility from visibleRows
  const visRows = opts.visibleRows;
  const showGoal = !visRows || (visRows as string[]).includes('goal');
  const showResult = !visRows || (visRows as string[]).includes('result');
  const effectiveVisibleAspects: AspectCategory[] | undefined = visRows
    ? (ASPECT_CATEGORIES.filter(c => (visRows as string[]).includes(c)) as AspectCategory[])
    : opts.visibleAspects;
  const effectiveComplianceEnabled =
    opts.complianceLane?.enabled === true &&
    (!visRows || (visRows as string[]).includes('compliance'));

  // Stage headers
  const stageHeaders: StageHeaderCell[] = stages.map((s, i) => ({
    stageIndex: i,
    id: s?.id ?? '',
    name: s?.name ?? '',
    x: opts.legendColumnWidth + i * opts.stageColumnWidth,
    y: 0,
    width: opts.stageColumnWidth,
    height: opts.stageHeaderHeight,
  }));

  // Goal + result rows. Text is word-wrapped to the column width, and each row
  // grows to fit the tallest cell so nothing is clipped.
  const maxCharsPerLine = Math.max(
    4,
    Math.floor((opts.stageColumnWidth - 2 * opts.cellTextPadX) / opts.textCharWidth),
  );
  const wrap = (text: string): string[] => wrapText(text, maxCharsPerLine, opts.maxTextLines);
  const rowHeightFor = (lineCounts: number[], minHeight: number): number => {
    const maxLines = Math.max(1, ...lineCounts);
    return Math.max(minHeight, maxLines * opts.textLineHeight + 2 * opts.cellTextPadY);
  };

  const goalLines = stages.map(s => wrap(s?.goal ?? ''));
  const resultLines = stages.map(s => wrap(s?.result ?? ''));

  let cursorY = opts.stageHeaderHeight;
  let goalRowY = 0, goalRowHeight = 0;
  let resultRowY = 0, resultRowHeight = 0;
  const goalCells: StageTextCell[] = [];
  const resultCells: StageTextCell[] = [];

  if (showGoal) {
    goalRowY = cursorY;
    goalRowHeight = rowHeightFor(goalLines.map(l => l.length), opts.goalRowHeight);
    goalCells.push(...stages.map((s, i) => ({
      stageIndex: i, text: s?.goal ?? '', lines: goalLines[i],
      x: opts.legendColumnWidth + i * opts.stageColumnWidth, y: goalRowY,
      width: opts.stageColumnWidth, height: goalRowHeight,
    })));
    cursorY += goalRowHeight;
  }
  if (showResult) {
    resultRowY = cursorY;
    resultRowHeight = rowHeightFor(resultLines.map(l => l.length), opts.resultRowHeight);
    resultCells.push(...stages.map((s, i) => ({
      stageIndex: i, text: s?.result ?? '', lines: resultLines[i],
      x: opts.legendColumnWidth + i * opts.stageColumnWidth, y: resultRowY,
      width: opts.stageColumnWidth, height: resultRowHeight,
    })));
    cursorY += resultRowHeight;
  }
  const aspectsStartY = cursorY;

  // Aspect rows: only categories with at least one entry, in fixed order.
  // When effectiveVisibleAspects is set, skip categories not in the list.
  const aspectCategoriesToRender =
    effectiveVisibleAspects !== undefined
      ? ASPECT_CATEGORIES.filter(c => effectiveVisibleAspects.includes(c))
      : ASPECT_CATEGORIES;

  const aspectRows: AspectRow[] = [];
  let aspectCursorY = aspectsStartY;

  for (const category of aspectCategoriesToRender) {
    const arr = pb?.[category];
    if (!Array.isArray(arr) || arr.length === 0) continue;

    const rawPills: RawPill[] = [];
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (!entry || typeof entry !== 'object') continue;
      rawPills.push(...pillsForEntry(category, i, entry as AspectEntry, stageIndexById));
    }

    // If every entry in this category had no resolvable stage refs, drop the row.
    if (rawPills.length === 0) continue;

    const { slot, maxSlot } = packPillsIntoSlots(rawPills);
    const contentHeight = (maxSlot + 1) * (opts.pillHeight + opts.pillGap) - opts.pillGap;
    const rowHeight = Math.max(
      opts.aspectRowMinHeight,
      contentHeight + 2 * opts.cellPadding,
    );

    const pills: AspectPill[] = rawPills.map((p, i) => {
      const x = opts.legendColumnWidth + p.startStageIndex * opts.stageColumnWidth + opts.cellPadding;
      const width =
        (p.endStageIndex - p.startStageIndex + 1) * opts.stageColumnWidth - 2 * opts.cellPadding;
      const y = aspectCursorY + opts.cellPadding + slot[i] * (opts.pillHeight + opts.pillGap);
      const pillMaxChars = Math.max(4, Math.floor((width - 2 * opts.cellPadding) / opts.textCharWidth));
      const nameWrapped = wrapText(p.name, pillMaxChars, 2);
      // Show id as second line only when the name fits on one line; otherwise
      // use both lines for the name so it isn't truncated.
      const lines: string[] = p.id && nameWrapped.length <= 1
        ? [...nameWrapped, p.id].slice(0, 2)
        : nameWrapped;
      return {
        category: p.category,
        entryIndex: p.entryIndex,
        name: p.name,
        id: p.id,
        startStageIndex: p.startStageIndex,
        endStageIndex: p.endStageIndex,
        x,
        y,
        width,
        height: opts.pillHeight,
        lines,
      };
    });

    aspectRows.push({
      category,
      y: aspectCursorY,
      height: rowHeight,
      pills,
    });

    aspectCursorY += rowHeight;
  }

  // Compliance lane — derived from assertions/requirements, rendered after aspect rows.
  let complianceRow: import('./types.js').ComplianceRow | undefined;
  if (effectiveComplianceEnabled && opts.complianceInput) {
    complianceRow = deriveComplianceRow(
      stages,
      stageIndexById,
      opts.complianceInput,
      opts,
      aspectCursorY,
    );
    if (complianceRow) {
      aspectCursorY += complianceRow.height;
    }
  }

  // Legend (left column labels): one entry per row.
  const legend: LegendCell[] = [
    ...(showGoal ? [{ kind: 'goal' as const, label: 'Goal', y: goalRowY, height: goalRowHeight }] : []),
    ...(showResult ? [{ kind: 'result' as const, label: 'Result', y: resultRowY, height: resultRowHeight }] : []),
    ...aspectRows.map<LegendCell>(row => ({
      kind: 'aspect',
      category: row.category,
      label: ASPECT_LABEL[row.category],
      y: row.y,
      height: row.height,
    })),
    ...(complianceRow ? [{ kind: 'compliance' as const, label: 'Compliance', y: complianceRow.y, height: complianceRow.height }] : []),
  ];

  const totalWidth = opts.legendColumnWidth + stages.length * opts.stageColumnWidth;
  const totalHeight = aspectCursorY;

  return {
    bounds: { x: 0, y: 0, width: totalWidth, height: totalHeight },
    legendColumnWidth: opts.legendColumnWidth,
    stageColumnWidth: opts.stageColumnWidth,
    textLineHeight: opts.textLineHeight,
    cellTextPadX: opts.cellTextPadX,
    legend,
    stageHeaders,
    goalCells,
    resultCells,
    aspectRows,
    complianceRow,
  };
}
