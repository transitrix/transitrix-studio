import * as vscode from 'vscode';
import { generateWebviewCss, type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import {
  buildComplianceMatrix,
  filterComplianceMatrix,
  type ComplianceMatrix,
  type MatrixFilter,
} from '../../packages/diagrams/src/compliance-matrix/index.js';
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';
import { genNonce, colWidthPxFromSetting, colWidthRootCss } from './preview-controls.js';
import { scanComplianceCanon } from './compliance-scan.js';
import type { ScannedCanon } from './compliance-scan.js';
import { ERROR_BLOCK_CSS, buildErrorHtml, WARN_BLOCK_CSS, buildWarnHtml } from './diagram-frame.js';

// Compliance matrix preview (vkgeorgia/strategy#84 Phase 2).
//
// A repo-wide view (not bound to a file): scans the workspace for the canon
// artefacts that carry `notation: product | requirement | assertion`, builds the
// Products × Requirements matrix, and renders it as a colour-coded grid where
// gaps (no assertion) are visually obvious.
//
// Scripts are enabled under the same strict nonce CSP as the other interactive
// previews (the 2026-06-02 posture call), used only by the inline filter script.
// Cell click-to-open uses command URIs; hover uses native title tooltips.

// Statuses the compliance matrix recognises as filed claims. Assertions with
// any other status (e.g. 'proposed') are excluded from the matrix cells and
// tracked separately so gaps can surface an F17 "N pending" badge.
const ADMITTED_STATUSES = new Set<string>(['compliant', 'partial', 'non_compliant', 'under_review', 'pending_owner', 'n_a']);

function pendingKey(requirementId: string, productId: string): string {
  return requirementId + '\x00' + productId;
}

function buildPendingIndex(scan: ScannedCanon): Map<string, number> {
  const pending = new Map<string, number>();
  for (const a of scan.assertions) {
    if (ADMITTED_STATUSES.has(a.status)) continue;
    const k = pendingKey(a.about, a.subject);
    pending.set(k, (pending.get(k) ?? 0) + 1);
  }
  return pending;
}

const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  pending_owner: 'Pending owner',
  n_a: 'N/A',
};
const ALL_STATUSES: AssertionStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review', 'pending_owner', 'n_a'];
const ALL_SEVERITIES = ['high', 'medium', 'low'];

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshComplianceMatrix';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Union of jurisdictions resolved across the matrix's columns, sorted. */
function collectJurisdictions(matrix: ComplianceMatrix): string[] {
  const out = new Set<string>();
  for (const r of matrix.requirements) {
    for (const j of r.jurisdictions ?? []) out.add(j);
  }
  return [...out].sort();
}

export class ComplianceMatrixPreview {
  readonly panelTitle = 'Compliance Matrix';
  private panel: vscode.WebviewPanel | undefined;
  private fullMatrix: ComplianceMatrix | undefined;
  private assertionPaths = new Map<string, string>();
  private pendingIndex = new Map<string, number>();
  private filter: MatrixFilter = {};
  private colWidth: string = vscode.workspace.getConfiguration('transitrix').get<string>('report.columnWidth', 'normal');
  private errorMsg = '';
  private skippedWarnings: string[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  async showOrReveal(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'complianceMatrixPreview',
        this.panelTitle,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
          enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND],
        },
      );
      this.panel.webview.onDidReceiveMessage((m) => { void this.onMessage(m); });
      this.panel.onDidDispose(() => { this.panel = undefined; this.fullMatrix = undefined; });
    } else {
      this.panel.reveal(vscode.ViewColumn.Active, false);
    }
    await this.refresh();
  }

  /** Re-scan the workspace and re-render. */
  async refresh(): Promise<void> {
    if (!this.panel) return;
    try {
      const scan = await scanComplianceCanon();
      this.assertionPaths = scan.pathById;
      this.skippedWarnings = (scan.skippedNotations ?? []).map(
        s => 'Skipped — unrecognized notation "' + s.notation + '": ' + s.shortPath,
      );
      this.pendingIndex = buildPendingIndex(scan);
      this.fullMatrix = buildComplianceMatrix({
        products: scan.products,
        requirements: scan.requirements.map(r => ({
          id: r.id, name: r.name, severity: r.severity, derived_from: r.derived_from,
        })),
        assertions: scan.assertions.filter(a => ADMITTED_STATUSES.has(a.status)),
        codex: scan.codex.map(c => ({ id: c.id, jurisdiction: c.jurisdiction })),
      });
      this.errorMsg = '';
    } catch (e) {
      this.errorMsg = (e as Error).message ?? 'Unknown error';
      this.skippedWarnings = [];
    }
    this.render();
  }

  private async onMessage(m: {
    type?: string; statuses?: string[]; severities?: string[]; jurisdictions?: string[]; columnWidth?: string;
  }): Promise<void> {
    if (m?.type === 'transitrix:col-width') {
      const w = m.columnWidth;
      if (w === 'narrow' || w === 'normal' || w === 'wide') {
        this.colWidth = w;
        void vscode.workspace.getConfiguration('transitrix').update('report.columnWidth', w, vscode.ConfigurationTarget.Workspace);
      }
      this.render();
      return;
    }
    if (m?.type !== 'transitrix:matrix-filter') return;
    this.filter = {
      statuses: (m.statuses ?? []).filter((s): s is AssertionStatus => (ALL_STATUSES as string[]).includes(s)),
      severities: (m.severities ?? []).filter(s => ALL_SEVERITIES.includes(s)),
      jurisdictions: (m.jurisdictions ?? []).filter(j => typeof j === 'string' && j.length > 0),
    };
    this.render();
  }

  private render(): void {
    if (!this.panel) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const matrix = this.fullMatrix ? filterComplianceMatrix(this.fullMatrix, this.filter) : undefined;
    this.panel.webview.html = this.buildHtml(matrix, themeId);
  }

  private buildHtml(matrix: ComplianceMatrix | undefined, themeId: ThemeId): string {
    const nonce = genNonce();
    const { input: errInput, block: errBlock } = buildErrorHtml(this.errorMsg);
    const { input: warnInput, block: warnBlock } = buildWarnHtml(this.skippedWarnings);

    const summary = matrix?.summary ?? { products: 0, requirements: 0, gaps: 0, assertions: 0 };
    const empty = !matrix || matrix.requirements.length === 0 || matrix.products.length === 0;
    const body = this.errorMsg
      ? '<div class="cm-empty"><p>Scan failed — see error above.</p></div>'
      : empty
      ? `<div class="cm-empty">
          <p>No compliance matrix to show.</p>
          <p>This view needs <code>notation: product</code>, <code>notation: requirement</code> and
             <code>notation: assertion</code> files in the workspace. None of one or more were found
             (${summary.products} products, ${summary.requirements} requirements).</p>
        </div>`
      : this.gridHtml(matrix!);

    const filterStatuses = new Set(this.filter.statuses ?? []);
    const filterSeverities = new Set(this.filter.severities ?? []);
    const filterJurisdictions = new Set(this.filter.jurisdictions ?? []);
    const statusBoxes = ALL_STATUSES.map(s =>
      `<label class="cm-chip"><input type="checkbox" data-cm-status="${s}"${filterStatuses.has(s) ? ' checked' : ''}> ${escXml(STATUS_LABELS[s])}</label>`,
    ).join('');
    const severityBoxes = ALL_SEVERITIES.map(s =>
      `<label class="cm-chip"><input type="checkbox" data-cm-severity="${s}"${filterSeverities.has(s) ? ' checked' : ''}> ${escXml(s)}</label>`,
    ).join('');

    // Jurisdiction chips come from the union of jurisdictions resolved on the
    // full matrix's columns. Hidden entirely when no requirement resolved one
    // (e.g. no codex files in the workspace) so the toolbar doesn't claim a
    // dimension that has no values.
    const jurisdictionUniverse = this.fullMatrix ? collectJurisdictions(this.fullMatrix) : [];
    const jurisdictionBoxes = jurisdictionUniverse.map(j =>
      `<label class="cm-chip"><input type="checkbox" data-cm-jurisdiction="${escXml(j)}"${filterJurisdictions.has(j) ? ' checked' : ''}> ${escXml(j)}</label>`,
    ).join('');
    const jurisdictionRow = jurisdictionUniverse.length
      ? `<span class="cm-filter-label">Jurisdiction</span>${jurisdictionBoxes}`
      : '';

    const colWCss = colWidthRootCss(colWidthPxFromSetting(this.colWidth));
    const colWidthSelect =
      `<span class="cm-filter-label">Columns</span>` +
      `<select data-cm-col-width class="cm-col-width-select">` +
      ['narrow', 'normal', 'wide'].map(w =>
        `<option value="${w}"${this.colWidth === w ? ' selected' : ''}>${w.charAt(0).toUpperCase()}${w.slice(1)}</option>`
      ).join('') +
      `</select>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
${colWCss}
${generateWebviewCss(themeId)}
${MATRIX_CSS}
${ERROR_BLOCK_CSS}
${WARN_BLOCK_CSS}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  ${errInput}${warnInput}
  <div id="cm-toolbar">
    <div class="cm-title">Compliance Matrix</div>
    <div class="cm-summary">${summary.products} products × ${summary.requirements} requirements · <strong>${summary.gaps}</strong> gaps · ${summary.assertions} claims shown</div>
    <a href="command:${REFRESH_COMMAND}" class="cm-btn" title="Re-scan the workspace">Refresh</a>
  </div>
  ${errBlock}${warnBlock}
  <div id="cm-filters">
    <span class="cm-filter-label">Status</span>${statusBoxes}
    <span class="cm-filter-label">Severity</span>${severityBoxes}
    ${jurisdictionRow}
    ${colWidthSelect}
  </div>
  ${body}
  <script nonce="${nonce}">
(function () {
  var vscode = acquireVsCodeApi();
  function collect(attr) {
    var out = [];
    document.querySelectorAll('[data-cm-' + attr + ']').forEach(function (el) {
      if (el.checked) out.push(el.getAttribute('data-cm-' + attr));
    });
    return out;
  }
  document.querySelectorAll('[data-cm-status],[data-cm-severity],[data-cm-jurisdiction]').forEach(function (el) {
    el.addEventListener('change', function () {
      vscode.postMessage({
        type: 'transitrix:matrix-filter',
        statuses: collect('status'),
        severities: collect('severity'),
        jurisdictions: collect('jurisdiction'),
      });
    });
  });
  var colWidthSel = document.querySelector('[data-cm-col-width]');
  if (colWidthSel) {
    colWidthSel.addEventListener('change', function () {
      vscode.postMessage({ type: 'transitrix:col-width', columnWidth: colWidthSel.value });
    });
  }
}());
  </script>
</body>
</html>`;
  }

  private gridHtml(matrix: ComplianceMatrix): string {
    const { products, requirements, cells } = matrix;
    const head = `<tr>
      <th class="cm-corner"></th>
      ${requirements.map(r => {
        const js = r.jurisdictions ?? [];
        const titleParts = [
          escXml(r.id),
          r.severity ? `severity: ${escXml(r.severity)}` : null,
          js.length ? `jurisdiction: ${escXml(js.join(', '))}` : null,
        ].filter(Boolean).join(' · ');
        const jBadge = js.length
          ? `<div class="cm-col-jur">${js.map(j => `<span class="cm-jur-chip">${escXml(j)}</span>`).join(' ')}</div>`
          : '';
        return `<th class="cm-col" title="${titleParts}"><div class="cm-col-name">${escXml(r.name)}</div>${r.severity ? `<div class="cm-col-sev cm-sev-${escXml(r.severity)}">${escXml(r.severity)}</div>` : ''}${jBadge}</th>`;
      }).join('')}
    </tr>`;

    const rows = products.map((p, ri) => {
      const cellsHtml = requirements.map((r, ci) => {
        const cell = cells[ri][ci];
        const oblRef = r.name !== r.id ? `${r.id} — ${r.name}` : r.id;
        if (cell.status === undefined) {
          const pendingCount = this.pendingIndex.get(pendingKey(r.id, p.id)) ?? 0;
          if (pendingCount > 0) {
            return `<td class="cm-cell cm-gap cm-pending" title="${escXml(oblRef)} · ${pendingCount} assertion(s) pending admission"><span class="cm-badge-pending">${pendingCount} pending</span></td>`;
          }
          return `<td class="cm-cell cm-gap" title="${escXml(oblRef)} · No assertion (compliance gap)"></td>`;
        }
        const meta = [
          oblRef,
          STATUS_LABELS[cell.status],
          cell.assessed_at ? `assessed ${cell.assessed_at}` : null,
          cell.next_review_at ? `review by ${cell.next_review_at}` : null,
        ].filter(Boolean).join(' · ');
        const fsPath = cell.assertionId ? this.assertionPaths.get(cell.assertionId) : undefined;
        const inner = `<span class="cm-badge">${escXml(STATUS_LABELS[cell.status])}</span>`;
        const content = fsPath
          ? `<a class="cm-cell-link" href="command:${OPEN_FILE_COMMAND}?${encodeURIComponent(JSON.stringify([fsPath]))}" title="${escXml(meta)} — open ${escXml(cell.assertionId ?? '')}">${inner}</a>`
          : `<span title="${escXml(meta)}">${inner}</span>`;
        return `<td class="cm-cell cm-${cell.status}">${content}</td>`;
      }).join('');
      const rowName = `<th class="cm-row" title="${escXml(p.id)}">${escXml(p.name)}${p.unresolved ? ' <span class="cm-unresolved" title="No product element file resolves this subject">⚠</span>' : ''}</th>`;
      return `<tr>${rowName}${cellsHtml}</tr>`;
    }).join('');

    return `<div id="cm-grid-wrap"><table id="cm-grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  }
}

const MATRIX_CSS = `
body { padding: 0; }
#cm-toolbar { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid var(--ts-border, #cbd5e1); flex-wrap: wrap; }
.cm-title { font-size: 14px; font-weight: 700; color: var(--ts-text, #0f172a); }
.cm-summary { font-size: 12px; color: var(--ts-text-muted, #64748b); }
.cm-summary strong { color: var(--ts-text, #0f172a); }
.cm-btn { font-size: 11px; padding: 2px 10px; border-radius: 4px; color: var(--ts-text-muted, #64748b); text-decoration: none; border: 1px solid var(--ts-border, #cbd5e1); }
.cm-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
#cm-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 16px; border-bottom: 1px solid var(--ts-border, #cbd5e1); font-size: 11px; }
.cm-filter-label { font-weight: 600; color: var(--ts-text, #0f172a); margin-left: 8px; }
.cm-filter-label:first-child { margin-left: 0; }
.cm-chip { display: inline-flex; align-items: center; gap: 4px; color: var(--ts-text-muted, #64748b); }
.cm-col-width-select { font-size: 11px; font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-input-foreground, #333); background: var(--vscode-input-background, #fff); border: 1px solid var(--vscode-input-border, var(--ts-border, #cbd5e1)); border-radius: 3px; padding: 1px 4px; }
#cm-grid-wrap { overflow: auto; padding: 12px 16px 24px; }
#cm-grid { border-collapse: collapse; font-size: 12px; }
#cm-grid th, #cm-grid td { border: 1px solid var(--ts-border, #cbd5e1); }
.cm-corner { background: transparent; border: none; }
.cm-col { padding: 6px 10px; vertical-align: bottom; text-align: left; background: var(--ts-bg-subtle, #f1f5f9); min-width: var(--ts-col-w, 120px); width: var(--ts-col-w, 120px); }
.cm-col-name { font-weight: 600; color: var(--ts-text, #0f172a); }
.cm-col-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
.cm-col-jur { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 3px; }
.cm-jur-chip { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 10px; color: var(--ts-text-muted, #64748b); background: var(--ts-bg-elevated, #e2e8f0); text-transform: uppercase; letter-spacing: 0.04em; }
.cm-sev-high { color: #b91c1c; }
.cm-sev-medium { color: #b45309; }
.cm-sev-low { color: #2563eb; }
.cm-row { padding: 6px 12px; text-align: left; font-weight: 600; color: var(--ts-text, #0f172a); background: var(--ts-bg-subtle, #f1f5f9); white-space: nowrap; position: sticky; left: 0; }
.cm-unresolved { color: #b45309; }
.cm-cell { width: var(--ts-col-w, 120px); height: 38px; text-align: center; vertical-align: middle; }
.cm-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.cm-cell-link { text-decoration: none; }
.cm-gap { background: repeating-linear-gradient(45deg, transparent, transparent 5px, var(--ts-bg-subtle, #f1f5f9) 5px, var(--ts-bg-subtle, #f1f5f9) 10px); }
.cm-pending { background: #fef9c3; border: 1px dashed #b45309 !important; }
.cm-badge-pending { display: inline-block; padding: 2px 6px; border-radius: 8px; font-size: 10px; font-weight: 600; color: #b45309; background: #fef9c3; }
.cm-compliant { background: var(--ts-status-success-bg, #d1fae5); }
.cm-compliant .cm-badge { color: var(--ts-status-success-fg, #065f46); }
.cm-partial { background: var(--ts-status-warning-bg, #fef9c3); }
.cm-partial .cm-badge { color: var(--ts-status-warning-fg, #854d0e); }
.cm-non_compliant { background: var(--ts-status-error-bg, #fee2e2); }
.cm-non_compliant .cm-badge { color: var(--ts-status-error-fg, #991b1b); }
.cm-under_review { background: var(--ts-status-info-bg, #e0f2fe); }
.cm-under_review .cm-badge { color: var(--ts-status-info-fg, #0c4a6e); }
.cm-n_a { background: var(--ts-bg-subtle, #f1f5f9); }
.cm-n_a .cm-badge { color: var(--ts-text-muted, #64748b); }
.cm-pending_owner { background: #f3e8ff; }
.cm-pending_owner .cm-badge { color: #6b21a8; }
.cm-empty { padding: 40px 24px; color: var(--ts-text-muted, #64748b); max-width: 640px; }
.cm-empty code { background: var(--ts-bg-subtle, #f1f5f9); padding: 1px 4px; border-radius: 3px; }
`;
