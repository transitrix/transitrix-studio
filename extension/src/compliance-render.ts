import { generateWebviewCss, type ThemeId } from '../../packages/diagrams/src/theme/index.js';
import { escXml } from '../../packages/diagrams/src/webview/render-util.js';
export { escXml };
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';
import type { ViewScore } from '../../packages/diagrams/src/confidence/index.js';
import { computeDeadlineStatus } from '../../packages/diagrams/src/compliance/impact.js';
import { ERROR_BLOCK_CSS, buildErrorHtml, WARN_BLOCK_CSS, buildWarnHtml } from './diagram-frame.js';

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
  pending_owner: 'Pending owner',
  n_a: 'N/A',
};
/** A coloured status pill. */
export function statusBadge(status: AssertionStatus): string {
  return `<span class="cmp-badge cmp-${status}">${escXml(STATUS_LABELS[status])}</span>`;
}

/**
 * A coloured deadline pill. Returns an empty string when `deadline` is absent.
 * Uses today (ISO YYYY-MM-DD) from the caller to stay clock-free in the library.
 */
export function deadlineBadge(deadline: string | undefined, today: string): string {
  if (!deadline) return '';
  const ds = computeDeadlineStatus(deadline, today);
  return `<span class="cmp-deadline cmp-dl-${ds}" title="Deadline: ${escXml(deadline)}">${escXml(deadline)}</span>`;
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
.cmp-title { font-size: 13px; font-weight: 700; color: var(--ts-header-text, #0f172a); }
.cmp-subtitle { font-size: 11px; color: var(--ts-text-secondary, #475569); }
.cmp-meta { width: 100%; font-size: 11px; color: var(--ts-text-secondary, #475569); letter-spacing: 0.04em; }
.cmp-confidence { width: 100%; font-size: 11px; color: var(--ts-text-secondary, #475569); }
.cmp-confidence-band { display: inline-block; padding: 0 6px; margin-right: 4px; border-radius: 3px; font-weight: 700; background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text, #0f172a); }
.cmp-confidence-band[data-band="A"] { background: var(--ts-status-success-bg, #d1fae5); color: var(--ts-status-success-fg, #065f46); }
.cmp-confidence-band[data-band="B"] { background: var(--ts-status-info-bg, #e0f2fe); color: var(--ts-status-info-fg, #0c4a6e); }
.cmp-confidence-band[data-band="C"] { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); }
.cmp-confidence-band[data-band="D"] { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); }
.cmp-toolbar-actions { margin-left: auto; display: inline-flex; gap: 6px; }
.cmp-btn { font-size: 11px; padding: 2px 10px; border-radius: 4px; color: var(--ts-text-muted, #64748b); text-decoration: none; border: 1px solid var(--ts-border, #cbd5e1); }
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
.cmp-pending_owner { background: #f3e8ff; color: #6b21a8; }

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
.cmp-none { color: var(--ts-text-muted, #64748b); padding: 6px 12px 6px 24px; border-top: 1px solid var(--ts-border, #e2e8f0); }

/* List (single-product) */
.cmp-list { border-collapse: collapse; font-size: 12px; width: 100%; max-width: 760px; }
.cmp-list th, .cmp-list td { border: 1px solid var(--ts-border, #cbd5e1); padding: 6px 12px; text-align: left; }
.cmp-list th { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text, #0f172a); }
.cmp-empty { color: var(--ts-text-muted, #64748b); padding: 24px 0; max-width: 640px; }

/* Deadline pill (CV-4) */
.cmp-deadline { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-family: var(--vscode-editor-font-family, monospace); margin-left: 4px; }
.cmp-dl-past_due { background: var(--ts-status-error-bg, #fee2e2); color: var(--ts-status-error-fg, #991b1b); font-weight: 700; }
.cmp-dl-in_force { background: var(--ts-status-warning-bg, #fef9c3); color: var(--ts-status-warning-fg, #854d0e); font-weight: 600; }
.cmp-dl-upcoming { background: var(--ts-bg-subtle, #f1f5f9); color: var(--ts-text-muted, #64748b); }
.cmp-dl-none { display: none; }

/* Gap dashboard sections */
.cmp-section { margin: 0 0 22px; max-width: 860px; }
.cmp-section h2 { font-size: 13px; margin: 0 0 8px; color: var(--ts-text, #0f172a); }
.cmp-section h2 .cmp-count { color: var(--ts-text-muted, #64748b); font-weight: 400; }
.cmp-ok { color: var(--ts-status-success-fg, #065f46); font-size: 12px; }
.cmp-rows { list-style: none; margin: 0; padding: 0; }
.cmp-rows li { display: flex; align-items: center; gap: 8px; padding: 5px 2px; border-bottom: 1px solid var(--ts-border, #e2e8f0); font-size: 12px; }
.cmp-rows .cmp-meta { color: var(--ts-text-muted, #64748b); font-size: 11px; }
`;

export interface ComplianceShellOptions {
  title: string;
  subtitle?: string;
  /** Source filename shown as the second line of the header (e.g. "gdpr.law.transitrix.yaml"). Omit for workspace-wide views. */
  filename?: string;
  /** Generation date shown as "Generated: YYYY-MM-DD". Pass today's ISO date from the caller. */
  date?: string;
  themeId: ThemeId;
  /** Command id for the Refresh button (re-scan). */
  refreshCommand: string;
  /** Command id for the Theme… button. Pass 'transitrixStudio.changeTheme' from all callers. */
  themeCommand?: string;
  /** Extra toolbar buttons (command URIs), rendered before Refresh. */
  extraButtons?: Array<{ command: string; label: string; title: string }>;
  /** Already-built body HTML (caller is responsible for escaping). */
  bodyHtml: string;
  /**
   * View-level composite confidence for the rendered element set
   * (CONTRACT §11.6). Rendered next to the formation date as a small subline
   * under the title (DQ-2, vkgeorgia/strategy#162). Omit or pass an empty
   * composite to suppress the line entirely.
   */
  confidence?: ViewScore;
  /** Non-fatal advisory messages. Rendered as a collapsible warnings block below the toolbar. */
  warnings?: string[];
  /** Hard error message. Rendered as a collapsible error block below the toolbar. */
  errorMsg?: string;
}

/**
 * Renders the §11.6 confidence header as a coloured-band pill plus the
 * formation date + mean + sourced %. Suppresses itself for an empty
 * element set (no view to score). Static / script-less — pure HTML.
 */
export function confidenceLineHtml(view: ViewScore): string {
  const c = view.composite;
  if (c.element_count === 0) return '';
  const mean = c.mean.toFixed(2);
  const coverage = Math.round(c.coverage * 100);
  return `<span class="cmp-confidence" title="Data confidence per CONTRACT §11.6 — weakest-link headline.">`
    + `<span class="cmp-confidence-band" data-band="${escXml(c.band)}">${escXml(c.band)}</span>`
    + `Data confidence (as of ${escXml(view.today)}) · ${escXml(mean)} mean · ${coverage}% sourced`
    + `</span>`;
}

/** Full webview document for a script-less compliance view (static CSP). */
export function complianceShell(opts: ComplianceShellOptions): string {
  const { input: errInput, block: errBlock } = buildErrorHtml(opts.errorMsg ?? '');
  const { input: warnInput, block: warnBlock } = buildWarnHtml(opts.warnings ?? []);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
${generateWebviewCss(opts.themeId)}
${COMPLIANCE_CSS}
${ERROR_BLOCK_CSS}
${WARN_BLOCK_CSS}
  </style>
</head>
<body data-theme="${escXml(opts.themeId)}">
  ${errInput}${warnInput}
  <div id="cmp-toolbar">
    <span class="cmp-title">${escXml(opts.title)}</span>
    ${opts.subtitle ? `<span class="cmp-subtitle">${escXml(opts.subtitle)}</span>` : ''}
    ${(opts.filename || opts.date) ? `<span class="cmp-meta">${[opts.filename ? escXml(opts.filename) : '', opts.date ? `Generated: ${escXml(opts.date)}` : ''].filter(Boolean).join(' · ')}</span>` : ''}
    <span class="cmp-toolbar-actions">${(opts.extraButtons ?? []).map(b => `<a href="command:${b.command}" class="cmp-btn" title="${escXml(b.title)}">${escXml(b.label)}</a>`).join('')}${opts.themeCommand ? `<a href="command:${opts.themeCommand}" class="cmp-btn" title="Change the color scheme for all diagram previews">Theme…</a>` : ''}<a href="command:${opts.refreshCommand}" class="cmp-btn" title="Re-scan the workspace">Refresh</a></span>
    ${opts.confidence ? confidenceLineHtml(opts.confidence) : ''}
  </div>
  ${errBlock}${warnBlock}
  <div id="cmp-body">
    ${opts.bodyHtml}
  </div>
</body>
</html>`;
}
