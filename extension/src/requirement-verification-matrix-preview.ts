import * as path from 'node:path';
import * as vscode from 'vscode';
import { type ThemeId } from '@transitrix/diagrams/theme';
import { buildComplianceIndex } from '@transitrix/diagrams/compliance';
import {
  buildRequirementVerificationMatrix,
  renderRequirementVerificationMatrixCsv,
  type RequirementVerificationMatrix,
  type RequirementVerificationRow,
} from '@transitrix/diagrams/compliance-verification-matrix';
import { scanComplianceCanon } from './compliance-scan.js';
import {
  complianceShell,
  escXml,
  openLink,
  outcomeBadge,
} from './compliance-render.js';

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshRequirementVerificationMatrix';
const EXPORT_CSV_COMMAND = 'transitrixStudio.exportRequirementVerificationMatrixCsv';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function requirementCell(row: RequirementVerificationRow, pathById: Map<string, string>): string {
  const name = openLink(OPEN_FILE_COMMAND, pathById.get(row.requirementId), escXml(row.requirementLabel), `Open ${row.requirementId}`);
  return `${name}<div class="cmp-req-id">${escXml(row.requirementId)}</div>`;
}

function parentCell(row: RequirementVerificationRow, pathById: Map<string, string>): string {
  if (!row.parentId) return '—';
  if (row.parentLabel) {
    const name = openLink(OPEN_FILE_COMMAND, pathById.get(row.parentId), escXml(row.parentLabel), `Open ${row.parentId}`);
    return `${name}<div class="cmp-req-id">${escXml(row.parentId)}</div>`;
  }
  return `<span class="cmp-gap" title="Parent id does not resolve to an admitted requirement">${escXml(row.parentId)}</span>`;
}

function testResultCell(row: RequirementVerificationRow, pathById: Map<string, string>): string {
  if (!row.verificationId) return '—';
  const label = row.verificationLabel ?? row.verificationId;
  const name = openLink(OPEN_FILE_COMMAND, pathById.get(row.verificationId), escXml(label), `Open ${row.verificationId}`);
  return `${name}<div class="cmp-req-id">${escXml(row.verificationId)}</div>`;
}

function outcomeCell(row: RequirementVerificationRow): string {
  const parts: string[] = [];
  if (row.verificationOutcome) parts.push(outcomeBadge(row.verificationOutcome));
  if (row.coverageGap) parts.push(`<span class="cmp-gap">${escXml(row.coverageGap)}</span>`);
  return parts.length > 0 ? parts.join(' ') : '—';
}

export class RequirementVerificationMatrixPreview {
  readonly panelTitle = 'Requirement–Verification Matrix';
  private panel: vscode.WebviewPanel | undefined;
  private lastMatrix: RequirementVerificationMatrix | undefined;
  private lastCsv = '';
  private pathById = new Map<string, string>();

  constructor(private readonly extensionUri: vscode.Uri) {}

  async showOrReveal(): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'requirementVerificationMatrixPreview',
        this.panelTitle,
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND, EXPORT_CSV_COMMAND, 'transitrixStudio.changeTheme'],
        },
      );
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.lastMatrix = undefined;
        this.lastCsv = '';
      });
    } else {
      this.panel.reveal(vscode.ViewColumn.Active, false);
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    if (!this.panel) return;
    const scan = await scanComplianceCanon();
    this.pathById = scan.pathById;
    const index = buildComplianceIndex({
      requirements: scan.requirements,
      assertions: scan.assertions,
      verifications: scan.verifications,
    });
    this.lastMatrix = buildRequirementVerificationMatrix(index);
    this.lastCsv = renderRequirementVerificationMatrixCsv(this.lastMatrix);

    const danglingVerifies = scan.verifications
      .filter(v => !index.requirementById.has(v.verifies))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');
    if (!this.panel) return;
    this.panel.webview.html = this.buildHtml(this.lastMatrix, danglingVerifies, themeId);
  }

  async exportCsv(): Promise<void> {
    if (!this.lastCsv) {
      vscode.window.showWarningMessage('Open the requirement–verification matrix first.');
      return;
    }
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('requirement-verification-matrix.csv'),
      filters: { CSV: ['csv'] },
    });
    if (!target) return;
    await vscode.workspace.fs.writeFile(target, Buffer.from(this.lastCsv, 'utf-8'));
    vscode.window.showInformationMessage(`Saved: ${path.basename(target.fsPath)}`);
  }

  private buildHtml(
    matrix: RequirementVerificationMatrix,
    danglingVerifies: Array<{ id: string; verifies: string }>,
    themeId: ThemeId,
  ): string {
    const tableRows = matrix.rows.map(row =>
      `<tr>
        <td>${requirementCell(row, this.pathById)}</td>
        <td>${parentCell(row, this.pathById)}</td>
        <td>${testResultCell(row, this.pathById)}</td>
        <td>${outcomeCell(row)}</td>
      </tr>`,
    ).join('');

    const table = matrix.rows.length === 0
      ? `<p class="cmp-empty">No requirements found in this workspace.</p>`
      : `<table class="cmp-list cmp-matrix">
          <thead>
            <tr>
              <th>Requirement</th>
              <th>Parent</th>
              <th>Related test result</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>`;

    const danglingList = danglingVerifies.map(v =>
      `<li>${openLink(OPEN_FILE_COMMAND, this.pathById.get(v.id), escXml(v.id), `Open ${v.id}`)}<span class="cmp-meta">${escXml(`verifies ${v.verifies}`)}</span></li>`,
    ).join('');
    const findings = danglingVerifies.length === 0
      ? `<div class="cmp-ok">No dangling VERIFICATION.verifies references.</div>`
      : `<ul class="cmp-rows">${danglingList}</ul>`;

    const body = `
      ${table}
      <div class="cmp-section">
        <h2>Unresolved verifies <span class="cmp-count">(${danglingVerifies.length})</span></h2>
        ${findings}
      </div>`;

    return complianceShell({
      notation: 'Requirement–verification matrix',
      title: 'Requirement–Verification Matrix',
      subtitle: `${matrix.summary.requirements} requirement(s) · ${matrix.summary.verifications} result(s) · ${matrix.summary.gaps} coverage gap(s)`,
      date: todayIso(),
      themeId,
      refreshCommand: REFRESH_COMMAND,
      themeCommand: 'transitrixStudio.changeTheme',
      extraButtons: [{ command: EXPORT_CSV_COMMAND, label: 'Export CSV', title: 'Save the matrix as a CSV file' }],
      bodyHtml: body,
    });
  }
}
