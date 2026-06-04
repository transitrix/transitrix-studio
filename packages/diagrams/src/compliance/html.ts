// HTML renderers for the compliance views (vkgeorgia/strategy#84 Phase 5,
// PDF follow-on). Pure string builders — fed to WeasyPrint by the
// `transitrix export-compliance --format pdf` path in src/export-compliance.ts.
//
// Each entry point returns a complete, self-contained HTML document (no
// external assets) so WeasyPrint reads the whole brief on stdin. CSS is
// inlined; the page rules target A4 portrait with branded header and footer.
// Status colours mirror the Studio preview palette (see compliance-render.ts)
// so the export and the in-editor view stay visually consistent.

import { buildComplianceMatrix } from '../compliance-matrix/index.js';
import { buildComplianceIndex } from './reverse-index.js';
import { buildLawTree, buildProductView } from './views.js';
import { buildGapReport } from './gap-report.js';
import type { ComplianceCanon } from './classify.js';
import type { ReportScope } from './markdown.js';
import type { AssertionStatus } from '../assertion/types.js';

const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  n_a: 'N/A',
};

export interface HtmlOptions {
  /** Today as ISO YYYY-MM-DD — enables the gap dashboard's stale-assertion list and is stamped in the footer. */
  today?: string;
  /** Title override; defaults to the per-scope title. */
  title?: string;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function badge(status: AssertionStatus): string {
  return `<span class="cmp-badge cmp-${status}">${escHtml(STATUS_LABELS[status])}</span>`;
}

// A4 portrait with 18mm margins — matches the WeasyPrint one-pager template
// the site uses. Brand colour `#004d67` mirrors `--ts-brand-primary` from
// extension/src/compliance-render.ts so the PDF and the Studio preview agree.
const CSS = `
@page {
  size: A4 portrait;
  margin: 18mm 16mm 22mm;
  @bottom-left { content: "Transitrix — compliance report"; font: 9pt "Helvetica", "Arial", sans-serif; color: #475569; }
  @bottom-right { content: "Page " counter(page) " / " counter(pages); font: 9pt "Helvetica", "Arial", sans-serif; color: #475569; }
}
html, body { margin: 0; padding: 0; }
body { font-family: "Helvetica", "Arial", sans-serif; font-size: 10pt; color: #0f172a; line-height: 1.4; }
.cmp-header { border-bottom: 2px solid #004d67; padding-bottom: 6pt; margin-bottom: 14pt; }
.cmp-header .cmp-eyebrow { font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #004d67; font-weight: 700; }
.cmp-header h1 { font-size: 17pt; margin: 2pt 0 4pt; color: #0f172a; }
.cmp-header .cmp-stamp { font-size: 9pt; color: #475569; }
h2 { font-size: 12pt; margin: 16pt 0 6pt; color: #0f172a; page-break-after: avoid; }
h2 .cmp-count { color: #64748b; font-weight: 400; font-size: 10pt; }
p.cmp-empty { color: #64748b; font-style: italic; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin-bottom: 10pt; }
th, td { border: 0.5pt solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f1f5f9; font-weight: 700; color: #0f172a; }
table.cmp-matrix th:first-child, table.cmp-matrix td:first-child { background: #f8fafc; font-weight: 600; }
code, .cmp-id { font-family: "Menlo", "Consolas", monospace; font-size: 9pt; color: #475569; }
.cmp-badge { display: inline-block; padding: 1pt 6pt; border-radius: 8pt; font-size: 8.5pt; font-weight: 700; }
.cmp-compliant { background: #d1fae5; color: #065f46; }
.cmp-partial { background: #fef9c3; color: #854d0e; }
.cmp-non_compliant { background: #fee2e2; color: #991b1b; }
.cmp-under_review { background: #e0f2fe; color: #0c4a6e; }
.cmp-n_a { background: #f1f5f9; color: #64748b; }
.cmp-cell-gap { color: #94a3b8; text-align: center; }
.cmp-req { border: 0.5pt solid #cbd5e1; border-radius: 3pt; margin-bottom: 8pt; page-break-inside: avoid; }
.cmp-req-head { background: #f1f5f9; padding: 5pt 8pt; }
.cmp-req-head .cmp-req-name { font-weight: 700; color: #0f172a; }
.cmp-req-head .cmp-req-id { margin-left: 6pt; color: #475569; font-size: 9pt; font-family: "Menlo", "Consolas", monospace; }
.cmp-sev { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; margin-left: 8pt; }
.cmp-sev-high { color: #b91c1c; }
.cmp-sev-medium { color: #b45309; }
.cmp-sev-low { color: #2563eb; }
.cmp-assertions { list-style: none; margin: 0; padding: 0; }
.cmp-assertions li { padding: 4pt 8pt 4pt 16pt; border-top: 0.5pt solid #e2e8f0; }
.cmp-assertions li .cmp-meta { color: #475569; font-size: 8.5pt; margin-left: 6pt; }
.cmp-section { margin-bottom: 12pt; }
.cmp-rows { list-style: none; margin: 0; padding: 0; }
.cmp-rows li { padding: 3pt 0 3pt 14pt; border-bottom: 0.5pt solid #e2e8f0; text-indent: -10pt; }
.cmp-rows li::before { content: "☐"; color: #94a3b8; margin-right: 6pt; }
.cmp-ok { color: #065f46; font-weight: 600; }
.cmp-summary { font-size: 9pt; color: #475569; }
`;

function htmlDoc(title: string, today: string | undefined, body: string): string {
  const stamp = today ? `Generated ${escHtml(today)}` : '';
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8"/>',
    `<title>${escHtml(title)}</title>`,
    `<style>${CSS}</style>`,
    '</head>',
    '<body>',
    '<header class="cmp-header">',
    '<div class="cmp-eyebrow">Transitrix · Compliance</div>',
    `<h1>${escHtml(title)}</h1>`,
    stamp ? `<div class="cmp-stamp">${stamp}</div>` : '',
    '</header>',
    body,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Renders the requested compliance view from a scanned canon to a complete HTML document. */
export function renderComplianceHtml(canon: ComplianceCanon, scope: ReportScope, options: HtmlOptions = {}): string {
  switch (scope.mode) {
    case 'matrix': {
      const m = buildComplianceMatrix({ products: canon.products, requirements: canon.requirements, assertions: canon.assertions });
      const title = options.title ?? 'Compliance Matrix';
      const summary = `<p class="cmp-summary">${m.summary.products} products × ${m.summary.requirements} requirements · ${m.summary.gaps} gaps · ${m.summary.assertions} assertions</p>`;
      if (m.products.length === 0 || m.requirements.length === 0) {
        return htmlDoc(title, options.today, `${summary}<p class="cmp-empty">No products or requirements found in the scanned canon.</p>`);
      }
      const head = `<tr><th>Product \\ Requirement</th>${m.requirements.map(r => `<th>${escHtml(r.name)}</th>`).join('')}</tr>`;
      const rows = m.products.map((p, ri) => {
        const cells = m.requirements.map((_r, ci) => {
          const c = m.cells[ri][ci];
          return c.status ? `<td>${badge(c.status)}</td>` : '<td class="cmp-cell-gap">—</td>';
        }).join('');
        const name = escHtml(p.name) + (p.unresolved ? ' <span class="cmp-sev cmp-sev-high">unresolved</span>' : '');
        return `<tr><td>${name}</td>${cells}</tr>`;
      }).join('');
      return htmlDoc(title, options.today, `${summary}<table class="cmp-matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>`);
    }

    case 'law': {
      const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
      const tree = buildLawTree(scope.id, index);
      const law = canon.codex.find(c => c.id === scope.id);
      const title = options.title ?? `Compliance — ${law ? law.name : scope.id}`;
      const summary = `<p class="cmp-summary"><code>${escHtml(scope.id)}</code> · ${tree.requirements.length} requirement(s)</p>`;
      if (tree.requirements.length === 0) {
        return htmlDoc(title, options.today, `${summary}<p class="cmp-empty">No requirements derive from <code>${escHtml(scope.id)}</code>.</p>`);
      }
      const blocks = tree.requirements.map(node => {
        const sev = node.requirement.severity ? ` <span class="cmp-sev cmp-sev-${escHtml(node.requirement.severity)}">${escHtml(node.requirement.severity)}</span>` : '';
        const head = `<div class="cmp-req-head"><span class="cmp-req-name">${escHtml(node.requirement.name)}</span><span class="cmp-req-id">${escHtml(node.requirement.id)}</span>${sev}</div>`;
        if (node.assertions.length === 0) {
          return `<section class="cmp-req">${head}<ul class="cmp-assertions"><li><em>No assertion — compliance gap.</em></li></ul></section>`;
        }
        const items = node.assertions.map(a => {
          const metaParts: string[] = [];
          if (a.assessed_at) metaParts.push(`assessed ${escHtml(a.assessed_at)}`);
          if (a.next_review_at) metaParts.push(`review by ${escHtml(a.next_review_at)}`);
          const meta = metaParts.length > 0 ? `<span class="cmp-meta">${metaParts.join(' · ')}</span>` : '';
          return `<li>${badge(a.status)} <code>${escHtml(a.id)}</code> <span class="cmp-meta">subject <code>${escHtml(a.subject)}</code></span> ${meta}</li>`;
        }).join('');
        return `<section class="cmp-req">${head}<ul class="cmp-assertions">${items}</ul></section>`;
      }).join('');
      return htmlDoc(title, options.today, `${summary}${blocks}`);
    }

    case 'product': {
      const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
      const view = buildProductView(scope.id, index);
      const product = canon.products.find(p => p.id === scope.id);
      const title = options.title ?? `Compliance — ${product ? product.name : scope.id}`;
      const summary = `<p class="cmp-summary"><code>${escHtml(scope.id)}</code> · ${view.requirements.length} requirement(s) asserted</p>`;
      if (view.requirements.length === 0) {
        return htmlDoc(title, options.today, `${summary}<p class="cmp-empty">No assertion names this product as its subject.</p>`);
      }
      const rows = view.requirements.map(({ requirement, assertion }) => (
        `<tr>` +
        `<td>${escHtml(requirement.name)} <code>${escHtml(requirement.id)}</code></td>` +
        `<td>${badge(assertion.status)}</td>` +
        `<td><code>${escHtml(assertion.id)}</code></td>` +
        `<td>${assertion.next_review_at ? escHtml(assertion.next_review_at) : '—'}</td>` +
        `</tr>`
      )).join('');
      const head = '<tr><th>Requirement</th><th>Status</th><th>Assertion</th><th>Next review</th></tr>';
      return htmlDoc(title, options.today, `${summary}<table><thead>${head}</thead><tbody>${rows}</tbody></table>`);
    }

    case 'gap': {
      const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
      const report = buildGapReport(index, { today: options.today });
      const title = options.title ?? 'Compliance Gap Dashboard';
      const total = report.requirementsWithoutAssertions.length + report.assertionsWithoutEvidence.length + report.staleAssertions.length;
      const summary = `<p class="cmp-summary">${total} gap(s)</p>`;
      const section = (heading: string, count: number, items: string[]): string => {
        const body = items.length === 0
          ? '<p class="cmp-ok">✓ none</p>'
          : `<ul class="cmp-rows">${items.join('')}</ul>`;
        return `<section class="cmp-section"><h2>${escHtml(heading)} <span class="cmp-count">(${count})</span></h2>${body}</section>`;
      };
      const reqs = report.requirementsWithoutAssertions.map(r => (
        `<li><code>${escHtml(r.id)}</code> ${escHtml(r.name)}${r.severity ? ` <span class="cmp-meta">severity ${escHtml(r.severity)}</span>` : ''}</li>`
      ));
      const noEvidence = report.assertionsWithoutEvidence.map(a => (
        `<li><code>${escHtml(a.id)}</code> <span class="cmp-meta">about <code>${escHtml(a.about)}</code>, subject <code>${escHtml(a.subject)}</code>, status ${escHtml(a.status)}</span></li>`
      ));
      const stale = report.staleAssertions.map(a => (
        `<li><code>${escHtml(a.id)}</code> <span class="cmp-meta">review due ${a.next_review_at ? escHtml(a.next_review_at) : '—'}, subject <code>${escHtml(a.subject)}</code></span></li>`
      ));
      const body = [
        summary,
        section('Requirements without assertions', report.requirementsWithoutAssertions.length, reqs),
        section('Assertions without evidence — ASSERT-007', report.assertionsWithoutEvidence.length, noEvidence),
        section('Stale assertions — ASSERT-008', report.staleAssertions.length, stale),
      ].join('');
      return htmlDoc(title, options.today, body);
    }
  }
}
