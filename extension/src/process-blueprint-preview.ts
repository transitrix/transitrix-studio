import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';

// ── Inline types (mirror packages/diagrams/src/process-blueprint/types.ts) ───

type AspectCategory = 'systems' | 'actors' | 'equipment' | 'information_entities';

interface Stage {
  id: string;
  name: string;
  goal: string;
  result: string;
}

interface AspectEntry {
  id?: string;
  name: string;
  stages: string[];
}

interface ProcessBlueprintHeader {
  id: string;
  name: string;
  stages: Stage[];
  systems?: AspectEntry[];
  actors?: AspectEntry[];
  equipment?: AspectEntry[];
  information_entities?: AspectEntry[];
}

interface ProcessBlueprintFile {
  notation: string;
  spec_version?: string;
  process_blueprint: ProcessBlueprintHeader;
}

interface ValidationError { code: string; message: string; }
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: Array<{ code: string; message: string }>;
}

// ── Inline validation (mirrors packages/diagrams/src/process-blueprint/validate.ts) ─

const ID_GRAMMAR_RE = /^[A-Z][A-Z_]*(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const PROCESS_BLUEPRINT_ID_RE = /^PROCESS_BLUEPRINT(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const STAGE_ID_RE = /^STAGE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const APPLICATION_ID_RE = /^APPLICATION(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ROLE_ID_RE = /^ROLE(-[A-Z0-9][A-Z0-9_]*)*-\d+$/;
const ASPECT_CATEGORIES: AspectCategory[] = ['systems', 'actors', 'equipment', 'information_entities'];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateProcessBlueprint(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'BP-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;

  if ('notation' in raw && raw['notation'] !== 'process-blueprint') {
    errors.push({ code: 'BP-001', message: `notation must be "process-blueprint", got "${String(raw['notation'])}"` });
  }

  if (!('process_blueprint' in raw) || !raw['process_blueprint'] || typeof raw['process_blueprint'] !== 'object') {
    errors.push({ code: 'BP-001', message: 'Missing required root key: process_blueprint' });
    return { valid: false, errors, warnings };
  }
  const pb = raw['process_blueprint'] as Record<string, unknown>;

  if (!isNonEmptyString(pb['id'])) {
    errors.push({ code: 'BP-002', message: 'process_blueprint.id is required' });
  } else if (!PROCESS_BLUEPRINT_ID_RE.test(pb['id'])) {
    errors.push({ code: 'BP-002', message: `process_blueprint.id "${pb['id']}" must match PROCESS_BLUEPRINT-[<middle>-]<INTEGER>` });
  }
  if (!isNonEmptyString(pb['name'])) {
    errors.push({ code: 'BP-003', message: 'process_blueprint.name is required' });
  }

  const stagesRaw = pb['stages'];
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) {
    errors.push({ code: 'BP-004', message: 'process_blueprint.stages must be a non-empty array' });
    return { valid: false, errors, warnings };
  }

  const stageIds = new Set<string>();
  for (let i = 0; i < stagesRaw.length; i++) {
    const s = stagesRaw[i] as Record<string, unknown> | undefined;
    const p = `stages[${i}]`;
    if (!s || typeof s !== 'object') {
      errors.push({ code: 'BP-005', message: `${p} must be an object` });
      continue;
    }
    if (!isNonEmptyString(s['id'])) {
      errors.push({ code: 'BP-005', message: `${p}.id is required` });
    } else {
      const sid = s['id'];
      if (stageIds.has(sid)) errors.push({ code: 'BP-006', message: `Duplicate stage id: "${sid}"` });
      else stageIds.add(sid);
      if (!STAGE_ID_RE.test(sid)) errors.push({ code: 'BP-006', message: `${p}.id "${sid}" must match STAGE-[<middle>-]<INTEGER>` });
    }
    if (!isNonEmptyString(s['name'])) errors.push({ code: 'BP-005', message: `${p}.name is required` });
    if (!isNonEmptyString(s['goal'])) errors.push({ code: 'BP-005', message: `${p}.goal is required` });
    if (!isNonEmptyString(s['result'])) errors.push({ code: 'BP-005', message: `${p}.result is required` });
  }

  const usedStageIds = new Set<string>();
  for (const category of ASPECT_CATEGORIES) {
    const arr = pb[category];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      errors.push({ code: 'BP-007', message: `process_blueprint.${category} must be an array` });
      continue;
    }
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i] as Record<string, unknown> | undefined;
      const p = `${category}[${i}]`;
      if (!e || typeof e !== 'object') { errors.push({ code: 'BP-007', message: `${p} must be an object` }); continue; }
      if (!isNonEmptyString(e['name'])) errors.push({ code: 'BP-007', message: `${p}.name is required` });
      const entryStages = e['stages'];
      if (!Array.isArray(entryStages) || entryStages.length === 0) {
        errors.push({ code: 'BP-007', message: `${p}.stages must be a non-empty array of STAGE-… ids` });
      } else {
        for (let j = 0; j < entryStages.length; j++) {
          const ref = entryStages[j];
          if (typeof ref !== 'string') { errors.push({ code: 'BP-008', message: `${p}.stages[${j}] must be a string` }); continue; }
          if (!stageIds.has(ref)) errors.push({ code: 'BP-008', message: `${p}.stages[${j}] references undeclared stage "${ref}"` });
          else usedStageIds.add(ref);
        }
        if (entryStages.length === 1) {
          warnings.push({ code: 'BP-012', message: `${p}.stages references a single stage — entry may be a candidate for inlining` });
        }
      }
      const entryId = e['id'];
      if (entryId !== undefined) {
        if (typeof entryId !== 'string') errors.push({ code: 'BP-009', message: `${p}.id must be a string` });
        else if (!ID_GRAMMAR_RE.test(entryId)) errors.push({ code: 'BP-009', message: `${p}.id "${entryId}" must match <TYPE>-[<middle>-]<INTEGER>` });
        else if (category === 'systems' && !APPLICATION_ID_RE.test(entryId)) errors.push({ code: 'BP-010', message: `${p}.id "${entryId}" must use the APPLICATION- prefix` });
        else if (category === 'actors' && !ROLE_ID_RE.test(entryId)) errors.push({ code: 'BP-010', message: `${p}.id "${entryId}" must use the ROLE- prefix` });
      }
    }
  }

  for (const sid of stageIds) {
    if (!usedStageIds.has(sid)) {
      warnings.push({ code: 'BP-011', message: `Stage "${sid}" has no aspect entries pointing at it — structurally empty` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Inline layout (mirrors packages/diagrams/src/process-blueprint/layout.ts) ─

interface RawPill {
  category: AspectCategory;
  name: string;
  id?: string;
  startStageIndex: number;
  endStageIndex: number;
}

interface AspectPill extends RawPill {
  x: number; y: number; width: number; height: number;
}

interface AspectRow {
  category: AspectCategory;
  y: number;
  height: number;
  pills: AspectPill[];
}

interface StageCell { stageIndex: number; x: number; y: number; width: number; height: number; }
interface StageHeader extends StageCell { id: string; name: string; }
interface StageText extends StageCell { text: string; }
interface LegendCell { label: string; y: number; height: number; }

interface PBLayout {
  bounds: { x: number; y: number; width: number; height: number };
  legendColumnWidth: number;
  stageColumnWidth: number;
  legend: LegendCell[];
  stageHeaders: StageHeader[];
  goalCells: StageText[];
  resultCells: StageText[];
  aspectRows: AspectRow[];
}

const LEGEND_W = 140;
const STAGE_W = 220;
const HEADER_H = 40;
const GOAL_H = 56;
const RESULT_H = 56;
const ASPECT_MIN_H = 60;
const PILL_H = 28;
const PILL_GAP = 4;
const PAD = 8;

const ASPECT_LABEL: Record<AspectCategory, string> = {
  systems: 'Systems',
  actors: 'Actors',
  equipment: 'Equipment',
  information_entities: 'Information',
};

function pillsForEntry(category: AspectCategory, entry: AspectEntry, stageIndexById: Map<string, number>): RawPill[] {
  if (!Array.isArray(entry.stages)) return [];
  const idxs: number[] = [];
  const seen = new Set<number>();
  for (const ref of entry.stages) {
    if (typeof ref !== 'string') continue;
    const i = stageIndexById.get(ref);
    if (i === undefined || seen.has(i)) continue;
    seen.add(i);
    idxs.push(i);
  }
  idxs.sort((a, b) => a - b);
  const out: RawPill[] = [];
  let s: number | null = null, e: number | null = null;
  for (const i of idxs) {
    if (s === null || e === null) { s = i; e = i; continue; }
    if (i === e + 1) { e = i; } else {
      out.push({ category, name: entry.name, id: entry.id, startStageIndex: s, endStageIndex: e });
      s = i; e = i;
    }
  }
  if (s !== null && e !== null) {
    out.push({ category, name: entry.name, id: entry.id, startStageIndex: s, endStageIndex: e });
  }
  return out;
}

function packIntoSlots(pills: RawPill[]): { slot: number[]; maxSlot: number } {
  const order = pills.map((_, i) => i).sort((a, b) => pills[a].startStageIndex - pills[b].startStageIndex || pills[a].endStageIndex - pills[b].endStageIndex);
  const slotEnd: number[] = [];
  const slot = new Array<number>(pills.length).fill(0);
  let maxSlot = 0;
  for (const i of order) {
    const p = pills[i];
    let placed = false;
    for (let s = 0; s < slotEnd.length; s++) {
      if (slotEnd[s] < p.startStageIndex) { slot[i] = s; slotEnd[s] = p.endStageIndex; placed = true; break; }
    }
    if (!placed) { slot[i] = slotEnd.length; slotEnd.push(p.endStageIndex); }
    if (slot[i] > maxSlot) maxSlot = slot[i];
  }
  return { slot, maxSlot };
}

function layoutProcessBlueprint(file: ProcessBlueprintFile): PBLayout {
  const pb = file.process_blueprint;
  const stages = Array.isArray(pb?.stages) ? pb.stages : [];
  const stageIndexById = new Map<string, number>();
  for (let i = 0; i < stages.length; i++) {
    const sid = stages[i]?.id;
    if (typeof sid === 'string' && sid.length > 0 && !stageIndexById.has(sid)) stageIndexById.set(sid, i);
  }

  const stageHeaders: StageHeader[] = stages.map((s, i) => ({
    stageIndex: i, id: s?.id ?? '', name: s?.name ?? '',
    x: LEGEND_W + i * STAGE_W, y: 0, width: STAGE_W, height: HEADER_H,
  }));
  const goalRowY = HEADER_H;
  const resultRowY = goalRowY + GOAL_H;
  const goalCells: StageText[] = stages.map((s, i) => ({
    stageIndex: i, text: s?.goal ?? '',
    x: LEGEND_W + i * STAGE_W, y: goalRowY, width: STAGE_W, height: GOAL_H,
  }));
  const resultCells: StageText[] = stages.map((s, i) => ({
    stageIndex: i, text: s?.result ?? '',
    x: LEGEND_W + i * STAGE_W, y: resultRowY, width: STAGE_W, height: RESULT_H,
  }));

  let cursorY = resultRowY + RESULT_H;
  const aspectRows: AspectRow[] = [];
  for (const category of ASPECT_CATEGORIES) {
    const arr = pb?.[category];
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const raw: RawPill[] = [];
    for (const e of arr) {
      if (!e || typeof e !== 'object') continue;
      raw.push(...pillsForEntry(category, e as AspectEntry, stageIndexById));
    }
    if (raw.length === 0) continue;
    const { slot, maxSlot } = packIntoSlots(raw);
    const contentH = (maxSlot + 1) * (PILL_H + PILL_GAP) - PILL_GAP;
    const rowH = Math.max(ASPECT_MIN_H, contentH + 2 * PAD);
    const pills: AspectPill[] = raw.map((p, i) => ({
      ...p,
      x: LEGEND_W + p.startStageIndex * STAGE_W + PAD,
      width: (p.endStageIndex - p.startStageIndex + 1) * STAGE_W - 2 * PAD,
      y: cursorY + PAD + slot[i] * (PILL_H + PILL_GAP),
      height: PILL_H,
    }));
    aspectRows.push({ category, y: cursorY, height: rowH, pills });
    cursorY += rowH;
  }

  const legend: LegendCell[] = [
    { label: 'Goal', y: goalRowY, height: GOAL_H },
    { label: 'Result', y: resultRowY, height: RESULT_H },
    ...aspectRows.map(r => ({ label: ASPECT_LABEL[r.category], y: r.y, height: r.height })),
  ];

  return {
    bounds: { x: 0, y: 0, width: LEGEND_W + stages.length * STAGE_W, height: cursorY },
    legendColumnWidth: LEGEND_W,
    stageColumnWidth: STAGE_W,
    legend, stageHeaders, goalCells, resultCells, aspectRows,
  };
}

// ── SVG renderer ─────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}

function layoutToSvg(layout: PBLayout): string {
  const pad = 24;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2;
  const ox = pad;
  const oy = pad;

  const parts: string[] = [];

  // Outer container
  parts.push(`<rect class="diagram-node level-0" x="${ox}" y="${oy}" width="${layout.bounds.width}" height="${layout.bounds.height}" rx="6"/>`);

  // Stage headers
  for (const s of layout.stageHeaders) {
    parts.push(`<rect class="diagram-node level-1" x="${s.x + ox}" y="${s.y + oy}" width="${s.width}" height="${s.height}"/>`);
    parts.push(`<text class="text-primary" x="${s.x + ox + s.width / 2}" y="${s.y + oy + s.height / 2 + 4}" text-anchor="middle" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escXml(wrapText(s.name, 28))}</text>`);
  }

  // Legend column labels
  for (const l of layout.legend) {
    parts.push(`<rect class="diagram-node level-2" x="${ox}" y="${l.y + oy}" width="${layout.legendColumnWidth}" height="${l.height}"/>`);
    parts.push(`<text class="text-secondary" x="${ox + 12}" y="${l.y + oy + l.height / 2 + 4}" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${escXml(l.label)}</text>`);
  }

  // Goal + result cells
  for (const c of layout.goalCells) {
    parts.push(`<rect class="diagram-node level-3" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`);
    parts.push(`<text class="text-primary" x="${c.x + ox + 10}" y="${c.y + oy + 22}" font-size="12" font-family="system-ui,sans-serif">${escXml(wrapText(c.text, 32))}</text>`);
  }
  for (const c of layout.resultCells) {
    parts.push(`<rect class="diagram-node level-4" x="${c.x + ox}" y="${c.y + oy}" width="${c.width}" height="${c.height}"/>`);
    parts.push(`<text class="text-primary" x="${c.x + ox + 10}" y="${c.y + oy + 22}" font-size="12" font-family="system-ui,sans-serif">${escXml(wrapText(c.text, 32))}</text>`);
  }

  // Aspect rows + pills
  for (let r = 0; r < layout.aspectRows.length; r++) {
    const row = layout.aspectRows[r];
    const level = 5 + (r % 3);
    // Row backdrop spanning all stage columns
    parts.push(`<rect class="diagram-node level-${level}" x="${layout.legendColumnWidth + ox}" y="${row.y + oy}" width="${layout.bounds.width - layout.legendColumnWidth}" height="${row.height}" opacity="0.15"/>`);
    // Column dividers
    for (let i = 1; i < layout.stageHeaders.length; i++) {
      const x = layout.legendColumnWidth + i * layout.stageColumnWidth + ox;
      parts.push(`<line class="diagram-edge" x1="${x}" y1="${row.y + oy}" x2="${x}" y2="${row.y + row.height + oy}" opacity="0.3"/>`);
    }
    for (const p of row.pills) {
      parts.push(`<rect class="diagram-node level-${level}" x="${p.x + ox}" y="${p.y + oy}" width="${p.width}" height="${p.height}" rx="6"/>`);
      const label = p.id ? `${p.name} · ${p.id}` : p.name;
      parts.push(`<text class="text-primary" x="${p.x + ox + p.width / 2}" y="${p.y + oy + p.height / 2 + 4}" text-anchor="middle" font-size="11" font-weight="500" font-family="system-ui,sans-serif">${escXml(wrapText(label, Math.floor(p.width / 8)))}</text>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${parts.join('\n')}
</svg>`;
}

// ── ProcessBlueprintPreview webview class ────────────────────────────────────

export class ProcessBlueprintPreview {
  readonly panelTitle = 'Process Blueprint Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;
  private lastSvg = '';

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();
    if (this.panel) {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        'processBlueprintPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.isShowingDocument(doc.uri)) return;
    await this.pushDocument(doc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName));
  }

  private buildHtml(yamlText: string, filename: string): string {
    let svgContent = '';
    let errorMsg = '';
    let warnings: string[] = [];

    try {
      const parsed = yaml.load(yamlText) as unknown;
      const v = validateProcessBlueprint(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const file = parsed as ProcessBlueprintFile;
        const layout = layoutProcessBlueprint(file);
        svgContent = layoutToSvg(layout);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'Process Blueprint', svgContent, errorMsg, warnings, themeId });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.process-blueprint.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.process-blueprint\.transitrix\.yaml$/, '')
      : 'diagram';
    const defaultUri = sourceUri
      ? vscode.Uri.file(path.join(path.dirname(sourceUri.fsPath), `${stem}.svg`))
      : vscode.Uri.file(`${stem}.svg`);
    const target = await vscode.window.showSaveDialog({ defaultUri, filters: { 'SVG Image': ['svg'] } });
    if (!target) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const svg = prepareSvgForExport(this.lastSvg, themeId);
    await vscode.workspace.fs.writeFile(target, Buffer.from(svg, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }
}
