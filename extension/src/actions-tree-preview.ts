import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import { buildDiagramFrame, type ThemeId, OPEN_THEME_COMMAND } from './diagram-frame.js';
import { todayIso } from './svg-title-block.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { StaticPreview } from './static-preview.js';
import { findCanonRoot, isUnderCanon, readYamlDocsUnder } from './canon-loader.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ActionEntry {
  id: string;
  name: string;
  action_type?: string;
  parent?: string;
  owner?: string;
  start_date?: string;
  end_date?: string;
}

interface ActionsTreeScope {
  root_action?: string;
  action_type?: string;
  goals?: string[];
}

// ── Tree rendering ────────────────────────────────────────────────────────────

const ACTION_TYPE_LEVEL: Record<string, number> = {
  initiative: 1, 'strategic initiative': 1,
  programme: 2, program: 2,
  project: 3,
  task: 4,
};

function actionTypeLevel(type: string | undefined): number {
  return type ? (ACTION_TYPE_LEVEL[type.toLowerCase()] ?? 99) : 99;
}

function actionTypeBadgeClass(type: string | undefined): string {
  if (!type) return '';
  return `tree-badge tree-badge-${type.toLowerCase().replace(/\s+/g, '-')}`;
}

function buildActionsTreeHtml(
  actions: ActionEntry[],
  filename: string,
  date: string,
  version?: string,
): string {
  if (actions.length === 0) {
    return '<div class="section-notice">No action elements found.</div>';
  }

  const childrenOf = new Map<string | undefined, ActionEntry[]>();
  for (const act of actions) {
    const key = act.parent ?? undefined;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(act);
  }

  const sortFn = (a: ActionEntry, b: ActionEntry): number => {
    const diff = actionTypeLevel(a.action_type) - actionTypeLevel(b.action_type);
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  };
  for (const [, kids] of childrenOf) kids.sort(sortFn);

  function renderNode(act: ActionEntry): string {
    const kids = childrenOf.get(act.id) ?? [];
    const badgeClass = actionTypeBadgeClass(act.action_type);
    const badge = act.action_type
      ? `<span class="${badgeClass}">${escXml(act.action_type)}</span>`
      : '';
    const metaParts: string[] = [];
    if (act.owner) metaParts.push(escXml(act.owner));
    if (act.start_date && act.end_date) metaParts.push(`${escXml(act.start_date)} → ${escXml(act.end_date)}`);
    else if (act.start_date) metaParts.push(`from ${escXml(act.start_date)}`);
    const meta = metaParts.length ? `<span class="tree-node-meta">${metaParts.join(' · ')}</span>` : '';
    const label = `<div class="tree-node-label"><span class="tree-node-name">${escXml(act.name)}</span><span class="tree-node-id">${escXml(act.id)}</span></div>`;

    if (kids.length === 0) {
      return `<div class="tree-node tree-leaf"><div class="tree-node-row">${label}${badge}${meta}</div></div>`;
    }
    const openAttr = actionTypeLevel(act.action_type) <= 3 ? ' open' : '';
    const kidsHtml = `<div class="tree-children">${kids.map((k) => renderNode(k)).join('')}</div>`;
    return `<details class="tree-node"${openAttr}><summary class="tree-node-row">${label}${badge}${meta}</summary>${kidsHtml}</details>`;
  }

  const allIds = new Set(actions.map((a) => a.id));
  const orphans = actions.filter((a) => a.parent && !allIds.has(a.parent));
  const roots = [...(childrenOf.get(undefined) ?? []), ...orphans].sort(sortFn);

  if (roots.length === 0) {
    return '<div class="section-notice">No root actions found — check parent references.</div>';
  }

  const versionPart = version ? ` · v${escXml(version)}` : '';
  const titleHtml = `<div class="diagram-title-block diagram-title-block-html">
  <div class="text-header">Actions tree — Initiative → Programme → Project → Task</div>
  <div class="text-secondary">${escXml(filename)}</div>
  <div class="text-secondary">${escXml(date)}${versionPart}</div>
</div>`;

  return `${titleHtml}<div class="tree-view">${roots.map((r) => renderNode(r)).join('')}</div>`;
}

// ── Scope filtering ───────────────────────────────────────────────────────────

function applyScope(
  actions: ActionEntry[],
  scope: ActionsTreeScope | undefined,
  relations: unknown[],
): ActionEntry[] {
  if (!scope) return actions;
  let result = actions;

  if (scope.action_type) {
    const targetType = scope.action_type.toLowerCase();
    result = result.filter((a) => (a.action_type ?? '').toLowerCase() === targetType);
  }

  if (scope.goals && scope.goals.length > 0) {
    const goalSet = new Set(scope.goals);
    const connectedIds = new Set<string>();
    for (const doc of relations) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
      const r = doc as Record<string, unknown>;
      if (r['notation'] !== 'relation') continue;
      const type = typeof r['type'] === 'string' ? r['type'] : '';
      if (type !== 'action_goal' && type !== 'activity_goal') continue;
      const to = typeof r['to'] === 'string' ? r['to'] : '';
      if (!goalSet.has(to)) continue;
      const from = typeof r['from'] === 'string' ? r['from'] : '';
      if (from) connectedIds.add(from);
    }
    result = result.filter((a) => connectedIds.has(a.id));
  }

  if (scope.root_action) {
    const rootId = scope.root_action;
    const inScope = new Set<string>();
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      inScope.add(current);
      for (const a of actions) {
        if (a.parent === current && !inScope.has(a.id)) queue.push(a.id);
      }
    }
    result = result.filter((a) => inScope.has(a.id));
  }

  return result;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const ACTIONS_TREE_CSS = `
  .tree-view { padding: 4px 8px 16px; }
  .tree-node { margin: 3px 0; }
  .tree-node-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid var(--ts-border, #e2e8f0);
    background: var(--ts-bg-surface, #ffffff);
    list-style: none;
  }
  .tree-node-row:hover { background: var(--ts-bg-subtle, #f8fafc); }
  details.tree-node > summary.tree-node-row { cursor: pointer; }
  details.tree-node > summary.tree-node-row::-webkit-details-marker { display: none; }
  details.tree-node > summary.tree-node-row::before {
    content: '▶';
    font-size: 9px;
    color: var(--ts-text-muted, #94a3b8);
    flex-shrink: 0;
    display: inline-block;
  }
  details[open].tree-node > summary.tree-node-row::before { transform: rotate(90deg); }
  .tree-leaf > .tree-node-row { padding-left: 27px; }
  .tree-children {
    margin-left: 20px;
    padding-left: 16px;
    padding-top: 2px;
    padding-bottom: 2px;
    border-left: 1.5px solid var(--ts-border, #cbd5e1);
  }
  .tree-node-label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .tree-node-name { font-size: 13px; color: var(--ts-text, #0f172a); }
  .tree-node-id { font-size: 11px; color: var(--ts-text-muted, #64748b); font-family: var(--vscode-editor-font-family, monospace); }
  .tree-node-meta { font-size: 11px; color: var(--ts-text-muted, #64748b); white-space: nowrap; }
  .tree-badge { font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; }
  .tree-badge-initiative,
  .tree-badge-strategic-initiative { background: #fff7ed; color: var(--ts-brand-orange, #ff4d00); border: 1px solid var(--ts-brand-orange, #ff4d00); }
  .tree-badge-programme { background: #eff6ff; color: #2563eb; border: 1px solid #93c5fd; }
  .tree-badge-project { background: var(--ts-layer-activity, #d4edda); color: #166534; border: 1px solid #86efac; }
  .tree-badge-task { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); border: 1px solid var(--ts-border, #cbd5e1); }
  .section-notice { margin: 0 16px; padding: 10px 14px; border-left: 3px solid var(--ts-text-muted, #94a3b8); background: var(--ts-bg-subtle, #f8fafc); color: var(--ts-text-muted, #64748b); font-size: 12px; }
`;

// ── Preview class ─────────────────────────────────────────────────────────────

export class ActionsTreePreview extends StaticPreview {
  readonly panelTitle = 'Actions Tree Preview';
  protected readonly viewType = 'actionsTreePreview';
  protected readonly enableCommandUris = [OPEN_THEME_COMMAND];

  async refreshIfSiblingSaved(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    if (!doc.fileName.endsWith('.yaml')) return;
    const treeUri = vscode.Uri.parse(this.trackedUri);
    const canonRoot = findCanonRoot(treeUri);
    if (!canonRoot) return;
    if (!isUnderCanon(canonRoot, doc.uri)) return;
    const treeDoc = await vscode.workspace.openTextDocument(treeUri);
    await this.pushDocument(treeDoc);
  }

  protected override async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const data = await this.loadCanonData(doc.uri);
    this.panel.webview.html = this.buildHtml(doc.getText(), path.basename(doc.fileName), data);
  }

  private async loadCanonData(
    fileUri: vscode.Uri,
  ): Promise<{ actions: ActionEntry[]; relations: unknown[]; warnings: string[] }> {
    const warnings: string[] = [];
    const canonRoot = findCanonRoot(fileUri);
    if (!canonRoot) {
      warnings.push('Could not locate a canon/ root above this file — no action elements can be loaded.');
      return { actions: [], relations: [], warnings };
    }

    const rawDocs: unknown[] = [];
    const relations: unknown[] = [];
    await readYamlDocsUnder(vscode.Uri.joinPath(canonRoot, 'elements'), rawDocs, warnings);
    await readYamlDocsUnder(vscode.Uri.joinPath(canonRoot, 'relations'), relations, warnings);

    const actions: ActionEntry[] = [];
    for (const doc of rawDocs) {
      if (!doc || typeof doc !== 'object' || Array.isArray(doc)) continue;
      const d = doc as Record<string, unknown>;
      const notation = typeof d['notation'] === 'string' ? d['notation'] : '';
      if (notation !== 'action' && notation !== 'activity') continue;
      const id = typeof d['id'] === 'string' ? d['id'].trim() : '';
      if (!id) continue;
      actions.push({
        id,
        name: typeof d['name'] === 'string' ? d['name'] : id,
        action_type: typeof d['action_type'] === 'string'
          ? d['action_type']
          : (typeof d['activity_type'] === 'string' ? d['activity_type'] : undefined),
        parent: typeof d['parent'] === 'string' ? d['parent'] : undefined,
        owner: typeof d['owner'] === 'string' ? d['owner'] : undefined,
        start_date: typeof d['start_date'] === 'string' ? d['start_date'] : undefined,
        end_date: typeof d['end_date'] === 'string' ? d['end_date'] : undefined,
      });
    }

    return { actions, relations, warnings };
  }

  private buildHtml(
    yamlText: string,
    filename: string,
    data: { actions: ActionEntry[]; relations: unknown[]; warnings: string[] },
  ): string {
    let bodyContent = '';
    let errorMsg = '';
    const warnings = [...data.warnings];

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      const raw = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;

      const notation = typeof raw['notation'] === 'string' ? raw['notation'] : '';
      if (!notation) {
        errorMsg = 'notation field is required';
      } else if (notation !== 'actions-tree' && notation !== 'activities-tree') {
        errorMsg = `notation must be "actions-tree", got "${notation}"`;
      } else {
        if (notation === 'activities-tree') {
          warnings.push('DEPRECATED_NOTATION: notation: "activities-tree" is deprecated — migrate to notation: "actions-tree"');
        }

        const docDate = typeof raw['date'] === 'string' ? raw['date'] : todayIso();
        const docVersion = typeof raw['version'] === 'string' ? raw['version'] : undefined;

        let scope: ActionsTreeScope | undefined;
        const viewConfig = raw['view_config'];
        if (viewConfig && typeof viewConfig === 'object' && !Array.isArray(viewConfig)) {
          const vc = viewConfig as Record<string, unknown>;
          const scopeRaw = vc['scope'];
          if (scopeRaw && typeof scopeRaw === 'object' && !Array.isArray(scopeRaw)) {
            const s = scopeRaw as Record<string, unknown>;
            scope = {};
            if (typeof s['root_action'] === 'string') scope.root_action = s['root_action'];
            if (typeof s['action_type'] === 'string') scope.action_type = s['action_type'];
            if (Array.isArray(s['goals'])) {
              scope.goals = s['goals'].filter((g): g is string => typeof g === 'string');
            }
          }
        }

        const filtered = applyScope(data.actions, scope, data.relations);
        bodyContent = buildActionsTreeHtml(filtered, filename, docDate, docVersion);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    return buildDiagramFrame({
      filename,
      notation: 'Actions Tree',
      bodyContent,
      errorMsg,
      warnings,
      themeId,
      extraStyles: ACTIONS_TREE_CSS,
      themeCommand: OPEN_THEME_COMMAND,
    });
  }
}

export function isActionsTreeFileName(fileName: string): boolean {
  return fileName.endsWith('.actions-tree.transitrix.yaml')
    || fileName.endsWith('.activities-tree.transitrix.yaml');
}
