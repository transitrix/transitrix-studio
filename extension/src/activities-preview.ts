import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, type ThemeId } from './diagram-frame.js';

// ── Inline types (mirror packages/diagrams/src/activities/types.ts) ───────────

interface Activity {
  id: string;
  name: string;
  duration?: number;
  predecessors?: string[];
  goals?: string[];
  sort?: number;
  tags?: string[];
  owner?: string;
  unit?: string;
}

interface ActivityDoc {
  notation: string;
  title?: string;
  description?: string;
  version?: string;
  date?: string;
  author?: string;
  activities: Activity[];
}

interface CpmValues {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  slack: number;
  isCritical: boolean;
}

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation ─────────────────────────────────────────────────────────

function validateActivities(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'ACT-001', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if (raw.notation === undefined) {
    errors.push({ code: 'ACT-001', message: 'notation field is required' });
    return { valid: false, errors, warnings };
  }
  if (raw.notation !== 'activities') {
    errors.push({ code: 'ACT-001', message: `notation must be "activities", got "${String(raw.notation)}"` });
    return { valid: false, errors, warnings };
  }
  if (!Array.isArray(raw.activities)) {
    errors.push({ code: 'SCHEMA_INVALID', message: 'activities must be an array' });
    return { valid: false, errors, warnings };
  }

  const doc = raw as unknown as ActivityDoc;
  const idSet = new Set<string>();

  for (let i = 0; i < doc.activities.length; i++) {
    const a = doc.activities[i] as unknown as Record<string, unknown>;
    if (!a.id || typeof a.id !== 'string') {
      errors.push({ code: 'ACT-002', message: `Activity at index ${i} is missing a non-empty id` });
      continue;
    }
    if (!a.name || typeof a.name !== 'string') {
      errors.push({ code: 'ACT-003', message: `Activity "${a.id}" is missing a non-empty name` });
    }
    if (idSet.has(a.id)) {
      errors.push({ code: 'ACT-004', message: `Duplicate activity id: "${a.id}"` });
    } else {
      idSet.add(a.id);
    }
    if ('goal' in a || 'predecessor' in a || 'tag' in a) {
      errors.push({ code: 'ACT-010', message: `Use plural array form (goals/predecessors/tags) for activity "${a.id}"` });
    }
  }

  if (errors.length > 0) return { valid: false, errors, warnings };

  for (const a of doc.activities) {
    for (const pred of (a.predecessors ?? [])) {
      if (!idSet.has(pred)) {
        errors.push({ code: 'ACT-005', message: `Activity "${a.id}" references unknown predecessor "${pred}"` });
      }
    }
    if (Array.isArray(a.predecessors) && a.predecessors.includes(a.id)) {
      errors.push({ code: 'ACT-007', message: `Activity "${a.id}" lists itself as a predecessor` });
    }
    if (a.duration === undefined) {
      warnings.push({ code: 'ACT-011', message: `Activity "${a.id}" has no duration — excluded from CPM` });
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── CPM computation ───────────────────────────────────────────────────────────

function computeCpm(activities: Activity[]): Map<string, CpmValues> {
  const result = new Map<string, CpmValues>();
  if (activities.length === 0) return result;

  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const a of activities) {
    successors.set(a.id, []);
    predecessors.set(a.id, (a.predecessors ?? []).filter(p => p !== a.id));
  }
  for (const a of activities) {
    for (const pred of (predecessors.get(a.id) ?? [])) {
      successors.get(pred)?.push(a.id);
    }
  }

  const inDegree = new Map<string, number>();
  for (const a of activities) inDegree.set(a.id, (predecessors.get(a.id) ?? []).length);
  const queue: string[] = [];
  for (const a of activities) { if ((inDegree.get(a.id) ?? 0) === 0) queue.push(a.id); }
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const succ of (successors.get(id) ?? [])) {
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  const actById = new Map(activities.map(a => [a.id, a]));
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of topoOrder) {
    const a = actById.get(id)!;
    const dur = a.duration ?? 0;
    const maxPredEf = Math.max(0, ...(predecessors.get(id) ?? []).map(p => ef.get(p) ?? 0));
    es.set(id, maxPredEf);
    ef.set(id, maxPredEf + dur);
  }

  const projectFinish = Math.max(0, ...[...ef.values()]);
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const a = actById.get(id)!;
    const dur = a.duration ?? 0;
    const succs = successors.get(id) ?? [];
    const minSuccLs = succs.length === 0 ? projectFinish : Math.min(...succs.map(s => ls.get(s) ?? projectFinish));
    lf.set(id, minSuccLs);
    ls.set(id, minSuccLs - dur);
  }

  for (const id of topoOrder) {
    const esV = es.get(id) ?? 0;
    const efV = ef.get(id) ?? 0;
    const lsV = ls.get(id) ?? 0;
    const lfV = lf.get(id) ?? 0;
    const slack = lsV - esV;
    result.set(id, { es: esV, ef: efV, ls: lsV, lf: lfV, slack, isCritical: slack <= 0 });
  }
  return result;
}

// ── Layout ────────────────────────────────────────────────────────────────────

const NODE_W = 200;
const NODE_H = 80;
const H_GAP = 80;
const V_GAP = 24;

interface LayoutNode { id: string; x: number; y: number; data: Activity; cpm?: CpmValues; }
interface LayoutEdge { sourceId: string; targetId: string; isCritical: boolean; }
interface Layout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number; }

function layoutActivities(doc: ActivityDoc): Layout {
  const activities = doc.activities;
  if (activities.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

  const cpm = computeCpm(activities);

  const successors = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  for (const a of activities) { successors.set(a.id, []); inDegree.set(a.id, 0); }
  for (const a of activities) {
    for (const pred of (a.predecessors ?? [])) {
      successors.get(pred)?.push(a.id);
      inDegree.set(a.id, (inDegree.get(a.id) ?? 0) + 1);
    }
  }

  const column = new Map<string, number>();
  const queue: string[] = [];
  for (const a of activities) { if ((inDegree.get(a.id) ?? 0) === 0) queue.push(a.id); }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const col = column.get(id) ?? 0;
    for (const succ of (successors.get(id) ?? [])) {
      column.set(succ, Math.max(column.get(succ) ?? 0, col + 1));
      const newDeg = (inDegree.get(succ) ?? 1) - 1;
      inDegree.set(succ, newDeg);
      if (newDeg === 0) queue.push(succ);
    }
  }

  const cols = new Map<number, Activity[]>();
  for (const a of activities) {
    const col = column.get(a.id) ?? 0;
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col)!.push(a);
  }
  for (const list of cols.values()) {
    list.sort((a, b) => {
      const sa = a.sort ?? Number.MAX_SAFE_INTEGER;
      const sb = b.sort ?? Number.MAX_SAFE_INTEGER;
      return sa !== sb ? sa - sb : a.id.localeCompare(b.id);
    });
  }

  const nodes: LayoutNode[] = [];
  const nodeMap = new Map<string, LayoutNode>();
  const colCount = Math.max(0, ...[...cols.keys()]) + 1;
  let maxH = 0;

  for (let c = 0; c < colCount; c++) {
    const list = cols.get(c) ?? [];
    const x = c * (NODE_W + H_GAP);
    let y = 0;
    for (const a of list) {
      const node: LayoutNode = { id: a.id, x, y, data: a, cpm: cpm.get(a.id) };
      nodes.push(node);
      nodeMap.set(a.id, node);
      y += NODE_H + V_GAP;
    }
    maxH = Math.max(maxH, y - V_GAP + NODE_H);
  }

  const edges: LayoutEdge[] = [];
  for (const a of activities) {
    for (const predId of (a.predecessors ?? [])) {
      if (nodeMap.has(predId)) {
        const predCpm = cpm.get(predId);
        const succCpm = cpm.get(a.id);
        const isCritical = (predCpm?.isCritical ?? false) && (succCpm?.isCritical ?? false);
        edges.push({ sourceId: predId, targetId: a.id, isCritical });
      }
    }
  }

  const totalW = colCount * (NODE_W + H_GAP) - H_GAP;
  return { nodes, edges, width: totalW, height: maxH };
}

// ── SVG renderer ──────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

function buildSvg(doc: ActivityDoc): string {
  const { nodes, edges, width, height } = layoutActivities(doc);
  if (nodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="10" y="40" font-family="system-ui,sans-serif" font-size="13">No activities</text></svg>';

  const PAD = 24;
  const W = width + PAD * 2;
  const H = height + PAD * 2;
  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  const edgeSvg = edges.map(e => {
    const s = nodeMap.get(e.sourceId)!;
    const t = nodeMap.get(e.targetId)!;
    const sx = s.x + PAD + NODE_W;
    const sy = s.y + PAD + NODE_H / 2;
    const tx = t.x + PAD;
    const ty = t.y + PAD + NODE_H / 2;
    const mx = (sx + tx) / 2;
    const cls = e.isCritical ? 'diagram-edge critical-edge' : 'diagram-edge';
    return `<path d="M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}" class="${cls}" marker-end="url(#${e.isCritical ? 'arrow-crit' : 'arrow'})"/>`;
  }).join('\n');

  const nodeSvg = nodes.map(n => {
    const x = n.x + PAD;
    const y = n.y + PAD;
    const isCritical = n.cpm?.isCritical ?? false;
    const cls = isCritical ? 'diagram-node act-node critical-node' : 'diagram-node act-node';
    const idLabel = escXml(n.id);
    const nameLabel = escXml(truncate(n.data.name, 24));
    const durLabel = n.data.duration !== undefined ? `${n.data.duration}d` : '—';
    return [
      `<rect class="${cls}" x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="6"/>`,
      `<text class="text-id" x="${x + 8}" y="${y + 18}" font-size="10" font-family="system-ui,sans-serif" font-weight="600">${idLabel}</text>`,
      `<text class="text-primary" x="${x + NODE_W / 2}" y="${y + 46}" text-anchor="middle" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${nameLabel}</text>`,
      `<text class="text-secondary" x="${x + NODE_W - 8}" y="${y + NODE_H - 10}" text-anchor="end" font-size="11" font-family="system-ui,sans-serif">${durLabel}</text>`,
    ].join('\n');
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
  <marker id="arrow-crit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill-critical"/>
  </marker>
</defs>
${edgeSvg}
${nodeSvg}
</svg>`;
}

// ── ActivitiesPreview webview class ───────────────────────────────────────────

export class ActivitiesPreview {
  readonly panelTitle = 'Activities Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

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
        'activitiesPreview',
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
      const v = validateActivities(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        svgContent = buildSvg(parsed as ActivityDoc);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'Activities (PSND)', svgContent, errorMsg, warnings, themeId, extraStyles: ACTIVITIES_STYLES });
  }
}

const ACTIVITIES_STYLES = `
  .act-node { fill: var(--ts-bg-surface, #f8fafc); stroke: var(--ts-border, #94a3b8); stroke-width: 1.5; }
  .critical-node { fill: #fff7ed; stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2.5; }
  .critical-edge { stroke: var(--ts-brand-orange, #ff4d00); stroke-width: 2; }
  .arrow-fill-critical { fill: var(--ts-brand-orange, #ff4d00); }
  .text-id { fill: var(--ts-text-muted, #64748b); }
`;
