import type {
  AspectCategory,
  AspectEntry,
  AspectPill,
  AspectRow,
  ProcessBlueprintLayoutOptions,
  LegendCell,
  ProcessBlueprintFile,
  ProcessBlueprintLayout,
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

const DEFAULTS: Required<ProcessBlueprintLayoutOptions> = {
  legendColumnWidth: 140,
  stageColumnWidth: 220,
  stageHeaderHeight: 40,
  goalRowHeight: 56,
  resultRowHeight: 56,
  aspectRowMinHeight: 60,
  pillHeight: 28,
  pillGap: 4,
  cellPadding: 8,
  textLineHeight: 15,
  textCharWidth: 6.2,
  cellTextPadX: 10,
  cellTextPadY: 10,
  maxTextLines: 6,
};

interface RawPill {
  category: AspectCategory;
  entryIndex: number;
  name: string;
  id?: string;
  startStageIndex: number;
  endStageIndex: number;
}

function resolveOptions(options: ProcessBlueprintLayoutOptions | undefined): Required<ProcessBlueprintLayoutOptions> {
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

export function layoutProcessBlueprint(
  file: ProcessBlueprintFile,
  options?: ProcessBlueprintLayoutOptions,
): ProcessBlueprintLayout {
  const opts = resolveOptions(options);

  const pb = file.process_blueprint;
  const stages = Array.isArray(pb?.stages) ? pb.stages : [];
  const stageIndexById = buildStageIndex(stages);

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

  const goalRowY = opts.stageHeaderHeight;
  const goalRowHeight = rowHeightFor(goalLines.map(l => l.length), opts.goalRowHeight);
  const resultRowY = goalRowY + goalRowHeight;
  const resultRowHeight = rowHeightFor(resultLines.map(l => l.length), opts.resultRowHeight);

  const goalCells: StageTextCell[] = stages.map((s, i) => ({
    stageIndex: i,
    text: s?.goal ?? '',
    lines: goalLines[i],
    x: opts.legendColumnWidth + i * opts.stageColumnWidth,
    y: goalRowY,
    width: opts.stageColumnWidth,
    height: goalRowHeight,
  }));

  const resultCells: StageTextCell[] = stages.map((s, i) => ({
    stageIndex: i,
    text: s?.result ?? '',
    lines: resultLines[i],
    x: opts.legendColumnWidth + i * opts.stageColumnWidth,
    y: resultRowY,
    width: opts.stageColumnWidth,
    height: resultRowHeight,
  }));

  const aspectsStartY = resultRowY + resultRowHeight;

  // Aspect rows: only categories with at least one entry, in fixed order.
  const aspectRows: AspectRow[] = [];
  let aspectCursorY = aspectsStartY;

  for (const category of ASPECT_CATEGORIES) {
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

  // Legend (left column labels): one entry per row.
  const legend: LegendCell[] = [
    { kind: 'goal', label: 'Goal', y: goalRowY, height: goalRowHeight },
    { kind: 'result', label: 'Result', y: resultRowY, height: resultRowHeight },
    ...aspectRows.map<LegendCell>(row => ({
      kind: 'aspect',
      category: row.category,
      label: ASPECT_LABEL[row.category],
      y: row.y,
      height: row.height,
    })),
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
  };
}
