// Markdown renderers for the compliance views (vkgeorgia/strategy#84 Phase 5).
// Pure string builders consumed by the `transitrix export-compliance` CLI.
// PDF rendering lives in `html.ts` (HTML doc fed to WeasyPrint by the CLI).

import { buildComplianceMatrix } from '../compliance-matrix/index.js';
import { buildComplianceIndex } from './reverse-index.js';
import { buildLawTree, buildProductView } from './views.js';
import { buildGapReport } from './gap-report.js';
import type { ComplianceCanon } from './classify.js';
import type { AssertionStatus } from '../assertion/types.js';

const STATUS_LABELS: Record<AssertionStatus, string> = {
  compliant: 'Compliant',
  partial: 'Partial',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  n_a: 'N/A',
};

/** Escapes a value for a Markdown table cell (pipes + newlines). */
function cell(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

export type ReportScope =
  | { mode: 'matrix' }
  | { mode: 'law'; id: string }
  | { mode: 'product'; id: string }
  | { mode: 'gap' };

export interface MarkdownOptions {
  /** Today as ISO YYYY-MM-DD — enables the gap dashboard's stale-assertion list. */
  today?: string;
}

/** Renders the requested compliance view from a scanned canon to Markdown. */
export function renderComplianceMarkdown(canon: ComplianceCanon, scope: ReportScope, options: MarkdownOptions = {}): string {
  switch (scope.mode) {
    case 'matrix': return matrixMarkdown(canon);
    case 'law': return lawMarkdown(canon, scope.id);
    case 'product': return productMarkdown(canon, scope.id);
    case 'gap': return gapMarkdown(canon, options.today);
  }
}

function matrixMarkdown(canon: ComplianceCanon): string {
  const m = buildComplianceMatrix({ products: canon.products, requirements: canon.requirements, assertions: canon.assertions });
  const out: string[] = ['# Compliance Matrix', ''];
  out.push(`_${m.summary.products} products × ${m.summary.requirements} requirements · ${m.summary.gaps} gaps · ${m.summary.assertions} assertions_`, '');
  if (m.products.length === 0 || m.requirements.length === 0) {
    out.push('_No products or requirements found in the scanned canon._', '');
    return out.join('\n');
  }
  out.push(`| Product \\ Requirement | ${m.requirements.map(r => cell(r.name)).join(' | ')} |`);
  out.push(`|---|${m.requirements.map(() => '---').join('|')}|`);
  m.products.forEach((p, ri) => {
    const cells = m.requirements.map((_r, ci) => {
      const c = m.cells[ri][ci];
      return c.status ? STATUS_LABELS[c.status] : '—';
    });
    const name = cell(p.name) + (p.unresolved ? ' ⚠' : '');
    out.push(`| ${name} | ${cells.join(' | ')} |`);
  });
  out.push('');
  return out.join('\n');
}

function lawMarkdown(canon: ComplianceCanon, lawId: string): string {
  const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
  const tree = buildLawTree(lawId, index);
  const law = canon.codex.find(c => c.id === lawId);
  const out: string[] = [`# Compliance — ${law ? law.name : lawId}`, ''];
  out.push(`\`${lawId}\` · ${tree.requirements.length} requirement(s)`, '');
  if (tree.requirements.length === 0) {
    out.push(`_No requirements derive from \`${lawId}\`._`, '');
    return out.join('\n');
  }
  for (const node of tree.requirements) {
    const sev = node.requirement.severity ? ` — severity: ${node.requirement.severity}` : '';
    out.push(`## ${node.requirement.name} (\`${node.requirement.id}\`)${sev}`, '');
    if (node.assertions.length === 0) {
      out.push('_No assertion — compliance gap._', '');
      continue;
    }
    for (const a of node.assertions) {
      const meta = [a.assessed_at ? `assessed ${a.assessed_at}` : null, a.next_review_at ? `review by ${a.next_review_at}` : null].filter(Boolean).join(', ');
      out.push(`- **${STATUS_LABELS[a.status]}** — \`${a.id}\` (subject \`${a.subject}\`${meta ? `; ${meta}` : ''})`);
    }
    out.push('');
  }
  return out.join('\n');
}

function productMarkdown(canon: ComplianceCanon, productId: string): string {
  const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
  const view = buildProductView(productId, index);
  const product = canon.products.find(p => p.id === productId);
  const out: string[] = [`# Compliance — ${product ? product.name : productId}`, ''];
  out.push(`\`${productId}\` · ${view.requirements.length} requirement(s) asserted`, '');
  if (view.requirements.length === 0) {
    out.push('_No assertion names this product as its subject._', '');
    return out.join('\n');
  }
  out.push('| Requirement | Status | Assertion | Next review |', '|---|---|---|---|');
  for (const { requirement, assertion } of view.requirements) {
    out.push(`| ${cell(requirement.name)} (\`${requirement.id}\`) | ${STATUS_LABELS[assertion.status]} | \`${assertion.id}\` | ${assertion.next_review_at ?? '—'} |`);
  }
  out.push('');
  return out.join('\n');
}

function gapMarkdown(canon: ComplianceCanon, today?: string): string {
  const index = buildComplianceIndex({ requirements: canon.requirements, assertions: canon.assertions });
  const report = buildGapReport(index, { today });
  const total = report.requirementsWithoutAssertions.length + report.assertionsWithoutEvidence.length + report.staleAssertions.length;
  const out: string[] = ['# Compliance Gap Dashboard', '', `_${total} gap(s)_`, ''];

  out.push(`## Requirements without assertions (${report.requirementsWithoutAssertions.length})`, '');
  if (report.requirementsWithoutAssertions.length === 0) out.push('_✓ none_', '');
  else { for (const r of report.requirementsWithoutAssertions) out.push(`- [ ] \`${r.id}\` ${r.name}${r.severity ? ` — severity: ${r.severity}` : ''}`); out.push(''); }

  out.push(`## Assertions without evidence — ASSERT-007 (${report.assertionsWithoutEvidence.length})`, '');
  if (report.assertionsWithoutEvidence.length === 0) out.push('_✓ none_', '');
  else { for (const a of report.assertionsWithoutEvidence) out.push(`- [ ] \`${a.id}\` — about \`${a.about}\`, subject \`${a.subject}\`, status ${a.status}`); out.push(''); }

  out.push(`## Stale assertions — ASSERT-008 (${report.staleAssertions.length})`, '');
  if (report.staleAssertions.length === 0) out.push('_✓ none_', '');
  else { for (const a of report.staleAssertions) out.push(`- [ ] \`${a.id}\` — review due ${a.next_review_at ?? '—'}, subject \`${a.subject}\``); out.push(''); }

  return out.join('\n');
}
