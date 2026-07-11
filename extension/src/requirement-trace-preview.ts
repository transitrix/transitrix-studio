import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { type ThemeId } from '@transitrix/diagrams/theme';
import {
  buildComplianceIndex,
  buildRequirementTrace,
  buildTraceElementCatalog,
  scoreComplianceView,
  type RequirementTrace,
} from '@transitrix/diagrams/compliance';
import { scanComplianceCanon } from './compliance-scan.js';
import { complianceShell, escXml, openLink, statusBadge } from './compliance-render.js';

// Requirement traceability + hierarchy view. Triggered
// from a REQUIREMENT-*.yaml or CONSTRAINT-*.yaml file in the editor-title bar.
// Shows the trace chain (derived_from → element → ASSERTION → subject +
// realised_via) and the hierarchy (parent chain + direct children). Read-only,
// script-less; click-to-open via command URIs.
//
// Assertion coverage applies to REQUIREMENT only (16-assertion.md §1) — a
// CONSTRAINT-side trace shows sources + hierarchy but no assertion block.

const OPEN_FILE_COMMAND = 'transitrixStudio.openComplianceFile';
const REFRESH_COMMAND = 'transitrixStudio.refreshRequirementTrace';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export class RequirementTracePreview {
  readonly panelTitle = 'Requirement Trace Preview';
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
        'requirementTracePreview',
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

    let elementId = '';
    let elementKind: 'requirement' | 'constraint' | undefined;
    try {
      const parsed = yaml.load(doc.getText());
      if (parsed && typeof parsed === 'object') {
        const r = parsed as Record<string, unknown>;
        elementId = typeof r.id === 'string' ? r.id : '';
        if (r.notation === 'requirement' || r.notation === 'constraint') elementKind = r.notation;
      }
    } catch { /* fall through */ }

    if (!elementId) {
      this.panel.webview.html = complianceShell({
        notation: 'Requirement trace',
        title: 'Requirement trace',
        themeId, refreshCommand: REFRESH_COMMAND, themeCommand: 'transitrixStudio.changeTheme',
        bodyHtml: `<div class="cmp-empty">This file has no <code>id</code> — open a REQUIREMENT or CONSTRAINT file.</div>`,
      });
      return;
    }

    const scan = await scanComplianceCanon();
    const index = buildComplianceIndex({ requirements: scan.requirements, assertions: scan.assertions });
    const catalog = buildTraceElementCatalog(scan.products, scan.subjects);
    const trace = buildRequirementTrace(elementId, index, catalog, scan.codex);

    // Confidence over the element + assertion set targeting it (CONTRACT §11.6).
    // Hierarchy siblings are structural context — not scored.
    const confidence = scoreComplianceView(
      [trace.requirement],
      trace.assertions.map(a => a.assertion),
      todayIso(),
    );

    const kind = elementKind ?? trace.requirement.element_kind ?? 'requirement';
    const subtitleBits = [
      elementId,
      trace.requirement.origin ? `origin: ${trace.requirement.origin}` : null,
      kind === 'constraint' ? 'CONSTRAINT' : null,
    ].filter(Boolean).join(' · ');

    this.panel.webview.html = complianceShell({
      notation: 'Requirement trace',
      title: trace.requirement.name,
      subtitle: subtitleBits,
      filename: path.basename(doc.fileName),
      date: todayIso(),
      themeId,
      refreshCommand: REFRESH_COMMAND,
      themeCommand: 'transitrixStudio.changeTheme',
      bodyHtml: this.traceHtml(trace, kind, scan.pathById),
      confidence,
    });
  }

  private traceHtml(
    trace: RequirementTrace,
    kind: 'requirement' | 'constraint',
    pathById: Map<string, string>,
  ): string {
    const { requirement, sources, assertions, ancestors, children } = trace;

    const description = requirement.description
      ? `<p class="rt-desc">${escXml(requirement.description)}</p>`
      : '';

    // Hierarchy — parent chain. Renders root first (visual: root … → parent → self).
    let hierarchyHtml = '';
    if (ancestors.length > 0) {
      const chain = [...ancestors].reverse();
      const links = chain.map(a => {
        const link = openLink(OPEN_FILE_COMMAND, pathById.get(a.id), escXml(a.name), `Open ${a.id}`);
        return `<li>${link} <span class="cmp-req-id">${escXml(a.id)}</span></li>`;
      }).join('');
      const self = `<li class="rt-self">${escXml(requirement.name)} <span class="cmp-req-id">${escXml(requirement.id)}</span></li>`;
      hierarchyHtml = `<section class="rt-section">
        <h2>Parent chain <span class="cmp-count">(${ancestors.length})</span></h2>
        <ol class="rt-parent-chain">${links}${self}</ol>
      </section>`;
    }

    // Direct children — leaves of the hierarchy tree from this node.
    let childrenHtml = '';
    if (children.length > 0) {
      const rows = children.map(c => {
        const link = openLink(OPEN_FILE_COMMAND, pathById.get(c.id), escXml(c.name), `Open ${c.id}`);
        const sev = c.severity ? `<span class="cmp-sev cmp-sev-${escXml(c.severity)}">${escXml(c.severity)}</span>` : '';
        const originBadge = c.origin ? `<span class="rt-origin">${escXml(c.origin)}</span>` : '';
        return `<li>${sev}${link} <span class="cmp-req-id">${escXml(c.id)}</span>${originBadge}</li>`;
      }).join('');
      childrenHtml = `<section class="rt-section">
        <h2>Children <span class="cmp-count">(${children.length})</span></h2>
        <ul class="rt-list">${rows}</ul>
      </section>`;
    }

    // Backward trace — the derived_from codex artefacts. Origin-agnostic
    // (15-requirement.md §2.1): a process-product / project-product requirement
    // may legitimately have no sources.
    let sourcesHtml = '';
    if (sources.length > 0) {
      const rows = sources.map(s => {
        const label = s.codex?.name ? escXml(s.codex.name) : escXml(s.id);
        const link = openLink(OPEN_FILE_COMMAND, pathById.get(s.id), label, `Open ${s.id}`);
        const jur = s.codex?.jurisdiction
          ? ` <span class="rt-jur">${escXml(s.codex.jurisdiction)}</span>`
          : s.codex ? '' : ` <span class="rt-dangling">unresolved</span>`;
        return `<li>${link} <span class="cmp-req-id">${escXml(s.id)}</span>${jur}</li>`;
      }).join('');
      sourcesHtml = `<section class="rt-section">
        <h2>Sources <span class="cmp-count">(${sources.length})</span></h2>
        <ul class="rt-list">${rows}</ul>
      </section>`;
    }

    // Forward trace via ASSERTION — REQUIREMENT only (16-assertion.md §1).
    let assertionsHtml = '';
    if (kind === 'constraint') {
      assertionsHtml = `<section class="rt-section">
        <h2>Realisation</h2>
        <p class="rt-note">CONSTRAINT-side ASSERTION mechanism is out of scope for v1 (16-assertion.md §1).
          Compliance for this element is tracked via its <code>status</code> or downstream tooling.</p>
      </section>`;
    } else if (assertions.length === 0) {
      assertionsHtml = `<section class="rt-section">
        <h2>Realisation</h2>
        <p class="rt-note">No ASSERTION targets this requirement — compliance gap
          (<code>REQ-COVERAGE-001</code>).</p>
      </section>`;
    } else {
      const rows = assertions.map(row => {
        const a = row.assertion;
        const aLink = openLink(OPEN_FILE_COMMAND, pathById.get(a.id), escXml(a.id), `Open ${a.id}`);
        const subjLink = openLink(
          OPEN_FILE_COMMAND, pathById.get(row.subject.id),
          escXml(row.subject.name ?? row.subject.id), `Open ${row.subject.id}`,
        );
        const realised = row.realisedVia.length === 0
          ? ''
          : `<div class="rt-realised"><span class="rt-realised-label">realised via:</span> ${row.realisedVia.map(rv => {
              const rvLink = openLink(OPEN_FILE_COMMAND, pathById.get(rv.id), escXml(rv.name ?? rv.id), `Open ${rv.id}`);
              return `${rvLink} <span class="cmp-req-id">${escXml(rv.id)}</span>`;
            }).join(' · ')}</div>`;
        const meta = [
          a.assessed_at ? `assessed ${a.assessed_at}` : null,
          a.next_review_at ? `review by ${a.next_review_at}` : null,
        ].filter(Boolean).join(' · ');
        return `<li class="rt-assertion">
          <div class="rt-assertion-head">
            ${statusBadge(a.status)}
            <span class="rt-subj">${subjLink} <span class="cmp-req-id">${escXml(row.subject.id)}</span></span>
            <span class="rt-assertion-id">${aLink}</span>
          </div>
          ${realised}
          ${meta ? `<div class="cmp-meta">${escXml(meta)}</div>` : ''}
        </li>`;
      }).join('');
      assertionsHtml = `<section class="rt-section">
        <h2>Realisation <span class="cmp-count">(${assertions.length} assertion${assertions.length === 1 ? '' : 's'})</span></h2>
        <ul class="rt-assertions">${rows}</ul>
      </section>`;
    }

    return `<style>${RT_CSS}</style>${description}${hierarchyHtml}${sourcesHtml}${assertionsHtml}${childrenHtml}`;
  }
}

const RT_CSS = `
.rt-desc { color: var(--ts-text-secondary, #475569); margin: 0 0 18px; max-width: 720px; line-height: 1.4; }
.rt-section { margin: 0 0 22px; max-width: 860px; }
.rt-section h2 { font-size: 13px; margin: 0 0 8px; color: var(--ts-text, #0f172a); }
.rt-section h2 .cmp-count { color: var(--ts-text-muted, #64748b); font-weight: 400; }
.rt-list { list-style: none; margin: 0; padding: 0; }
.rt-list li { display: flex; align-items: center; gap: 8px; padding: 5px 2px; border-bottom: 1px solid var(--ts-border, #e2e8f0); font-size: 12px; }
.rt-parent-chain { list-style: none; margin: 0; padding: 0; }
.rt-parent-chain li { padding: 5px 2px 5px 20px; border-left: 2px solid var(--ts-border, #cbd5e1); margin-left: 6px; font-size: 12px; position: relative; }
.rt-parent-chain li::before { content: '↳ '; color: var(--ts-text-muted, #64748b); position: absolute; left: 4px; }
.rt-parent-chain li:first-child { padding-left: 4px; border-left: none; }
.rt-parent-chain li:first-child::before { content: ''; }
.rt-parent-chain li.rt-self { font-weight: 600; color: var(--ts-text, #0f172a); }
.rt-note { color: var(--ts-text-muted, #64748b); font-size: 12px; margin: 0; }
.rt-note code { font-family: var(--vscode-editor-font-family, monospace); }
.rt-jur { display: inline-block; padding: 0 6px; margin-left: 4px; border-radius: 3px; font-size: 10px; background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.04em; }
.rt-dangling { color: #b45309; font-size: 11px; font-style: normal; }
.rt-origin { display: inline-block; padding: 0 6px; margin-left: 6px; border-radius: 3px; font-size: 10px; background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); text-transform: uppercase; letter-spacing: 0.04em; }
.rt-assertions { list-style: none; margin: 0; padding: 0; }
.rt-assertion { border: 1px solid var(--ts-border, #cbd5e1); border-radius: 6px; padding: 8px 12px; margin: 0 0 8px; }
.rt-assertion-head { display: flex; align-items: center; gap: 8px; }
.rt-subj { font-weight: 600; color: var(--ts-text, #0f172a); font-size: 12px; }
.rt-assertion-id { margin-left: auto; font-size: 11px; }
.rt-realised { margin-top: 4px; font-size: 12px; color: var(--ts-text-secondary, #475569); }
.rt-realised-label { color: var(--ts-text-muted, #64748b); font-size: 11px; }
`;
