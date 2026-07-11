import * as path from 'node:path';
import * as vscode from 'vscode';
import { type ThemeId } from '@transitrix/diagrams/theme';
import { buildComplianceIndex, buildGapReport, scoreComplianceView, type GapReport } from '@transitrix/diagrams/compliance';
import { scanComplianceCanon } from './compliance-scan.js';
import { complianceShell, deadlineBadge, escXml, openLink, statusBadge } from './compliance-render.js';
import type { ViewScore } from '@transitrix/diagrams/confidence';

// Gap dashboard (vkgeorgia/strategy#84 Phase 4). A repo-wide operational view
// for compliance owners: requirements with no assertion, assertions with a
// positive status but no evidence (ASSERT-007), and stale assertions past their
// review date (ASSERT-008). Read-only, script-less; click-to-open via command
// URIs. Reuses the shared scan + reverse-index + gap-report.

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshGapDashboard';
const EXPORT_CSV_COMMAND = 'transitrixStudio.exportGapDashboardCsv';

/** Today as ISO YYYY-MM-DD (extension host clock; the library stays clock-free). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class GapDashboardPreview {
  readonly panelTitle = 'Compliance Gap Dashboard Preview';
  private panel: vscode.WebviewPanel | undefined;
  private lastReport: GapReport | undefined;
  private lastConfidence: ViewScore | undefined;
  private pathById = new Map<string, string>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  async showOrReveal(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'gapDashboardPreview',
        this.panelTitle,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        { enableScripts: false, retainContextWhenHidden: true, enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND, EXPORT_CSV_COMMAND, 'transitrixStudio.changeTheme'] },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.lastReport = undefined; });
    } else {
      this.panel.reveal(vscode.ViewColumn.Active, false);
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    const scan = await scanComplianceCanon();
    this.pathById = scan.pathById;
    const index = buildComplianceIndex({ requirements: scan.requirements, assertions: scan.assertions });
    const today = todayIso();
    this.lastReport = buildGapReport(index, { today });
    // Confidence across the full scanned canon — the dashboard's "view" is
    // every requirement + assertion in the repo (CONTRACT §11.6).
    this.lastConfidence = scoreComplianceView(scan.requirements, scan.assertions, today);
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    this.panel.webview.html = this.buildHtml(this.lastReport, themeId);
  }

  /** Export the current report to a CSV file (toolbar action). */
  async exportCsv(): Promise<void> {
    if (!this.lastReport) {
      vscode.window.showWarningMessage('Open the compliance gap dashboard first.');
      return;
    }
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('compliance-gaps.csv'),
      filters: { 'CSV': ['csv'] },
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(this.toCsv(this.lastReport), 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  private toCsv(report: GapReport): string {
    const esc = (v: string): string => `"${v.replace(/"/g, '""')}"`;
    const rows: string[][] = [['section', 'id', 'detail', 'status_or_severity', 'next_review_at']];
    for (const r of report.requirementsWithoutAssertions) {
      rows.push(['requirement_without_assertion', r.id, r.name, r.severity ?? '', '']);
    }
    for (const a of report.assertionsWithoutEvidence) {
      rows.push(['assertion_without_evidence', a.id, `about=${a.about}|subject=${a.subject}`, a.status, a.next_review_at ?? '']);
    }
    for (const a of report.staleAssertions) {
      rows.push(['stale_assertion', a.id, `about=${a.about}|subject=${a.subject}`, a.status, a.next_review_at ?? '']);
    }
    for (const r of report.pastDeadlineRequirements) {
      rows.push(['past_deadline_requirement', r.id, r.name, r.severity ?? '', r.deadline ?? '']);
    }
    return rows.map(cols => cols.map(esc).join(',')).join('\r\n') + '\r\n';
  }

  private buildHtml(report: GapReport, themeId: ThemeId): string {
    const total = report.requirementsWithoutAssertions.length + report.assertionsWithoutEvidence.length + report.staleAssertions.length + report.pastDeadlineRequirements.length;

    const today = todayIso();
    const reqRows = report.requirementsWithoutAssertions.map(r => {
      const sev = r.severity ? `<span class="cmp-sev cmp-sev-${escXml(r.severity)}">${escXml(r.severity)}</span>` : '';
      const dl = deadlineBadge(r.deadline, today);
      return `<li>${sev}${openLink(OPEN_FILE_COMMAND, this.pathById.get(r.id), escXml(r.name), `Open ${r.id}`)}<span class="cmp-meta">${escXml(r.id)}</span>${dl}</li>`;
    }).join('');

    const noEvRows = report.assertionsWithoutEvidence.map(a =>
      `<li>${statusBadge(a.status)}${openLink(OPEN_FILE_COMMAND, this.pathById.get(a.id), escXml(a.id), `Open ${a.id}`)}<span class="cmp-meta">${escXml(`about ${a.about} · subject ${a.subject}`)}</span></li>`,
    ).join('');

    const staleRows = report.staleAssertions.map(a =>
      `<li>${statusBadge(a.status)}${openLink(OPEN_FILE_COMMAND, this.pathById.get(a.id), escXml(a.id), `Open ${a.id}`)}<span class="cmp-meta">${escXml(`review due ${a.next_review_at ?? '—'} · subject ${a.subject}`)}</span></li>`,
    ).join('');

    const pastDlRows = report.pastDeadlineRequirements.map(r => {
      const sev = r.severity ? `<span class="cmp-sev cmp-sev-${escXml(r.severity)}">${escXml(r.severity)}</span>` : '';
      const dl = deadlineBadge(r.deadline, today);
      return `<li>${sev}${openLink(OPEN_FILE_COMMAND, this.pathById.get(r.id), escXml(r.name), `Open ${r.id}`)}<span class="cmp-meta">${escXml(r.id)}</span> ${dl}</li>`;
    }).join('');

    const section = (title: string, count: number, rowsHtml: string, okMessage: string): string =>
      `<div class="cmp-section">
        <h2>${escXml(title)} <span class="cmp-count">(${count})</span></h2>
        ${count === 0 ? `<div class="cmp-ok">✓ ${escXml(okMessage)}</div>` : `<ul class="cmp-rows">${rowsHtml}</ul>`}
      </div>`;

    const body = `
      ${section('Requirements without assertions', report.requirementsWithoutAssertions.length, reqRows, 'Every requirement has at least one assertion.')}
      ${section('Assertions without evidence (ASSERT-007)', report.assertionsWithoutEvidence.length, noEvRows, 'No compliant/partial assertion is missing evidence.')}
      ${section('Stale assertions — review overdue (ASSERT-008)', report.staleAssertions.length, staleRows, 'No assertion is past its review date.')}
      ${section('Past-deadline requirements (CV-5)', report.pastDeadlineRequirements.length, pastDlRows, 'No requirement has a past deadline without full compliance.')}`;

    return complianceShell({
      notation: 'Gap dashboard',
      title: 'Compliance Gap Dashboard',
      subtitle: total === 0 ? 'No gaps found' : `${total} gap(s) across 4 checks`,
      date: todayIso(),
      themeId,
      refreshCommand: REFRESH_COMMAND,
      themeCommand: 'transitrixStudio.changeTheme',
      extraButtons: [{ command: EXPORT_CSV_COMMAND, label: 'Export CSV', title: 'Save the gap report as a CSV file' }],
      bodyHtml: body,
      confidence: this.lastConfidence,
    });
  }
}
