import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';
import { TITLE_BLOCK_H, titleBlockSvg, todayIso } from './svg-title-block.js';

// ── Inline types ──────────────────────────────────────────────────────────────
//
// FGCA (spec: notations/02-fgca.md) — flat arrays at top level; spec and
// example are consistent.
//
// FGA (spec: notations/03-fga.md v0.1) — nested root key `fga:`:
//   fga:
//     id: "FGA-..."
//     factors:
//       - id: "FACTOR-..." name: "..." type: external|internal
//         goals:
//           - id: "GOAL-..." name: "..."
//             activities:
//               - id: "ACT-..." name: "..."

interface FactorItem { id: number | string; name: string; }
interface GoalItem { id: number | string; name: string; level?: number; factor?: Array<{ id: number | string }>; }
interface ChangeItem { id: number | string; name: string; goal_id: number | string; activity_ids: Array<number | string>; }
interface ActivityItem { id: number | string; name: string; goal_id?: number | string | null; }

interface FGCADoc {
  notation: string;
  factors: FactorItem[];
  goals: GoalItem[];
  changes?: ChangeItem[];
  activities: ActivityItem[];
}

// Canonical FGA nested types (spec v0.1)
interface FGAActivityItem { id: string; name: string; owner?: string; status?: string; due_date?: string; }
interface FGAGoalItem    { id: string; name: string; activities: FGAActivityItem[]; }
interface FGAFactorItem  { id: string; name: string; type: 'external' | 'internal'; goals: FGAGoalItem[]; }
interface FGARoot        { id: string; name: string; description?: string; period?: string; factors: FGAFactorItem[]; }
interface FGADoc         { notation: string; fga: FGARoot; }

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }>; }

// ── Inline validation ─────────────────────────────────────────────────────────

function validateFGCA(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if (raw.notation === undefined) {
    errors.push({ code: 'MISSING_NOTATION', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'fgca') {
    errors.push({ code: 'WRONG_NOTATION', message: `notation must be "fgca", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }

  if (!Array.isArray(raw.factors)) errors.push({ code: 'SCHEMA_INVALID', message: 'factors must be an array' });
  if (!Array.isArray(raw.goals)) errors.push({ code: 'SCHEMA_INVALID', message: 'goals must be an array' });
  if (!Array.isArray(raw.changes)) errors.push({ code: 'SCHEMA_INVALID', message: 'changes must be an array' });
  if (!Array.isArray(raw.activities)) errors.push({ code: 'SCHEMA_INVALID', message: 'activities must be an array' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  const doc = raw as unknown as FGCADoc;
  const factorIds = new Set(doc.factors.map(f => f.id));
  const goalIds = new Set(doc.goals.map(g => g.id));
  const activityIds = new Set(doc.activities.map(a => a.id));

  for (const g of doc.goals) {
    for (const f of (g.factor ?? [])) {
      if (!factorIds.has(f.id)) {
        warnings.push({ code: 'BROKEN_REF', message: `Goal ${g.id} references missing factor ${f.id}` });
      }
    }
  }
  for (const c of (doc.changes ?? [])) {
    if (!goalIds.has(c.goal_id)) {
      warnings.push({ code: 'BROKEN_REF', message: `Change ${c.id} references missing goal ${c.goal_id}` });
    }
    for (const aid of (c.activity_ids ?? [])) {
      if (!activityIds.has(aid)) {
        warnings.push({ code: 'BROKEN_REF', message: `Change ${c.id} references missing activity ${aid}` });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

function validateFGA(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if (raw.notation === undefined) {
    errors.push({ code: 'MISSING_NOTATION', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'fga') {
    errors.push({ code: 'WRONG_NOTATION', message: `notation must be "fga", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }

  if (!raw.fga || typeof raw.fga !== 'object') {
    errors.push({ code: 'MISSING_ROOT', message: 'fga root key is required' });
    return { valid: false, errors, warnings };
  }

  const fga = raw.fga as Record<string, unknown>;
  if (!Array.isArray(fga.factors)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'fga.factors must be an array' });
    return { valid: false, errors, warnings };
  }

  for (const factor of fga.factors as Array<Record<string, unknown>>) {
    if (!factor.id || !factor.name) {
      errors.push({ code: 'SCHEMA_INVALID', message: `Factor missing required id or name` });
    }
    if (!factor.type) {
      warnings.push({ code: 'MISSING_FIELD', message: `Factor "${factor.id}" missing type (expected "external" or "internal")` });
    }
    if (!Array.isArray(factor.goals)) {
      errors.push({ code: 'SCHEMA_INVALID', message: `Factor "${factor.id}" goals must be an array` });
      continue;
    }
    for (const goal of factor.goals as Array<Record<string, unknown>>) {
      if (!goal.id || !goal.name) {
        errors.push({ code: 'SCHEMA_INVALID', message: `Goal missing required id or name under factor "${factor.id}"` });
      }
      if (!Array.isArray(goal.activities)) {
        errors.push({ code: 'SCHEMA_INVALID', message: `Goal "${goal.id}" activities must be an array` });
        continue;
      }
      for (const act of goal.activities as Array<Record<string, unknown>>) {
        if (!act.id || !act.name) {
          errors.push({ code: 'SCHEMA_INVALID', message: `Activity missing required id or name under goal "${goal.id}"` });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// Convert canonical nested FGA → flat FGCADoc for the existing layout engine
function fgaToFlat(doc: FGADoc): FGCADoc {
  const factors: FactorItem[] = [];
  const goals: GoalItem[] = [];
  const activities: ActivityItem[] = [];

  const goalSeen = new Set<string>();

  for (const factor of doc.fga.factors) {
    factors.push({ id: factor.id, name: factor.name });
    for (const goal of factor.goals) {
      if (!goalSeen.has(goal.id)) {
        goals.push({ id: goal.id, name: goal.name, factor: [{ id: factor.id }] });
        goalSeen.add(goal.id);
      } else {
        // Goal appears under multiple factors — add factor reference
        const existing = goals.find(g => g.id === goal.id);
        if (existing) existing.factor = [...(existing.factor ?? []), { id: factor.id }];
      }
      for (const act of goal.activities) {
        activities.push({ id: act.id, name: act.name, goal_id: goal.id });
      }
    }
  }

  return { notation: 'fga', factors, goals, activities };
}

// ── Inline layout ─────────────────────────────────────────────────────────────

const NODE_W = 220;
const NODE_H = 72;
const COL_GAP = 160;
const ROW_GAP = 20;
const HEADER_H = 32;
const PAD = 20;
const COL_STRIDE = NODE_W + COL_GAP;

const COL_LABELS: Record<string, string> = {
  factor: 'Factors (F)',
  goal: 'Goals (G)',
  change: 'Changes (C)',
  activity: 'Activities (A)',
};

interface LayoutNode { id: string; x: number; y: number; label: string; col: string; }
interface LayoutEdge { sx: number; sy: number; tx: number; ty: number; }

function layoutFGCA(doc: FGCADoc, hideChanges = false): { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  const cols = hideChanges
    ? (['factor', 'goal', 'activity'] as const)
    : (['factor', 'goal', 'change', 'activity'] as const);
  const changes = doc.changes ?? [];
  const colItems: Record<string, Array<{ id: string; label: string }>> = {
    factor:   doc.factors.map(f => ({ id: `factor_${f.id}`,   label: f.name })),
    goal:     doc.goals.map(g   => ({ id: `goal_${g.id}`,     label: g.name })),
    change:   changes.map(c => ({ id: `change_${c.id}`,   label: c.name })),
    activity: doc.activities.map(a => ({ id: `activity_${a.id}`, label: a.name })),
  };

  const nodeMap = new Map<string, LayoutNode>();
  const nodes: LayoutNode[] = [];

  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci];
    const x = PAD + ci * COL_STRIDE;
    let y = PAD + HEADER_H + ROW_GAP;
    for (const item of colItems[col]) {
      const node: LayoutNode = { id: item.id, x, y, label: item.label, col };
      nodes.push(node);
      nodeMap.set(item.id, node);
      y += NODE_H + ROW_GAP;
    }
  }

  const edges: LayoutEdge[] = [];

  function addEdge(sourceId: string, targetId: string): void {
    const s = nodeMap.get(sourceId);
    const t = nodeMap.get(targetId);
    if (!s || !t) return;
    edges.push({ sx: s.x + NODE_W, sy: s.y + NODE_H / 2, tx: t.x, ty: t.y + NODE_H / 2 });
  }

  for (const g of doc.goals) {
    for (const f of (g.factor ?? [])) addEdge(`factor_${f.id}`, `goal_${g.id}`);
  }
  if (hideChanges) {
    const connectedViaChange = new Set<number | string>();
    for (const c of changes) {
      for (const aid of c.activity_ids) {
        addEdge(`goal_${c.goal_id}`, `activity_${aid}`);
        connectedViaChange.add(aid);
      }
    }
    for (const a of doc.activities) {
      if (a.goal_id != null && !connectedViaChange.has(a.id)) {
        addEdge(`goal_${a.goal_id}`, `activity_${a.id}`);
      }
    }
  } else {
    for (const c of changes) addEdge(`goal_${c.goal_id}`, `change_${c.id}`);
    for (const c of changes) for (const aid of c.activity_ids) addEdge(`change_${c.id}`, `activity_${aid}`);
    const coveredActivities = new Set(changes.flatMap(c => c.activity_ids));
    for (const a of doc.activities) {
      if (a.goal_id != null && !coveredActivities.has(a.id)) {
        addEdge(`goal_${a.goal_id}`, `activity_${a.id}`);
      }
    }
  }

  const maxNodeBottom = nodes.reduce((m, n) => Math.max(m, n.y + NODE_H), PAD + HEADER_H + ROW_GAP + NODE_H);
  const width = PAD * 2 + cols.length * COL_STRIDE - COL_GAP;
  const height = maxNodeBottom + PAD;

  return { nodes, edges, width, height };
}

// ── SVG renderer ──────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildSvg(doc: FGCADoc, hideChanges = false, heading?: string, filename?: string, date?: string): string {
  const { nodes, edges, width, height } = layoutFGCA(doc, hideChanges);
  const showTitle = heading != null && filename != null && date != null;
  const titleH = showTitle ? TITLE_BLOCK_H : 0;
  const cols = hideChanges
    ? (['factor', 'goal', 'activity'] as const)
    : (['factor', 'goal', 'change', 'activity'] as const);

  const headerSvg = cols.map((col, ci) => {
    const x = PAD + ci * COL_STRIDE;
    return [
      `<rect class="diagram-node layer-${col}" x="${x}" y="${PAD}" width="${NODE_W}" height="${HEADER_H}" rx="6"/>`,
      `<text class="text-header" x="${x + NODE_W / 2}" y="${PAD + HEADER_H / 2}" text-anchor="middle" dominant-baseline="central">${escXml(COL_LABELS[col])}</text>`,
    ].join('\n');
  }).join('\n');

  // Cubic bezier with horizontal control handles that grow with both spans —
  // the curve stays visibly horizontal long enough at each endpoint for the
  // marker-end arrowhead to sit flush against the line and read as
  // perpendicular to the node's vertical edge.
  const EDGE_MIN_HANDLE = 64;
  const edgeSvg = edges.map(e => {
    const dx = e.tx - e.sx;
    const dy = e.ty - e.sy;
    const handle = Math.max(EDGE_MIN_HANDLE, Math.abs(dx) * 0.5, Math.abs(dy) * 0.8);
    return `<path d="M${e.sx},${e.sy} C${e.sx + handle},${e.sy} ${e.tx - handle},${e.ty} ${e.tx},${e.ty}" class="diagram-edge" marker-end="url(#arrow)"/>`;
  }).join('\n');

  const nodeSvg = nodes.map(n => {
    const words = n.label.split(' ');
    let line1 = '';
    let line2 = '';
    for (const w of words) {
      if ((line1 + ' ' + w).trim().length <= 26) {
        line1 = (line1 + ' ' + w).trim();
      } else if ((line2 + ' ' + w).trim().length <= 26) {
        line2 = (line2 + ' ' + w).trim();
      } else if (!line2) {
        line2 = w.slice(0, 24) + '…';
        break;
      }
    }
    const twoLines = line2.length > 0;
    const y1 = twoLines ? n.y + NODE_H / 2 - 8 : n.y + NODE_H / 2 + 5;
    const y2 = y1 + 18;
    return [
      `<rect class="diagram-node layer-${n.col}" x="${n.x}" y="${n.y}" width="${NODE_W}" height="${NODE_H}" rx="8"/>`,
      `<text class="text-primary" x="${n.x + NODE_W / 2}" y="${y1}" text-anchor="middle">${escXml(line1)}</text>`,
      twoLines ? `<text class="text-secondary" x="${n.x + NODE_W / 2}" y="${y2}" text-anchor="middle">${escXml(line2)}</text>` : '',
    ].filter(Boolean).join('\n');
  }).join('\n');

  const totalH = height + titleH;
  const titleSvg = showTitle ? titleBlockSvg(heading!, filename!, date!, PAD, PAD) : '';
  // The layoutFGCA coordinates are absolute; wrap the diagram in a translate
  // group so the title block can sit above without rewriting every node/edge.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH}" viewBox="0 0 ${width} ${totalH}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="8" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${titleSvg}
<g transform="translate(0, ${titleH})">
${headerSvg}
${nodeSvg}
${edgeSvg}
</g>
</svg>`;
}

// ── FGCAPreview webview class ─────────────────────────────────────────────────

export class FGCAPreview {
  readonly panelTitle = 'FGCA Preview';
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
        'fgcaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveFGCAAsSvg'] },
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
      const v = validateFGCA(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        svgContent = buildSvg(parsed as FGCADoc, false, 'FGCA — Factor → Goal → Change → Activity', filename, todayIso());
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'FGCA', svgContent, errorMsg, warnings, themeId, saveSvgCommand: 'transitrixStudio.saveFGCAAsSvg' });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.fgca.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.fgca\.transitrix\.yaml$/, '')
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

// ── FGAPreview webview class ──────────────────────────────────────────────────

export class FGAPreview {
  readonly panelTitle = 'FGA Preview';
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
        'fgaPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: ['transitrixStudio.saveFGAAsSvg'] },
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
      const v = validateFGA(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const flat = fgaToFlat(parsed as FGADoc);
        svgContent = buildSvg(flat, true, 'FGA — Factor → Goal → Activity', filename, todayIso());
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'FGA', svgContent, errorMsg, warnings, themeId, saveSvgCommand: 'transitrixStudio.saveFGAAsSvg' });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.fga.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.fga\.transitrix\.yaml$/, '')
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
