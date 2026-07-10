import { randomBytes } from 'node:crypto';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';

// In-preview interactive control panel for the spacing / curvature / scope
// previews (vkgeorgia/strategy#75 / #76 / #77 — PR2).
//
// PR1 shipped the same controls as VS Code settings + a "…" toolbar link that
// opens Settings. PR2 adds live, in-preview controls. Per Valerii's joint
// `enableScripts` posture call (2026-06-02), the four interactive previews
// (goals / dgca / dga / action) now run with scripts enabled under a strict
// nonce-based CSP. This module is the *pure* string-building half of that work
// — it never imports `vscode`, so it is unit-testable:
//
//   - `buildControlsPanel(model)` → the `<details>` panel markup (inputs carry
//     `data-tx-control` / `data-tx-field` attributes).
//   - `buildControlsScript(nonce)` → the nonce'd `<script>` that wires those
//     inputs to `postMessage`. The host (each preview class) receives the
//     message and writes the matching `transitrix.*` setting; the existing
//     `onDidChangeConfiguration` handler then re-renders. Config stays the
//     single source of truth, shared with the "…" Settings links.
//
// Source-of-truth note: the `data-tx-*` attribute contract between the panel
// markup and the wiring script lives entirely in this file, so the two never
// drift.

/** A goal option for the scope root-picker dropdown. */
export interface ScopeGoalOption {
  /** Goal id, stringified — used as the `<option>` value. */
  id: string;
  /** Goal name, shown to the user. Falls back to the id when unnamed. */
  name: string;
}

export interface SpacingControlModel {
  horizontalGap: number;
  verticalGap: number;
  /** Layout defaults — used to decide whether the panel opens by default. */
  defaults: { horizontalGap: number; verticalGap: number };
}

export interface CurvatureControlModel {
  value: number;
  /** Historical default (1) — the no-visual-change baseline. */
  default: number;
}

export interface ScopeControlModel {
  /** Current root id ('' when no root scope is active). */
  rootId: string;
  /** Current level cap (-1 when no level scope is active). */
  maxLevel: number;
  /** The document's actual deepest level — the upper bound for the level input. */
  maxLevelPresent: number;
  /** All goals in the document, for the root-picker dropdown. */
  goals: ScopeGoalOption[];
}

export type NodeSizePresetValue = 'compact' | 'normal' | 'wide';

export interface NodeSizeControlModel {
  value: NodeSizePresetValue;
  /** Default preset — used to decide whether the panel opens by default. */
  default: NodeSizePresetValue;
}

export interface ControlsModel {
  spacing: SpacingControlModel;
  curvature: CurvatureControlModel;
  /** Omitted for notations without a scope filter (Activities). */
  scope?: ScopeControlModel;
  /** Omitted when the notation has no block-size preset (yet). */
  nodeSize?: NodeSizeControlModel;
}

/** Message posted from the webview to the host on every control change. */
export interface ControlMessage {
  type: 'transitrix:control';
  control: 'spacing' | 'curvature' | 'entryCurvature' | 'scope' | 'view' | 'nodeSize';
  /** spacing: 'horizontalGap'|'verticalGap'; scope: 'rootId'|'maxLevel'|'reset'; view: 'tree'|'table'; nodeSize: 'preset'; absent for curvature. */
  field?: 'horizontalGap' | 'verticalGap' | 'rootId' | 'maxLevel' | 'reset' | 'tree' | 'table' | 'preset';
  /** Numeric for spacing/curvature/maxLevel; string for rootId; absent for reset/view. */
  value?: number | string;
}

/** Snapshot-related message posted from webview to host. */
export interface SnapshotMessage {
  type: 'transitrix:snapshot';
  field: 'capture' | 'load';
  /** For 'load': the filename of the snapshot to load (e.g. "2026-06-20T143000Z.yaml"). */
  snapshot?: string;
}

/** Tree ↔ table view, persisted per notation (vkgeorgia/strategy#137). */
export type PreviewView = 'tree' | 'table';

// Spacing bounds mirror the package.json `transitrix.spacing.*` schema (20–300).
export const SPACING_MIN = 20;
export const SPACING_MAX = 300;
// Curvature bounds mirror `transitrix.curvature.*` (0–3).
export const CURVATURE_MIN = 0;
export const CURVATURE_MAX = 3;
export const CURVATURE_STEP = 0.1;

/** A CSP nonce: 128 bits of base64. Generated host-side, embedded in both the
 *  CSP `script-src` and the `<script nonce>` so the inline wiring script runs
 *  while everything else is blocked. */
export function genNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Maps a `transitrix.report.columnWidth` setting value to a pixel count.
 * 'narrow' → 80, 'normal' → 120, 'wide' → 200.
 */
export function colWidthPxFromSetting(setting: string): number {
  if (setting === 'narrow') return 80;
  if (setting === 'wide') return 200;
  return 120;
}

/** CSS :root block that injects --ts-col-w so report CSS can reference var(--ts-col-w). */
export function colWidthRootCss(px: number): string {
  return `:root { --ts-col-w: ${px}px; }`;
}


/** CSS for the control panel — injected into the frame's <style> only when interactive. */
export const CONTROLS_PANEL_CSS = `
.tx-ctl { margin: 8px 16px 0; font-size: 11px; color: var(--ts-text-muted, #64748b); border: 1px solid var(--ts-border, #cbd5e1); border-radius: 6px; }
.tx-ctl > summary { cursor: pointer; user-select: none; padding: 6px 10px; font-size: 12px; font-weight: 600; list-style: none; }
.tx-ctl > summary::-webkit-details-marker { display: none; }
.tx-ctl > summary::before { content: "\\25B8\\00a0"; }
.tx-ctl[open] > summary::before { content: "\\25BE\\00a0"; }
.tx-ctl-body { display: flex; flex-direction: column; gap: 8px; padding: 4px 12px 10px; }
.tx-ctl-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tx-ctl-row > .tx-ctl-label { flex: 0 0 70px; font-weight: 600; color: var(--ts-text, #0f172a); }
.tx-ctl-row label { display: inline-flex; align-items: center; gap: 4px; }
.tx-ctl input[type="number"] { width: 56px; }
.tx-ctl input[type="range"] { vertical-align: middle; }
.tx-ctl select { max-width: 220px; }
.tx-ctl input, .tx-ctl select, .tx-ctl button {
  font-size: 11px;
  font-family: var(--vscode-font-family, sans-serif);
  color: var(--vscode-input-foreground, #333);
  background: var(--vscode-input-background, #fff);
  border: 1px solid var(--vscode-input-border, var(--ts-border, #cbd5e1));
  border-radius: 3px;
  padding: 1px 4px;
}
.tx-ctl button { cursor: pointer; }
.tx-ctl output { min-width: 22px; font-variant-numeric: tabular-nums; }

/* View toggle (tree ↔ table) — a segmented control in the toolbar (#137).
   Mirrors the zoom control's look so the toolbar reads consistently. */
.tx-view { display: inline-flex; border: 1px solid var(--ts-border, #cbd5e1); border-radius: 4px; overflow: hidden; }
.tx-view-btn {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 1px 8px;
  color: var(--ts-text-muted, #64748b);
  background: transparent;
  border: none;
  border-right: 1px solid var(--ts-border, #cbd5e1);
  font-family: var(--vscode-font-family, sans-serif);
}
.tx-view-btn:last-child { border-right: none; }
.tx-view-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.tx-view-btn.active { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); font-weight: 600; }
`;

/** CSS for the snapshot toolbar button and the timeline navigator strip. */
export const SNAPSHOT_TOOLBAR_CSS = `
.tx-snap-btn {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  padding: 1px 8px;
  border-radius: 4px;
  color: var(--ts-text-muted, #64748b);
  background: transparent;
  border: 1px solid var(--ts-border, #cbd5e1);
  font-family: var(--vscode-font-family, sans-serif);
  white-space: nowrap;
}
.tx-snap-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.tx-timeline {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 4px 16px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--ts-text-muted, #64748b);
}
.tx-timeline-label { font-weight: 600; white-space: nowrap; }
.tx-timeline-marker {
  cursor: pointer;
  padding: 1px 6px;
  border-radius: 3px;
  border: 1px solid var(--ts-border, #cbd5e1);
  background: transparent;
  color: var(--ts-text-muted, #64748b);
  font-size: 10px;
  font-family: var(--vscode-font-family, sans-serif);
  white-space: nowrap;
}
.tx-timeline-marker:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
.tx-snap-info {
  margin: 4px 16px 0;
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid var(--ts-border, #cbd5e1);
  background: var(--ts-bg-subtle, #f8fafc);
  font-size: 11px;
  color: var(--ts-text-muted, #64748b);
}
`;

/** A snapshot marker entry for the timeline strip. */
export interface SnapshotMarker {
  /** Filename e.g. "2026-06-20T143000Z.yaml" */
  filename: string;
  /** Date portion for display e.g. "2026-06-20" */
  dateLabel: string;
}

/** Builds the "Capture…" button HTML for the toolbar. */
export function buildCaptureButton(): string {
  return `<button type="button" class="tx-snap-btn" data-tx-control="snapshot" data-tx-field="capture" title="Capture the current view state as a snapshot file">Capture…</button>`;
}

/** Builds the timeline marker strip HTML from a list of existing snapshots.
 *  Returns empty string when there are no snapshots. */
export function buildTimelineStrip(markers: SnapshotMarker[]): string {
  if (markers.length === 0) return '';
  const markerHtml = markers.map(m =>
    `<button type="button" class="tx-timeline-marker" data-tx-control="snapshot" data-tx-field="load" data-tx-snapshot="${escXml(m.filename)}" title="Jump to snapshot ${escXml(m.filename)}">${escXml(m.dateLabel)}</button>`
  ).join('');
  return `<div class="tx-timeline"><span class="tx-timeline-label">Snapshots:</span>${markerHtml}</div>`;
}

/** True when any control differs from its no-visual-change default. */
function hasNonDefault(model: ControlsModel): boolean {
  const s = model.spacing;
  if (s.horizontalGap !== s.defaults.horizontalGap || s.verticalGap !== s.defaults.verticalGap) return true;
  if (model.curvature.value !== model.curvature.default) return true;
  if (model.nodeSize && model.nodeSize.value !== model.nodeSize.default) return true;
  if (model.scope && (model.scope.rootId !== '' || model.scope.maxLevel >= 0)) return true;
  return false;
}

function spacingRow(s: SpacingControlModel): string {
  return `<div class="tx-ctl-row">
    <span class="tx-ctl-label">Spacing</span>
    <label title="Horizontal gap between columns (px)">H
      <input type="range" data-tx-control="spacing" data-tx-field="horizontalGap" data-tx-event="input" data-tx-output="tx-hgap-out"
        min="${SPACING_MIN}" max="${SPACING_MAX}" step="1" value="${s.horizontalGap}">
      <output id="tx-hgap-out">${s.horizontalGap}</output></label>
    <label title="Vertical gap between stacked nodes (px)">V
      <input type="range" data-tx-control="spacing" data-tx-field="verticalGap" data-tx-event="input" data-tx-output="tx-vgap-out"
        min="${SPACING_MIN}" max="${SPACING_MAX}" step="1" value="${s.verticalGap}">
      <output id="tx-vgap-out">${s.verticalGap}</output></label>
  </div>`;
}

function curvatureRow(c: CurvatureControlModel): string {
  return `<div class="tx-ctl-row">
    <span class="tx-ctl-label">Curvature</span>
    <input type="range" data-tx-control="curvature" data-tx-event="input" data-tx-output="tx-curv-out"
      min="${CURVATURE_MIN}" max="${CURVATURE_MAX}" step="${CURVATURE_STEP}" value="${c.value}">
    <output id="tx-curv-out">${c.value}</output>
  </div>`;
}

function scopeRow(sc: ScopeControlModel): string {
  const options = [`<option value="">— All goals —</option>`]
    .concat(sc.goals.map(g => {
      const selected = g.id === sc.rootId ? ' selected' : '';
      const label = g.name && g.name.trim() ? `${g.name} (${g.id})` : g.id;
      return `<option value="${escXml(g.id)}"${selected}>${escXml(label)}</option>`;
    }))
    .join('');
  // Level input is bounded to the document's deepest level. When the document
  // has no level information (maxLevelPresent <= 0) the cap can't trim anything,
  // so the input is disabled with a hint.
  const levelDisabled = sc.maxLevelPresent <= 0 ? ' disabled' : '';
  const levelValue = sc.maxLevel >= 0 ? String(sc.maxLevel) : '';
  return `<div class="tx-ctl-row">
    <span class="tx-ctl-label">Scope</span>
    <label title="Show only this goal's subtree (descendants), plus the factors / changes / activities that touch it">Root
      <select data-tx-control="scope" data-tx-field="rootId">${options}</select></label>
    <label title="Show only goals at or below this level${sc.maxLevelPresent > 0 ? ` (0–${sc.maxLevelPresent})` : ''}">Level
      <input type="number" data-tx-control="scope" data-tx-field="maxLevel"
        min="0" max="${Math.max(0, sc.maxLevelPresent)}" step="1" placeholder="off" value="${levelValue}"${levelDisabled}></label>
    <button type="button" data-tx-control="scope" data-tx-field="reset" title="Clear scope — show everything">Reset</button>
  </div>`;
}

function nodeSizeRow(ns: NodeSizeControlModel): string {
  const opt = (value: NodeSizePresetValue, label: string): string =>
    `<option value="${value}"${ns.value === value ? ' selected' : ''}>${label}</option>`;
  return `<div class="tx-ctl-row">
    <span class="tx-ctl-label">Size</span>
    <label title="Node size preset — scales width and height together">
      <select data-tx-control="nodeSize" data-tx-field="preset">${opt('compact', 'Compact')}${opt('normal', 'Normal')}${opt('wide', 'Wide')}</select>
    </label>
  </div>`;
}

/** Builds the `<details>` control-panel markup for a notation's interactive preview. */
export function buildControlsPanel(model: ControlsModel): string {
  const open = hasNonDefault(model) ? ' open' : '';
  const rows = [spacingRow(model.spacing), curvatureRow(model.curvature)];
  if (model.nodeSize) rows.push(nodeSizeRow(model.nodeSize));
  if (model.scope) rows.push(scopeRow(model.scope));
  return `<details id="tx-ctl" class="tx-ctl"${open}>
  <summary>Controls</summary>
  <div class="tx-ctl-body">
    ${rows.join('\n    ')}
  </div>
</details>`;
}

/** Builds the toolbar segmented control that switches the tree ↔ table view
 *  (#137). Wired by the same `data-tx-control` mechanism as the panel inputs —
 *  the buttons post `{control:'view', field:'tree'|'table'}` to the host. */
export function buildViewToggle(current: PreviewView): string {
  const btn = (view: PreviewView, label: string): string =>
    `<button type="button" class="tx-view-btn${current === view ? ' active' : ''}" data-tx-control="view" data-tx-field="${view}">${label}</button>`;
  return `<span class="tx-view" title="Switch between the tree and table view">${btn('tree', 'Tree')}${btn('table', 'Table')}</span>`;
}

/** Builds the nonce'd wiring `<script>`. Reads `data-tx-*` inputs, posts a
 *  ControlMessage or SnapshotMessage to the host on change, and persists the
 *  panel's open/closed state in webview state so a host-driven re-render
 *  doesn't collapse it. Also handles incoming `transitrix:snapshotLoaded`
 *  messages from the host to update the timeline info box. */
export function buildControlsScript(nonce: string): string {
  // Plain ES5-ish DOM script; runs inside the webview, not the Node host.
  return `<script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function post(control, field, value) {
    vscode.postMessage({ type: 'transitrix:control', control: control, field: field, value: value });
  }
  function sel(control, field) {
    return document.querySelector('[data-tx-control="' + control + '"][data-tx-field="' + field + '"]');
  }
  var nodes = document.querySelectorAll('[data-tx-control]');
  for (var i = 0; i < nodes.length; i++) {
    (function (el) {
      var control = el.getAttribute('data-tx-control');
      var field = el.getAttribute('data-tx-field');
      if (el.tagName === 'BUTTON') {
        el.addEventListener('click', function () {
          if (control === 'snapshot') {
            var snapshotName = el.getAttribute('data-tx-snapshot');
            vscode.postMessage({ type: 'transitrix:snapshot', field: field, snapshot: snapshotName !== null ? snapshotName : undefined });
          } else {
            post(control, field);
          }
        });
        return;
      }
      var outId = el.getAttribute('data-tx-output');
      if (outId) {
        var out = document.getElementById(outId);
        if (out) el.addEventListener('input', function () { out.value = el.value; });
      }
      var triggerEvt = el.getAttribute('data-tx-event') || 'change';
      el.addEventListener(triggerEvt, function () {
        if (control === 'scope' && field === 'rootId') {
          var v = el.value;
          if (v) { var lvl = sel('scope', 'maxLevel'); if (lvl) lvl.value = ''; }
          post(control, field, v);
        } else if (control === 'scope' && field === 'maxLevel') {
          if (el.value === '') { post(control, 'reset'); return; }
          var root = sel('scope', 'rootId'); if (root) root.value = '';
          post(control, field, num(el.value));
        } else if (control === 'curvature') {
          post(control, undefined, num(el.value));
        } else if (control === 'nodeSize') {
          post(control, field, el.value);
        } else {
          post(control, field, num(el.value));
        }
      });
    })(nodes[i]);
  }
  var det = document.getElementById('tx-ctl');
  if (det) {
    var st = vscode.getState() || {};
    if (st.txCtlOpen) det.open = true;
    det.addEventListener('toggle', function () {
      var s = vscode.getState() || {};
      s.txCtlOpen = det.open;
      vscode.setState(s);
    });
  }
  // Handle incoming snapshot-loaded messages from the host extension.
  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg && msg.type === 'transitrix:snapshotLoaded') {
      var box = document.getElementById('tx-snap-info');
      if (box) {
        var d = msg.content || {};
        box.textContent = 'Snapshot: ' + msg.filename + (d.captured_at_date ? ' · date: ' + d.captured_at_date : '') + ' · ' + (d.generated_at || '');
        box.style.display = 'block';
      }
    }
  });
}());
</script>`;
}
