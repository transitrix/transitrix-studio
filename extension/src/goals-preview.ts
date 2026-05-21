import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, prepareSvgForExport, type ThemeId } from './diagram-frame.js';

// ── Canonical types (spec: notations/04-goals.md v0.2) ──────────────────────
//
// goals_tree:
//   id: "GT-..."
//   name: "..."
//   description?: "..."
//   root:
//     goal_id: "GOAL-..."
//     children?:
//       - goal_id: "GOAL-..."
//         children?: [...]

interface TreeNode { goal_id: string; children?: TreeNode[]; }
interface GoalsTreeRoot { id: string; name: string; description?: string; root: TreeNode; }
interface GoalsTreeDoc { goals_tree: GoalsTreeRoot; }

// Internal flat representation used by the layout engine
interface FlatGoal { id: string; label: string; depth: number; parentId: string | null; }

interface LaidOutNode { id: string; x: number; y: number; width: number; height: number; depth: number; label: string; }
interface LaidOutEdge { source: string; target: string; }
interface GoalTreeLayout {
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  bounds: { x: number; y: number; width: number; height: number };
}

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Validation ───────────────────────────────────────────────────────────────

function validateGoalTree(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'SCHEMA_INVALID', message: 'Input must be an object' }], warnings };
  }

  const raw = input as Record<string, unknown>;

  if (!raw.goals_tree || typeof raw.goals_tree !== 'object') {
    errors.push({ code: 'MISSING_ROOT', message: 'goals_tree root key is required' });
    return { valid: false, errors, warnings };
  }

  const tree = raw.goals_tree as Record<string, unknown>;

  if (!tree.root || typeof tree.root !== 'object') {
    errors.push({ code: 'MISSING_ROOT', message: 'goals_tree.root is required' });
    return { valid: false, errors, warnings };
  }

  const root = tree.root as Record<string, unknown>;
  if (!root.goal_id || typeof root.goal_id !== 'string') {
    errors.push({ code: 'MISSING_GOAL_ID', message: 'goals_tree.root.goal_id must be a non-empty string' });
  }

  // Check for cycles via DFS
  function checkCycles(node: TreeNode, seen: Set<string>): boolean {
    if (seen.has(node.goal_id)) {
      warnings.push({ code: 'CYCLE_DETECTED', message: `goal_id "${node.goal_id}" appears more than once in the tree` });
      return false;
    }
    seen.add(node.goal_id);
    for (const child of (node.children ?? [])) checkCycles(child, new Set(seen));
    return true;
  }

  if (errors.length === 0) {
    checkCycles(raw.goals_tree as unknown as GoalsTreeRoot['root'] & { children?: TreeNode[] }, new Set());
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Flatten nested tree → internal flat list ─────────────────────────────────

function flattenTree(node: TreeNode, depth: number, parentId: string | null, out: FlatGoal[]): void {
  out.push({ id: node.goal_id, label: node.goal_id, depth, parentId });
  for (const child of (node.children ?? [])) {
    flattenTree(child, depth + 1, node.goal_id, out);
  }
}

// ── Layout ───────────────────────────────────────────────────────────────────

const NODE_W = 250;
const NODE_H = 60;
const RANK_SEP = 100;
const NODE_SEP = 24;

function layoutGoalTree(doc: GoalsTreeDoc): GoalTreeLayout {
  const flat: FlatGoal[] = [];
  flattenTree(doc.goals_tree.root, 0, null, flat);

  const byId = new Map(flat.map(g => [g.id, g]));
  const childrenOf = new Map<string | null, string[]>();
  for (const g of flat) {
    const key = g.parentId;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(g.id);
  }

  const nodes: LaidOutNode[] = [];
  const edges: LaidOutEdge[] = [];
  const colNextY = new Map<number, number>();

  function placeNode(id: string): { top: number; bottom: number } {
    const goal = byId.get(id);
    if (!goal) return { top: 0, bottom: 0 };
    const col = goal.depth;
    const kids = childrenOf.get(id) ?? [];

    if (kids.length === 0) {
      const y = colNextY.get(col) ?? 0;
      colNextY.set(col, y + NODE_H + NODE_SEP);
      nodes.push({ id, x: col * (NODE_W + RANK_SEP), y, width: NODE_W, height: NODE_H, depth: col, label: goal.label });
      return { top: y, bottom: y + NODE_H };
    }

    const spans = kids.map(c => placeNode(c));
    for (const c of kids) edges.push({ source: id, target: c });
    const spanTop = Math.min(...spans.map(s => s.top));
    const spanBot = Math.max(...spans.map(s => s.bottom));
    const idealY = spanTop + (spanBot - spanTop) / 2 - NODE_H / 2;
    const finalY = Math.max(idealY, colNextY.get(col) ?? 0);
    colNextY.set(col, finalY + NODE_H + NODE_SEP);
    nodes.push({ id, x: col * (NODE_W + RANK_SEP), y: finalY, width: NODE_W, height: NODE_H, depth: col, label: goal.label });
    return { top: Math.min(finalY, spanTop), bottom: Math.max(finalY + NODE_H, spanBot) };
  }

  placeNode(doc.goals_tree.root.goal_id);

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

function layoutToSvg(layout: GoalTreeLayout, treeName: string): string {
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

  const nodeSvg = layout.nodes.map(n => {
    const x = n.x + ox;
    const y = n.y + oy;
    const level = n.depth % 8;
    const label = n.label.length > 36 ? n.label.slice(0, 34) + '…' : n.label;
    return `<g>
  <rect class="diagram-node level-${level}" x="${x}" y="${y}" width="${n.width}" height="${n.height}" rx="8"/>
  <text class="text-primary" x="${x + n.width / 2}" y="${y + n.height / 2 + 5}" text-anchor="middle" font-size="12" font-weight="600" font-family="system-ui,sans-serif">${escXml(label)}</text>
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
        const doc = parsed as GoalsTreeDoc;
        const layout = layoutGoalTree(doc);
        svgContent = layoutToSvg(layout, doc.goals_tree.name ?? '');
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
