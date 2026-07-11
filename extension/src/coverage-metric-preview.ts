import * as vscode from 'vscode';
import { escXml } from '@transitrix/diagrams/webview/render-util.js';
import yaml from 'js-yaml';
import { type ThemeId } from '@transitrix/diagrams/theme';
import {
  parseCoverageMetricConfig,
  buildCoverageMatrix,
  type CoverageMatrix,
  type CoverageRow,
  type RagStatus,
} from '@transitrix/diagrams/compliance/coverage-metric.js';
import { scanComplianceCanon, openComplianceFile } from './compliance-scan.js';
import type { ScannedCanon } from './compliance-scan.js';
import { buildDiagramFrame, OPEN_THEME_COMMAND } from './diagram-frame.js';

// Coverage-metric view preview — strategy#185.
//
// Renders a *.coverage-metric.transitrix.yaml file as a live webview table:
// rows = laws (codex entries in scope), columns = coverage stats + RAG status.
// The file-driven config pins which laws and products are in scope; the canon
// is scanned from the workspace on each refresh.

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshCoverageMetric';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

const RAG_LABELS: Record<RagStatus, string> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  no_data: 'No data',
};

function ragBadge(status: RagStatus): string {
  return `<span class="cm-rag cm-rag-${status}">${RAG_LABELS[status]}</span>`;
}

function buildRowHtml(row: CoverageRow): string {
  const barWidth = Math.round(row.coveragePct * 100);
  const bar =
    row.totalRequirements > 0
      ? `<div class="cm-bar-wrap"><div class="cm-bar cm-bar-${row.ragStatus}" style="width:${barWidth}%"></div><span class="cm-bar-label">${pct(row.coveragePct)}</span></div>`
      : '<span class="cm-muted">—</span>';

  return (
    '<tr>' +
    `<td class="cm-codex">${escXml(row.codexId)}</td>` +
    `<td class="cm-jur">${row.jurisdiction ? escXml(row.jurisdiction) : '<span class="cm-muted">—</span>'}</td>` +
    `<td class="cm-num">${row.totalRequirements}</td>` +
    `<td class="cm-num cm-compliant">${row.compliant}</td>` +
    `<td class="cm-num cm-partial">${row.partial}</td>` +
    `<td class="cm-num cm-non_compliant">${row.non_compliant}</td>` +
    `<td class="cm-num cm-under_review">${row.under_review}</td>` +
    `<td class="cm-num cm-gap">${row.gap}</td>` +
    `<td class="cm-coverage">${bar}</td>` +
    `<td class="cm-rag-cell">${ragBadge(row.ragStatus)}</td>` +
    '</tr>'
  );
}

function buildTableHtml(matrix: CoverageMatrix): string {
  if (matrix.rows.length === 0) {
    return '<div class="cm-empty"><p>No laws in scope. Add <code>regimes.include</code> or <code>regimes.filter</code> under the <code>view:</code> block, or the canon has no codex entries yet.</p></div>';
  }

  const rows = matrix.rows.map(buildRowHtml).join('');
  const threshLine = `Green ≥ ${pct(matrix.thresholds.green)} · Amber ≥ ${pct(matrix.thresholds.amber)}`;

  return (
    '<div class="cm-wrap">' +
    '<table class="cm-table">' +
    '<thead><tr>' +
    '<th>Law / Codex</th>' +
    '<th>Jurisdiction</th>' +
    '<th title="Total requirements derived from this law">Total</th>' +
    '<th class="cm-compliant" title="Requirements with a compliant assertion">Compliant</th>' +
    '<th class="cm-partial" title="Requirements with a partial assertion">Partial</th>' +
    '<th class="cm-non_compliant" title="Requirements with a non-compliant assertion">Non-compliant</th>' +
    '<th class="cm-under_review" title="Requirements under review">Under review</th>' +
    '<th class="cm-gap" title="Requirements with no assertion for scoped products">Gap</th>' +
    '<th>Coverage</th>' +
    '<th title="Coverage status against configured thresholds (green / amber / red)">Coverage Status</th>' +
    '</tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody>' +
    '</table>' +
    `<div class="cm-thresholds">${escXml(threshLine)}</div>` +
    '</div>'
  );
}

const COVERAGE_CSS = `
#canvas { padding: 0; }
.cm-wrap { padding: 16px 20px 24px; overflow-x: auto; }
.cm-table { border-collapse: collapse; font-size: 12px; width: 100%; }
.cm-table th, .cm-table td { border: 1px solid var(--ts-border, #cbd5e1); padding: 6px 10px; text-align: left; }
.cm-table thead th { background: var(--ts-bg-subtle, #f1f5f9); font-weight: 600; font-size: 11px; white-space: nowrap; }
.cm-codex { font-family: var(--vscode-editor-font-family, monospace); font-size: 11px; color: var(--ts-text-muted, #64748b); white-space: nowrap; }
.cm-jur { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
.cm-num { text-align: right; min-width: 50px; }
.cm-muted { color: var(--ts-text-muted, #64748b); }
.cm-compliant { color: var(--ts-status-success-fg, #065f46); }
.cm-partial { color: var(--ts-status-warning-fg, #854d0e); }
.cm-non_compliant { color: var(--ts-status-error-fg, #991b1b); }
.cm-under_review { color: var(--ts-status-info-fg, #0c4a6e); }
.cm-gap { color: var(--ts-text-muted, #64748b); }
.cm-coverage { min-width: var(--ts-col-w, 140px); }
.cm-bar-wrap { display: flex; align-items: center; gap: 8px; }
.cm-bar { height: 10px; border-radius: 5px; min-width: 2px; }
.cm-bar-green { background: var(--ts-status-success-bg, #d1fae5); outline: 1px solid var(--ts-status-success-fg, #065f46); }
.cm-bar-amber { background: var(--ts-status-warning-bg, #fef9c3); outline: 1px solid var(--ts-status-warning-fg, #854d0e); }
.cm-bar-red { background: var(--ts-status-error-bg, #fee2e2); outline: 1px solid var(--ts-status-error-fg, #991b1b); }
.cm-bar-no_data { background: var(--ts-bg-subtle, #e2e8f0); }
.cm-bar-label { font-size: 11px; font-weight: 600; white-space: nowrap; }
.cm-rag { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 700; white-space: nowrap; }
.cm-rag-green { color: var(--ts-status-success-fg, #065f46); background: var(--ts-status-success-bg, #d1fae5); }
.cm-rag-amber { color: var(--ts-status-warning-fg, #854d0e); background: var(--ts-status-warning-bg, #fef9c3); }
.cm-rag-red { color: var(--ts-status-error-fg, #991b1b); background: var(--ts-status-error-bg, #fee2e2); }
.cm-rag-no_data { color: var(--ts-text-muted, #64748b); background: var(--ts-bg-subtle, #f1f5f9); }
.cm-thresholds { margin-top: 10px; font-size: 11px; color: var(--ts-text-muted, #64748b); }
.cm-empty { padding: 40px 24px; color: var(--ts-text-muted, #64748b); }
.cm-empty code { background: var(--ts-bg-subtle, #f1f5f9); padding: 1px 4px; border-radius: 3px; }
`;

export class CoverageMetricPreview {
  readonly panelTitle = 'Coverage Metric Preview';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'coverageMetricPreview',
        `${this.panelTitle} — ${doc.uri.path.split('/').pop() ?? ''}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND, 'transitrixStudio.changeTheme'],
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.trackedUri = undefined;
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    }
    await this.pushDocument(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (this.panel && this.trackedUri === doc.uri.toString()) {
      await this.pushDocument(doc);
    }
  }

  async refreshConfig(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.pushDocument(doc);
  }

  private async pushDocument(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const filename = doc.uri.path.split('/').pop() ?? '';
    this.panel.webview.html = await this.buildHtml(doc.getText(), filename);
  }

  private async buildHtml(yamlText: string, filename = ''): Promise<string> {
    const cfg = vscode.workspace.getConfiguration('transitrix');
    const themeId = cfg.get<ThemeId>('theme', 'transitrix');
    const colW = cfg.get<string>('report.columnWidth', 'normal');
    const colWPx = colW === 'narrow' ? 80 : colW === 'wide' ? 200 : 120;

    let bodyHtml: string;
    let titleLine = '';
    let subtitleLine = '';
    let metaDate = '';
    let warnings: string[] = [];
    let errorMsg = '';

    try {
      const parsed = yaml.load(yamlText) as unknown;
      // root.name / root.generated_at take priority per CONTRACT §1.1.
      if (parsed && typeof parsed === 'object') {
        const raw = parsed as Record<string, unknown>;
        if (typeof raw['name'] === 'string') titleLine = escXml(raw['name']);
        if (typeof raw['description'] === 'string') subtitleLine = escXml(raw['description'].trim());
        const genAt = typeof raw['generated_at'] === 'string' ? raw['generated_at'] : undefined;
        metaDate = genAt ?? (typeof raw['date'] === 'string' ? raw['date'] : '');
      }
      const r = parseCoverageMetricConfig(parsed);
      if (!r.ok) {
        errorMsg = 'Parse errors:\n' + r.errors.join('\n');
        bodyHtml = '';
        if (!titleLine) titleLine = 'Coverage Metric — parse error';
      } else {
        const config = r.config;
        if (!titleLine) titleLine = escXml(config.name);
        if (!subtitleLine && config.description) subtitleLine = escXml(config.description.trim());
        if (config.warnings) warnings = config.warnings;
        const canon: ScannedCanon = await scanComplianceCanon();
        const matrix = buildCoverageMatrix(canon, config);
        bodyHtml = buildTableHtml(matrix);
      }
    } catch (e) {
      errorMsg = (e as Error).message ?? 'Unknown error';
      bodyHtml = '';
      titleLine = 'Coverage Metric — error';
    }

    return buildDiagramFrame({
      notation: 'Coverage metric',
      filename,
      title: titleLine || undefined,
      subtitle: subtitleLine || undefined,
      date: metaDate || new Date().toISOString().slice(0, 10),
      themeId,
      errorMsg,
      warnings,
      bodyContent: bodyHtml,
      themeCommand: OPEN_THEME_COMMAND,
      refreshCommand: REFRESH_COMMAND,
      extraStyles: `:root { --ts-col-w: ${colWPx}px; }\n${COVERAGE_CSS}`,
    });
  }
}
