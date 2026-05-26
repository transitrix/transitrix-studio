import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { buildDiagramFrame, CATALOGUE_STYLES, type ThemeId } from './diagram-frame.js';
import { coerceDatesToIsoStrings } from '../../packages/diagrams/src/yaml-normalize.js';

// ── Inline types (mirror packages/diagrams/src/capability-map/types.ts) ───────

type CapabilityType = 'domain' | 'supporting';

interface CapabilityNode {
  id: string;
  name: string;
  type?: CapabilityType;
  description?: string;
  current_maturity: number;
  target_maturity?: number;
  target_date?: string;
  owner_role?: string;
  business_process?: string;
  applications?: string[];
  children?: CapabilityNode[];
}

interface CapabilityMapHeader {
  id: string;
  name: string;
  description?: string;
  assessment_date: string;
  capabilities: CapabilityNode[];
}

interface ValidationError { code: string; message: string; }
interface ValidationResult { valid: boolean; errors: ValidationError[]; warnings: Array<{ code: string; message: string }> }

// ── Inline validation (mirrors capability-map/validate.ts) ────────────────────

const VALID_TYPES = new Set<string>(['domain', 'supporting']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CAP_ID_RE = /^(V|H)\d+(\.\d+)*$/;

function validateTree(nodes: unknown[], pathPrefix: string, errors: ValidationError[], seen: Set<string>): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i] as Record<string, unknown>;
    const p = `${pathPrefix}[${i}]`;
    if (!node['id'] || typeof node['id'] !== 'string' || !(node['id'] as string).trim()) {
      errors.push({ code: 'CMAP-003', message: `${p}: id is required` });
    } else {
      const id = node['id'] as string;
      if (seen.has(id)) errors.push({ code: 'CMAP-008', message: `Duplicate capability id: "${id}"` });
      seen.add(id);
      if (!CAP_ID_RE.test(id))
        errors.push({ code: 'CMAP-009', message: `${p}: id "${id}" must match V[n] or H[n] with optional .n segments` });
    }
    if (!node['name'] || typeof node['name'] !== 'string' || !(node['name'] as string).trim())
      errors.push({ code: 'CMAP-003', message: `${p}: name is required` });
    if (node['current_maturity'] === undefined) {
      errors.push({ code: 'CMAP-003', message: `${p}: current_maturity is required` });
    } else {
      const cm = node['current_maturity'];
      if (typeof cm !== 'number' || !Number.isInteger(cm) || cm < 1 || cm > 5)
        errors.push({ code: 'CMAP-005', message: `${p}: current_maturity must be 1–5, got "${cm}"` });
    }
    if (node['target_maturity'] !== undefined) {
      const tm = node['target_maturity'];
      if (typeof tm !== 'number' || !Number.isInteger(tm) || tm < 1 || tm > 5)
        errors.push({ code: 'CMAP-006', message: `${p}: target_maturity must be 1–5, got "${tm}"` });
    }
    if (node['type'] !== undefined && !VALID_TYPES.has(node['type'] as string))
      errors.push({ code: 'CMAP-004', message: `${p}: type "${node['type']}" must be one of: domain, supporting` });
    if (node['target_date'] !== undefined) {
      if (typeof node['target_date'] !== 'string' || !DATE_RE.test(node['target_date'] as string))
        errors.push({ code: 'CMAP-007', message: `${p}: target_date must be YYYY-MM-DD, got "${node['target_date']}"` });
    }
    if (node['applications'] !== undefined && !Array.isArray(node['applications']))
      errors.push({ code: 'CMAP-003', message: `${p}: applications must be an array` });
    if (node['children'] !== undefined) {
      if (!Array.isArray(node['children'])) {
        errors.push({ code: 'CMAP-003', message: `${p}: children must be an array` });
      } else {
        validateTree(node['children'] as unknown[], `${p}.children`, errors, seen);
      }
    }
  }
}

function validateCapabilityMap(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: Array<{ code: string; message: string }> = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: [{ code: 'CMAP-001', message: 'Input must be an object' }], warnings };
  }
  const raw = input as Record<string, unknown>;
  if (!('notation' in raw)) {
    errors.push({ code: 'CMAP-001', message: 'Missing required field: notation' });
  } else if (raw['notation'] !== 'capability-map') {
    errors.push({ code: 'CMAP-001', message: `notation must be "capability-map", got "${raw['notation']}"` });
  }
  if (errors.length > 0) return { valid: false, errors, warnings };

  const map = raw['capability_map'];
  if (!map || typeof map !== 'object') {
    errors.push({ code: 'CMAP-002', message: 'Missing required field: capability_map' });
    return { valid: false, errors, warnings };
  }
  const m = map as Record<string, unknown>;

  if (!m['id'] || typeof m['id'] !== 'string' || !(m['id'] as string).trim())
    errors.push({ code: 'CMAP-002', message: 'capability_map.id is required' });
  if (!m['name'] || typeof m['name'] !== 'string' || !(m['name'] as string).trim())
    errors.push({ code: 'CMAP-002', message: 'capability_map.name is required' });
  if (!m['assessment_date'] || typeof m['assessment_date'] !== 'string')
    errors.push({ code: 'CMAP-002', message: 'capability_map.assessment_date is required' });
  if (errors.length > 0) return { valid: false, errors, warnings };

  if (!DATE_RE.test(m['assessment_date'] as string))
    errors.push({ code: 'CMAP-007', message: `capability_map.assessment_date must be YYYY-MM-DD, got "${m['assessment_date']}"` });

  const caps = m['capabilities'];
  if (!Array.isArray(caps)) {
    errors.push({ code: 'CMAP-002', message: 'capability_map.capabilities must be an array' });
    return { valid: false, errors, warnings };
  }
  validateTree(caps, 'capabilities', errors, new Set<string>());
  return { valid: errors.length === 0, errors, warnings };
}

// ── HTML render helpers ───────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MATURITY_LABEL: Record<number, string> = {
  1: 'Initial',
  2: 'Managed',
  3: 'Defined',
  4: 'Quantitatively Managed',
  5: 'Optimising',
};

function maturityBadge(level: number, kind: 'current' | 'target'): string {
  const safe = Math.max(1, Math.min(5, level | 0));
  return `<span class="maturity-pill maturity-${safe}" title="${kind === 'current' ? 'Current' : 'Target'}: Level ${safe} — ${escHtml(MATURITY_LABEL[safe] ?? '')}">L${safe}</span>`;
}

function isHorizontal(id: string): boolean {
  return id.startsWith('H');
}

function buildCapabilityCard(node: CapabilityNode, depth: number): string {
  const cls = ['capability-card', `depth-${Math.min(depth, 3)}`];
  if (node.type) cls.push(`cap-type-${node.type}`);
  if (isHorizontal(node.id)) cls.push('cap-horizontal');

  const current = maturityBadge(node.current_maturity, 'current');
  const target = node.target_maturity !== undefined ? maturityBadge(node.target_maturity, 'target') : '';
  const arrow = target ? '<span class="maturity-arrow">→</span>' : '';

  const meta: string[] = [];
  if (node.type) meta.push(`<span class="cap-tag cap-tag-${escHtml(node.type)}">${escHtml(node.type)}</span>`);
  if (node.owner_role) meta.push(`<span class="cap-meta">Owner: ${escHtml(node.owner_role)}</span>`);
  if (node.business_process) meta.push(`<span class="cap-meta">Process: ${escHtml(node.business_process)}</span>`);
  if (node.target_date) meta.push(`<span class="cap-meta">By ${escHtml(node.target_date)}</span>`);

  const apps = (node.applications && node.applications.length > 0)
    ? `<div class="cap-apps"><span class="cap-apps-label">Apps:</span> ${node.applications.map(a => `<code>${escHtml(a)}</code>`).join(' ')}</div>`
    : '';

  const childBlock = (node.children && node.children.length > 0)
    ? `<div class="cap-children">${node.children.map(c => buildCapabilityCard(c, depth + 1)).join('')}</div>`
    : '';

  return `<div class="${cls.join(' ')}">
  <div class="capability-head">
    <div class="capability-maturity">${current}${arrow}${target}</div>
    <div class="capability-titles">
      <div class="capability-name">${escHtml(node.name)}</div>
      <div class="capability-id">${escHtml(node.id)}</div>
    </div>
  </div>
  ${meta.length > 0 ? `<div class="cap-meta-row">${meta.join('')}</div>` : ''}
  ${node.description ? `<div class="cap-desc">${escHtml(node.description)}</div>` : ''}
  ${apps}
  ${childBlock}
</div>`;
}

function buildCapabilityMapBody(map: CapabilityMapHeader): string {
  if (map.capabilities.length === 0) {
    return '<div class="empty-map">No capabilities defined.</div>';
  }
  const verticals = map.capabilities.filter(c => !isHorizontal(c.id));
  const horizontals = map.capabilities.filter(c => isHorizontal(c.id));
  const vBlock = verticals.length > 0
    ? `<section class="cap-axis cap-axis-v">
  <h2 class="cap-axis-title">Vertical capabilities (domains)</h2>
  <div class="cap-axis-list">${verticals.map(c => buildCapabilityCard(c, 0)).join('')}</div>
</section>` : '';
  const hBlock = horizontals.length > 0
    ? `<section class="cap-axis cap-axis-h">
  <h2 class="cap-axis-title">Horizontal capabilities (cross-cutting)</h2>
  <div class="cap-axis-list">${horizontals.map(c => buildCapabilityCard(c, 0)).join('')}</div>
</section>` : '';
  return vBlock + hBlock;
}

// ── CapabilityMapPreview webview class ────────────────────────────────────────

export class CapabilityMapPreview {
  readonly panelTitle = 'Capability Map Preview';
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
        'capabilityMapPreview',
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
    let bodyContent = '';
    let errorMsg = '';
    let title: string | undefined;
    let subtitle: string | undefined;
    let version: string | undefined;
    let date: string | undefined;

    try {
      const parsed = coerceDatesToIsoStrings(yaml.load(yamlText) as unknown);
      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>;
        if (typeof raw['title'] === 'string') title = raw['title'];
        if (typeof raw['description'] === 'string') subtitle = raw['description'];
        if (typeof raw['version'] === 'string') version = String(raw['version']);
        if (typeof raw['date'] === 'string') date = raw['date'];
      }

      const v = validateCapabilityMap(parsed);
      if (!v.valid) {
        errorMsg = v.errors.map(e => `${e.code}: ${e.message}`).join('\n');
      } else {
        const raw = parsed as Record<string, unknown>;
        const map = raw['capability_map'] as CapabilityMapHeader;
        bodyContent = buildCapabilityMapBody(map);
        if (!title) title = map.name;
        if (!subtitle && map.description) subtitle = map.description;
        if (!date) date = map.assessment_date;
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Parse error';
    }

    const themeId = vscode.workspace
      .getConfiguration('transitrix')
      .get<ThemeId>('theme', 'transitrix');

    return buildDiagramFrame({
      filename,
      notation: 'Capability Map',
      bodyContent,
      errorMsg,
      themeId,
      title,
      subtitle,
      version,
      date,
      extraStyles: CATALOGUE_STYLES + CAPABILITY_MAP_STYLES,
    });
  }
}

const CAPABILITY_MAP_STYLES = `
  .cap-axis {
    margin-bottom: 24px;
  }
  .cap-axis-title {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ts-text-muted, #64748b);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .cap-axis-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .capability-card {
    border: 1px solid var(--ts-divider, #cbd5e1);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--ts-bg, #ffffff);
  }
  .capability-card.depth-0 {
    border-width: 2px;
    border-color: var(--ts-brand-primary, #004d67);
    background: var(--ts-bg-elevated, #f1f5f9);
  }
  .capability-card.cap-horizontal {
    border-color: var(--ts-status-warning-fg, #854d0e);
  }
  .capability-card.depth-1 { margin-left: 24px; }
  .capability-card.depth-2 { margin-left: 48px; }
  .capability-card.depth-3 { margin-left: 72px; }
  .cap-children {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .capability-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .capability-maturity {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  .maturity-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #fff;
  }
  .maturity-pill.maturity-1 { background: var(--ts-maturity-1, #b91c1c); }
  .maturity-pill.maturity-2 { background: var(--ts-maturity-2, #d97706); }
  .maturity-pill.maturity-3 { background: var(--ts-maturity-3, #ca8a04); }
  .maturity-pill.maturity-4 { background: var(--ts-maturity-4, #65a30d); }
  .maturity-pill.maturity-5 { background: var(--ts-maturity-5, #15803d); }
  .maturity-arrow {
    color: var(--ts-text-muted, #64748b);
    font-size: 13px;
  }
  .capability-titles {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .capability-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ts-text, #0f172a);
  }
  .capability-id {
    font-family: monospace;
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
  }
  .cap-meta-row {
    margin-top: 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    align-items: center;
  }
  .cap-tag {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #fff;
  }
  .cap-tag-domain     { background: var(--ts-brand-primary, #004d67); }
  .cap-tag-supporting { background: var(--ts-text-muted, #64748b); }
  .cap-meta {
    font-size: 11px;
    color: var(--ts-text-muted, #64748b);
  }
  .cap-desc {
    margin-top: 6px;
    font-size: 12px;
    color: var(--ts-text-muted, #64748b);
  }
  .cap-apps {
    margin-top: 6px;
    font-size: 12px;
    color: var(--ts-text, #0f172a);
  }
  .cap-apps-label {
    color: var(--ts-text-muted, #64748b);
    margin-right: 4px;
  }
  .cap-apps code {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 3px;
    background: var(--ts-bg-elevated, #f1f5f9);
    font-family: monospace;
    font-size: 11px;
    margin-right: 4px;
    border: 1px solid var(--ts-divider, #cbd5e1);
  }
  .empty-map {
    text-align: center;
    color: var(--ts-text-muted, #64748b);
    padding: 48px;
    font-style: italic;
  }
`;
