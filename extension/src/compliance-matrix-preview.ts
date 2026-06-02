import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { generateWebviewCss, type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import {
  buildComplianceMatrix,
  filterComplianceMatrix,
  type ComplianceMatrix,
  type MatrixAssertionRef,
  type MatrixFilter,
  type MatrixProduct,
  type MatrixRequirement,
} from '../../packages/diagrams/src/compliance-matrix/index.js';
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';
import { genNonce } from './preview-controls.js';

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

const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  n_a: 'N/A',
};
const ALL_STATUSES: AssertionStatus[] = ['compliant', 'partial', 'non_compliant', 'under_review', 'n_a'];
const ALL_SEVERITIES = ['high', 'medium', 'low'];

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshComplianceMatrix';

function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ScanResult {
  products: MatrixProduct[];
  requirements: MatrixRequirement[];
  assertions: MatrixAssertionRef[];
  /** assertion id → workspace file path, for cell click-to-open. */
  assertionPaths: Map<string, string>;
}

export class ComplianceMatrixPreview {
  readonly panelTitle = 'Compliance Matrix';
  private panel: vscode.WebviewPanel | undefined;
  private fullMatrix: ComplianceMatrix | undefined;
  private assertionPaths = new Map<string, string>();
  private filter: MatrixFilter = {};

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
    const scan = await this.scanWorkspace();
    this.assertionPaths = scan.assertionPaths;
    this.fullMatrix = buildComplianceMatrix({
      products: scan.products,
      requirements: scan.requirements,
      assertions: scan.assertions,
    });
    this.render();
  }

  /** Open the file backing an assertion cell. */
  async openFile(fsPath: string): Promise<void> {
    if (!fsPath) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
  }

  private async onMessage(m: { type?: string; statuses?: string[]; severities?: string[] }): Promise<void> {
    if (m?.type !== 'transitrix:matrix-filter') return;
    this.filter = {
      statuses: (m.statuses ?? []).filter((s): s is AssertionStatus => (ALL_STATUSES as string[]).includes(s)),
      severities: (m.severities ?? []).filter(s => ALL_SEVERITIES.includes(s)),
    };
    this.render();
  }

  private async scanWorkspace(): Promise<ScanResult> {
    const products: MatrixProduct[] = [];
    const requirements: MatrixRequirement[] = [];
    const assertions: MatrixAssertionRef[] = [];
    const assertionPaths = new Map<string, string>();

    const uris = await vscode.workspace.findFiles('**/*.{yaml,yml}', '**/node_modules/**', 5000);
    for (const uri of uris) {
      let doc: Record<string, unknown> | undefined;
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const parsed = yaml.load(Buffer.from(bytes).toString('utf-8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) doc = parsed as Record<string, unknown>;
      } catch {
        continue; // unparseable / unreadable — skip
      }
      if (!doc || typeof doc.id !== 'string') continue;

      if (doc.notation === 'product') {
        products.push({ id: doc.id, name: typeof doc.name === 'string' ? doc.name : doc.id });
      } else if (doc.notation === 'requirement') {
        requirements.push({
          id: doc.id,
          name: typeof doc.name === 'string' ? doc.name : doc.id,
          severity: typeof doc.severity === 'string' ? doc.severity : undefined,
        });
      } else if (doc.notation === 'assertion') {
        if (typeof doc.about === 'string' && typeof doc.subject === 'string' && typeof doc.status === 'string') {
          assertions.push({
            id: doc.id,
            about: doc.about,
            subject: doc.subject,
            status: doc.status as AssertionStatus,
            assessed_at: typeof doc.assessed_at === 'string' ? doc.assessed_at : undefined,
            next_review_at: typeof doc.next_review_at === 'string' ? doc.next_review_at : undefined,
          });
          assertionPaths.set(doc.id, uri.fsPath);
        }
      }
    }
    return { products, requirements, assertions, assertionPaths };
  }

  private render(): void {
    if (!this.panel || !this.fullMatrix) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    const matrix = filterComplianceMatrix(this.fullMatrix, this.filter);
    this.panel.webview.html = this.buildHtml(matrix, themeId);
  }

  private buildHtml(matrix: ComplianceMatrix, themeId: ThemeId): string {
    const nonce = genNonce();
    const { products, requirements, summary } = matrix;

    const empty = requirements.length === 0 || products.length === 0;
    const body = empty
      ? `<div class="cm-empty">
          <p>No compliance matrix to show.</p>
          <p>This view needs <code>notation: product</code>, <code>notation: requirement</code> and
             <code>notation: assertion</code> files in the workspace. None of one or more were found
             (${summary.products} products, ${summary.requirements} requirements).</p>
        </div>`
      : this.gridHtml(matrix);

    const filterStatuses = new Set(this.filter.statuses ?? []);
    const filterSeverities = new Set(this.filter.severities ?? []);
    const statusBoxes = ALL_STATUSES.map(s =>
      `<label class="cm-chip"><input type="checkbox" data-cm-status="${s}"${filterStatuses.has(s) ? ' checked' : ''}> ${escXml(STATUS_LABELS[s])}</label>`,
    ).join('');
    const severityBoxes = ALL_SEVERITIES.map(s =>
      `<label class="cm-chip"><input type="checkbox" data-cm-severity="${s}"${filterSeverities.has(s) ? ' checked' : ''}> ${escXml(s)}</label>`,
    ).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <style>
${generateWebviewCss(themeId)}
${MATRIX_CSS}
  </style>
</head>
<body data-theme="${escXml(themeId)}">
  <div id="cm-toolbar">
    <div class="cm-title">Compliance Matrix</div>
    <div class="cm-summary">${summary.products} products × ${summary.requirements} requirements · <strong>${summary.gaps}</strong> gaps · ${summary.assertions} claims shown</div>
    <a href="command:${REFRESH_COMMAND}" class="cm-btn" title="Re-scan the workspace">Refresh</a>
  </div>
  <div id="cm-filters">
    <span class="cm-filter-label">Status</span>${statusBoxes}
    <span class="cm-filter-label">Severity</span>${severityBoxes}
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
  document.querySelectorAll('[data-cm-status],[data-cm-severity]').forEach(function (el) {
    el.addEventListener('change', function () {
      vscode.postMessage({ type: 'transitrix:matrix-filter', statuses: collect('status'), severities: collect('severity') });
    });
  });
}());
  </script>
</body>
</html>`;
  }

  private gridHtml(matrix: ComplianceMatrix): string {
    const { products, requirements, cells } = matrix;
    const head = `<tr>
      <th class="cm-corner"></th>
      ${requirements.map(r => `<th class="cm-col" title="${escXml(r.id)}${r.severity ? ` · severity: ${escXml(r.severity)}` : ''}"><div class="cm-col-name">${escXml(r.name)}</div>${r.severity ? `<div class="cm-col-sev cm-sev-${escXml(r.severity)}">${escXml(r.severity)}</div>` : ''}</th>`).join('')}
    </tr>`;

    const rows = products.map((p, ri) => {
      const cellsHtml = requirements.map((_r, ci) => {
        const cell = cells[ri][ci];
        if (cell.status === undefined) {
          return `<td class="cm-cell cm-gap" title="No assertion — compliance gap"></td>`;
        }
        const meta = [
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
#cm-grid-wrap { overflow: auto; padding: 12px 16px 24px; }
#cm-grid { border-collapse: collapse; font-size: 12px; }
#cm-grid th, #cm-grid td { border: 1px solid var(--ts-border, #cbd5e1); }
.cm-corner { background: transparent; border: none; }
.cm-col { padding: 6px 10px; vertical-align: bottom; text-align: left; background: var(--ts-bg-subtle, #f1f5f9); min-width: 90px; max-width: 160px; }
.cm-col-name { font-weight: 600; color: var(--ts-text, #0f172a); }
.cm-col-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 2px; }
.cm-sev-high { color: #b91c1c; }
.cm-sev-medium { color: #b45309; }
.cm-sev-low { color: #2563eb; }
.cm-row { padding: 6px 12px; text-align: left; font-weight: 600; color: var(--ts-text, #0f172a); background: var(--ts-bg-subtle, #f1f5f9); white-space: nowrap; position: sticky; left: 0; }
.cm-unresolved { color: #b45309; }
.cm-cell { width: 110px; height: 38px; text-align: center; vertical-align: middle; }
.cm-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.cm-cell-link { text-decoration: none; }
.cm-gap { background: repeating-linear-gradient(45deg, transparent, transparent 5px, var(--ts-bg-subtle, #f1f5f9) 5px, var(--ts-bg-subtle, #f1f5f9) 10px); }
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
.cm-empty { padding: 40px 24px; color: var(--ts-text-muted, #64748b); max-width: 640px; }
.cm-empty code { background: var(--ts-bg-subtle, #f1f5f9); padding: 1px 4px; border-radius: 3px; }
`;
