import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import { buildComplianceIndex, buildProductView, scoreComplianceView, type ProductView } from '../../packages/diagrams/src/compliance/index.js';
import { scanComplianceCanon } from './compliance-scan.js';
import { complianceShell, deadlineBadge, escXml, openLink, statusBadge } from './compliance-render.js';

/** Today as ISO YYYY-MM-DD (extension host clock; the library stays clock-free). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Single-product view (vkgeorgia/strategy#84 Phase 3). Triggered from a PRODUCT
// file in the editor-title bar. Shows the product → every requirement an
// assertion binds it to → the status of each. Read-only, script-less;
// click-to-open via command URIs.

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshSingleProduct';

export class SingleProductPreview {
  readonly panelTitle = 'Compliance Product Preview';
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
        'singleProductPreview',
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

  async refresh(): Promise<void> {
    if (!this.panel || !this.trackedUri) return;
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(this.trackedUri));
    await this.push(doc);
  }

  private async push(doc: vscode.TextDocument): Promise<void> {
    if (!this.panel) return;
    const themeId = vscode.workspace.getConfiguration('transitrix').get<ThemeId>('theme', 'transitrix');

    let productId = '';
    let productName = '';
    try {
      const parsed = yaml.load(doc.getText());
      if (parsed && typeof parsed === 'object') {
        const r = parsed as Record<string, unknown>;
        productId = typeof r.id === 'string' ? r.id : '';
        productName = typeof r.name === 'string' ? r.name : productId;
      }
    } catch { /* fall through */ }

    if (!productId) {
      this.panel.webview.html = complianceShell({
        title: 'Single-product view',
        themeId, refreshCommand: REFRESH_COMMAND, themeCommand: 'transitrixStudio.changeTheme',
        bodyHtml: `<div class="cmp-empty">This file has no <code>id</code> — open a <code>notation: product</code> file.</div>`,
      });
      return;
    }

    const scan = await scanComplianceCanon();
    const index = buildComplianceIndex({ requirements: scan.requirements, assertions: scan.assertions });
    const view = buildProductView(productId, index);

    // Confidence over the rendered requirement/assertion pairs (CONTRACT §11.6).
    const viewRequirements = view.requirements.map(r => r.requirement);
    const viewAssertions = view.requirements.map(r => r.assertion);
    const confidence = scoreComplianceView(viewRequirements, viewAssertions, todayIso());

    this.panel.webview.html = complianceShell({
      title: productName,
      subtitle: `${productId} · ${view.requirements.length} requirement(s) asserted`,
      filename: path.basename(doc.fileName),
      date: todayIso(),
      themeId,
      refreshCommand: REFRESH_COMMAND,
      themeCommand: 'transitrixStudio.changeTheme',
      bodyHtml: this.viewHtml(view, scan.pathById),
      confidence,
    });
  }

  private viewHtml(view: ProductView, pathById: Map<string, string>): string {
    if (view.requirements.length === 0) {
      return `<div class="cmp-empty">No assertion names <strong>${escXml(view.productId)}</strong> as its subject yet — this product has no recorded compliance claims.</div>`;
    }
    const today = todayIso();
    const rows = view.requirements.map(({ requirement, assertion }) => {
      const reqLink = openLink(OPEN_FILE_COMMAND, pathById.get(requirement.id), escXml(requirement.name), `Open ${requirement.id}`);
      const aLink = openLink(OPEN_FILE_COMMAND, pathById.get(assertion.id), escXml(assertion.id), `Open ${assertion.id}`);
      const review = assertion.next_review_at ? escXml(assertion.next_review_at) : '—';
      const dl = deadlineBadge(requirement.deadline, today);
      return `<tr>
        <td>${reqLink}<div class="cmp-req-id">${escXml(requirement.id)}</div></td>
        <td>${statusBadge(assertion.status)}</td>
        <td>${aLink}</td>
        <td>${review}</td>
        <td>${dl || '—'}</td>
      </tr>`;
    }).join('');
    return `<table class="cmp-list">
      <thead><tr><th>Requirement</th><th>Status</th><th>Assertion</th><th>Next review</th><th>Deadline</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }
}
