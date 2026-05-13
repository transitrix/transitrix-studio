import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';

// ── Inline types (mirror packages/diagrams/src/goals/types.ts) ──────────────

interface GoalType { name: string; level: number; }
interface Goal {
  id: number; name: string; type: string; level: number; parent_id: number;
  tag?: string; description?: string;
}
interface GoalTree { goal_types: GoalType[]; goals: Goal[]; }

interface LaidOutNode { id: number; x: number; y: number; width: number; height: number; data: Goal; }
interface LaidOutEdge { source: number; target: number; }
interface GoalTreeLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation (minimal subset for preview) ───────────────────────────

function validateGoalTree(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.goals)) errors.push({ code: 'SCHEMA_INVALID', message: 'goals must be an array' });
  if (!Array.isArray(raw.goal_types)) errors.push({ code: 'SCHEMA_INVALID', message: 'goal_types must be an array' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  const tree = raw as unknown as GoalTree;
  const allIds = new Set(tree.goals.map(g => g.id));
  for (const g of tree.goals) {
    if (!g.name?.trim()) errors.push({ code: 'EMPTY_NAME', message: `Goal ${g.id} has empty name` });
  }
  for (const g of tree.goals) {
    if (g.parent_id !== 0 && !allIds.has(g.parent_id)) {
      warnings.push({ code: 'BROKEN_PARENT_REF', message: `Goal ${g.id} references missing parent ${g.parent_id}` });
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

// ── Inline layout ────────────────────────────────────────────────────────────

const NODE_W = 250;
const NODE_H = 80;
const RANK_SEP = 100;
const NODE_SEP = 32;

function layoutGoalTree(tree: GoalTree): GoalTreeLayout {
  const goalById = new Map(tree.goals.map(g => [g.id, g]));
  const children = new Map<number, number[]>();
  for (const g of tree.goals) {
    if (!children.has(g.parent_id)) children.set(g.parent_id, []);
    children.get(g.parent_id)!.push(g.id);
  }
  const allIds = new Set(tree.goals.map(g => g.id));
  const roots = tree.goals.filter(g => g.parent_id === 0 || !allIds.has(g.parent_id));
  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  const colNextY = new Map<number, number>();

  function placeNode(id: number): { top: number; bottom: number } {
    const goal = goalById.get(id);
    if (!goal) return { top: 0, bottom: 0 };
    const col = goal.level;
    const kids = children.get(id) ?? [];
    if (kids.length === 0) {
      const y = colNextY.get(col) ?? 0;
      colNextY.set(col, y + NODE_H + NODE_SEP);
      nodes.push({ id, x: col * (NODE_W + RANK_SEP), y, width: NODE_W, height: NODE_H, data: goal });
      return { top: y, bottom: y + NODE_H };
    }
    const spans = kids.map(c => placeNode(c));
    for (const c of kids) edges.push({ source: id, target: c });
    const spanTop = Math.min(...spans.map(s => s.top));
    const spanBot = Math.max(...spans.map(s => s.bottom));
    const idealY = spanTop + (spanBot - spanTop) / 2 - NODE_H / 2;
    const finalY = Math.max(idealY, colNextY.get(col) ?? 0);
    colNextY.set(col, finalY + NODE_H + NODE_SEP);
    nodes.push({ id, x: col * (NODE_W + RANK_SEP), y: finalY, width: NODE_W, height: NODE_H, data: goal });
    return { top: Math.min(finalY, spanTop), bottom: Math.max(finalY + NODE_H, spanBot) };
  }

  for (const root of roots) {
    placeNode(root.id);
    for (const [col, y] of colNextY) colNextY.set(col, y + NODE_SEP);
  }

  if (nodes.length === 0) return { nodes: [], edges: [], bounds: { x: 0, y: 0, width: 0, height: 0 } };
  const minX = Math.min(...nodes.map(n => n.x));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxX = Math.max(...nodes.map(n => n.x + n.width));
  const maxY = Math.max(...nodes.map(n => n.y + n.height));
  return { nodes, edges, bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY } };
}

// ── SVG renderer ─────────────────────────────────────────────────────────────

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layoutToSvg(layout: GoalTreeLayout, tree: GoalTree): string {
  const pad = 24;
  const w = layout.bounds.width + pad * 2;
  const h = layout.bounds.height + pad * 2;
  const ox = -layout.bounds.x + pad;
  const oy = -layout.bounds.y + pad;

  const nodeMap = new Map(layout.nodes.map(n => [n.id, n]));
  function edgePath(e: LaidOutEdge): string {
    const s = nodeMap.get(e.source);
    const t = nodeMap.get(e.target);
    if (!s || !t) return '';
    const sx = s.x + ox + s.width;
    const sy = s.y + oy + s.height / 2;
    const tx = t.x + ox;
    const ty = t.y + oy + t.height / 2;
    const mx = (sx + tx) / 2;
    return `M${sx},${sy} C${mx},${sy} ${mx},${ty} ${tx},${ty}`;
  }

  const edgeSvg = layout.edges.map(e =>
    `<path d="${edgePath(e)}" class="diagram-edge" marker-end="url(#arrow)"/>`
  ).join('\n');

  const typeMap = new Map(tree.goal_types.map(gt => [gt.name, gt.level]));
  function levelOf(goal: Goal): number {
    return typeMap.get(goal.type) ?? goal.level;
  }

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const level = levelOf(n.data) % 8;
    const label = n.data.name.length > 38 ? n.data.name.slice(0, 36) + '…' : n.data.name;
    const typeLabel = n.data.type || '';
    return `<g>
  <rect class="diagram-node level-${level}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>
  <text class="text-primary" x="${x + n.width / 2}" y="${y + 30}" text-anchor="middle" font-size="13" font-weight="600" font-family="system-ui,sans-serif">${escXml(label)}</text>
  <text class="text-secondary" x="${x + n.width / 2}" y="${y + 52}" text-anchor="middle" font-size="11" font-family="system-ui,sans-serif">${escXml(typeLabel)}</text>
</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs>
  <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
    <path d="M0,0 L0,6 L8,3 z" class="arrow-fill"/>
  </marker>
</defs>
${edgeSvg}
${nodeSvg}
</svg>`;
}

// ── GoalsPreview webview class ───────────────────────────────────────────────

export class GoalsPreview {
  readonly panelTitle = 'Goals Tree Preview';
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
        'goalsPreview',
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
      const v = validateGoalTree(parsed);
      warnings = v.warnings.map(w => `${w.code}: ${w.message}`);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const tree = parsed as GoalTree;
        const layout = layoutGoalTree(tree);
        svgContent = layoutToSvg(layout, tree);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    this.lastSvg = svgContent;

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({ filename, notation: 'Goal tree', svgContent, errorMsg, warnings, themeId });
  }

  async saveAsSvg(): Promise<void> {
    if (!this.lastSvg) {
      vscode.window.showWarningMessage('No diagram rendered yet. Open a *.goals.transitrix.yaml file first.');
      return;
    }
    const sourceUri = this.trackedUri ? vscode.Uri.parse(this.trackedUri) : undefined;
    const stem = sourceUri
      ? path.basename(sourceUri.fsPath).replace(/\.goals\.transitrix\.yaml$/, '')
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
