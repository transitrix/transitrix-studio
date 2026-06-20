import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import { buildComplianceIndex, buildLawTree, scoreComplianceView, type LawTree } from '../../packages/diagrams/src/compliance/index.js';
import { scanComplianceCanon } from './compliance-scan.js';
import { complianceShell, deadlineBadge, escXml, openLink, statusBadge } from './compliance-render.js';

/** Today as ISO YYYY-MM-DD (extension host clock; the library stays clock-free). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Single-law tree (vkgeorgia/strategy#84 Phase 3). Triggered from a codex file
// (LAW / REGULATION / POLICY / INTERNAL_STANDARD) in the editor-title bar.
// Shows the law → the requirements that derive from it → the assertions
// targeting each, with status badges. Read-only, script-less; click-to-open via
// command URIs.

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshSingleLaw';

export class SingleLawPreview {
  readonly panelTitle = 'Compliance — Law';
  private panel: vscode.WebviewPanel | undefined;
  private trackedUri: string | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  isShowingDocument(uri: vscode.Uri): boolean {
    return this.panel != null && this.trackedUri === uri.toString();
  }

  async showOrReveal(doc: vscode.TextDocument): Promise<void> {
    this.trackedUri = doc.uri.toString();
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'singleLawPreview',
        `${this.panelTitle} — ${path.basename(doc.fileName)}`,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
        {
          enableScripts: false,
          retainContextWhenHidden: true,
          enableCommandUris: [OPEN_FILE_COMMAND, REFRESH_COMMAND, 'transitrixStudio.changeTheme'],
        },
      );
      this.panel.onDidDispose(() => { this.panel = undefined; this.trackedUri = undefined; });
    } else {
      this.panel.title = `${this.panelTitle} — ${path.basename(doc.fileName)}`;
      this.panel.reveal(vscode.ViewColumn.Beside, true);
    }
    await this.push(doc);
  }

  async refreshSaved(doc: vscode.TextDocument): Promise<void> {
    if (this.isShowingDocument(doc.uri)) await this.push(doc);
  }

  /** Re-scan + re-render the tracked law. */
  async refresh(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.push(doc);
  }

  private async push(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');

    let lawId = '';
    let lawName = '';
    try {
      const parsed = yaml.load(doc.getText());
      if (parsed && typeof parsed === 'object') {
        const r = parsed as Record<string, unknown>;
        lawId = typeof r.id === 'string' ? r.id : '';
        lawName = typeof r.name === 'string' ? r.name : lawId;
      }
    } catch { /* fall through to the no-id message */ }

    if (!lawId) {
      this.panel.webview.html = complianceShell({
        title: 'Single-law tree',
        themeId, refreshCommand: REFRESH_COMMAND, themeCommand: 'transitrixStudio.changeTheme',
        bodyHtml: `<div class="cmp-empty">This file has no <code>id</code> — open a codex artefact (LAW / REGULATION / POLICY / INTERNAL_STANDARD).</div>`,
      });
      return;
    }

    const scan = await scanComplianceCanon();
    const index = buildComplianceIndex({ requirements: scan.requirements, assertions: scan.assertions });
    const tree = buildLawTree(lawId, index);

    // Confidence over every element rendered in the tree — requirements
    // derived from this law + every assertion targeting them (CONTRACT §11.6).
    const treeRequirements = tree.requirements.map(n => n.requirement);
    const treeAssertions = tree.requirements.flatMap(n => n.assertions);
    const confidence = scoreComplianceView(treeRequirements, treeAssertions, todayIso());

    this.panel.webview.html = complianceShell({
      title: lawName,
      subtitle: `${lawId} · ${tree.requirements.length} requirement(s)`,
      filename: path.basename(doc.fileName),
      date: todayIso(),
      themeId,
      refreshCommand: REFRESH_COMMAND,
      themeCommand: 'transitrixStudio.changeTheme',
      bodyHtml: this.treeHtml(tree, scan.pathById),
      confidence,
    });
  }

  private treeHtml(tree: LawTree, pathById: Map<string, string>): string {
    if (tree.requirements.length === 0) {
      return `<div class="cmp-empty">No requirements derive from <strong>${escXml(tree.lawId)}</strong>. Add <code>derived_from: [${escXml(tree.lawId)}]</code> to a requirement to bind it.</div>`;
    }
    const today = new Date().toISOString().slice(0, 10);
    return tree.requirements.map(node => {
      const r = node.requirement;
      const sev = r.severity ? `<span class="cmp-sev cmp-sev-${escXml(r.severity)}">${escXml(r.severity)}</span>` : '';
      const dl = deadlineBadge(r.deadline, today);
      const reqLink = openLink(OPEN_FILE_COMMAND, pathById.get(r.id), escXml(r.name), `Open ${r.id}`);
      const assertions = node.assertions.length === 0
        ? `<div class="cmp-none">No assertion targets this requirement — compliance gap.</div>`
        : `<ul class="cmp-assertions">${node.assertions.map(a => {
            const meta = [a.assessed_at ? `assessed ${a.assessed_at}` : null, a.next_review_at ? `review by ${a.next_review_at}` : null].filter(Boolean).join(' · ');
            const link = openLink(OPEN_FILE_COMMAND, pathById.get(a.id), escXml(a.id), `Open ${a.id}`);
            return `<li>${statusBadge(a.status)} ${link}${meta ? ` <span class="cmp-meta">${escXml(meta)}</span>` : ''}</li>`;
          }).join('')}</ul>`;
      return `<div class="cmp-req">
        <div class="cmp-req-head">${sev}<span class="cmp-req-name">${reqLink}</span><span class="cmp-req-id">${escXml(r.id)}</span>${dl}</div>
        ${assertions}
      </div>`;
    }).join('');
  }
}
