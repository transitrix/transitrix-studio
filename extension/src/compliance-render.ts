import { generateWebviewCss, type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';

// Shared HTML rendering for the script-less compliance views — the single-law
// tree and single-product view (vkgeorgia/strategy#84 Phase 3). These previews
// are read-only and need no scripts: click-to-open uses command URIs and status
// is shown with inline badges, so they keep `enableScripts: false` and the
// script-less CSP (smallest security surface).

export const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  n_a: 'N/A',
};

export function escXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A coloured status pill. */
export function statusBadge(status: AssertionStatus): string {
  return `<span class="cmp-badge cmp-${status}">${escXml(STATUS_LABELS[status])}</span>`;
}

/**
 * A click-to-open link via a command URI, or a plain span when the artefact has
 * no resolved file path (e.g. a dangling reference). `command` is the registered
 * open-file command; `inner` is already-escaped HTML.
 */
export function openLink(command: string, fsPath: string | undefined, inner: string, title: string): string {
  if (!fsPath) return `<span title="${escXml(title)}">${inner}</span>`;
  const href = `command:${command}?${encodeURIComponent(JSON.stringify([fsPath]))}`;
  return `<a class="cmp-link" href="${href}" title="${escXml(title)}">${inner}</a>`;
}

const COMPLIANCE_CSS = `
body { padding: 0; }
#cmp-toolbar { display: flex; align-items: baseline; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--ts-border, #cbd5e1); flex-wrap: wrap; }
.cmp-title { font-size: 15px; font-weight: 700; color: var(--ts-text, #0f172a); }
.cmp-subtitle { font-size: 12px; color: var(--ts-text-muted, #64748b); }
.cmp-btn { font-size: 11px; padding: 2px 10px; border-radius: 4px; color: var(--ts-text-muted, #64748b); text-decoration: none; border: 1px solid var(--ts-border, #cbd5e1); margin-left: auto; }
.cmp-btn:hover { color: var(--ts-text, #0f172a); background: var(--ts-bg-elevated, #f1f5f9); }
#cmp-body { padding: 12px 16px 28px; }
.cmp-link { color: var(--ts-brand-primary, #004d67); text-decoration: none; }
.cmp-link:hover { text-decoration: underline; }
.cmp-badge { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
.cmp-compliant { background: var(--ts-status-success-bg, #d1fae5); color: var(--ts-status-success-fg, #065f46); }
.cmp-partial { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.cmp-non_compliant { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); }
.cmp-under_review { background: var(--ts-status-info-bg, #e0f2fe); color: var(--ts-status-info-fg, #0c4a6e); }
.cmp-n_a { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); }

/* Tree (single-law) */
.cmp-req { margin: 0 0 14px; border: 1px solid var(--ts-border, #cbd5e1); border-radius: 6px; overflow: hidden; }
.cmp-req-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--ts-bg-subtle, #f1f5f9); }
.cmp-req-name { font-weight: 600; color: var(--ts-text, #0f172a); }
.cmp-req-id { font-size: 11px; color: var(--ts-text-muted, #64748b); font-family: var(--vscode-editor-font-family, monospace); }
.cmp-sev { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
.cmp-sev-high { color: #b91c1c; } .cmp-sev-medium { color: #b45309; } .cmp-sev-low { color: #2563eb; }
.cmp-assertions { list-style: none; margin: 0; padding: 0; }
.cmp-assertions li { display: flex; align-items: center; gap: 8px; padding: 6px 12px 6px 24px; border-top: 1px solid var(--ts-border, #e2e8f0); font-size: 12px; }
.cmp-assertions li .cmp-meta { color: var(--ts-text-muted, #64748b); font-size: 11px; }
.cmp-none { color: var(--ts-text-muted, #64748b); font-style: italic; padding: 6px 12px 6px 24px; border-top: 1px solid var(--ts-border, #e2e8f0); }

/* List (single-product) */
.cmp-list { border-collapse: collapse; font-size: 12px; width: 100%; max-width: 760px; }
.cmp-list th, .cmp-list td { border: 1px solid var(--ts-border, #cbd5e1); padding: 6px 12px; text-align: left; }
.cmp-list th { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text, #0f172a); }
.cmp-empty { color: var(--ts-text-muted, #64748b); padding: 24px 0; max-width: 640px; }
`;

export interface ComplianceShellOptions {
  title: string;
  subtitle?: string;
  themeId: ThemeId;
  /** Command id for the Refresh button (re-scan). */
  refreshCommand: string;
  /** Already-built body HTML (caller is responsible for escaping). */
  bodyHtml: string;
}

/** Full webview document for a script-less compliance view (static CSP). */
export function complianceShell(opts: ComplianceShellOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
${generateWebviewCss(opts.themeId)}
${COMPLIANCE_CSS}
  </style>
</head>
<body data-theme="${escXml(opts.themeId)}">
  <div id="cmp-toolbar">
    <span class="cmp-title">${escXml(opts.title)}</span>
    ${opts.subtitle ? `<span class="cmp-subtitle">${escXml(opts.subtitle)}</span>` : ''}
    <a href="command:${opts.refreshCommand}" class="cmp-btn" title="Re-scan the workspace">Refresh</a>
  </div>
  <div id="cmp-body">
    ${opts.bodyHtml}
  </div>
</body>
</html>`;
}
