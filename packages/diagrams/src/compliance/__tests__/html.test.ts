import { describe, it, expect } from 'vitest';
import { renderComplianceHtml } from '../html.js';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from '../classify.js';

function synthetic(): ComplianceCanon {
  const canon = emptyCanon();
  ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-M-1', name: 'Mobile App' });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-ERASURE-1', name: 'Erasure', severity: 'high', derived_from: ['LAW-X-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-LOG-1', name: 'Logs', severity: 'low' });
  ingestComplianceDoc(canon, {
    notation: 'assertion',
    id: 'ASSERTION-1',
    about: 'REQUIREMENT-ERASURE-1',
    subject: 'PRODUCT-M-1',
    status: 'compliant',
    evidence: [{ kind: 'note', text: 'x' }],
    next_review_at: '2026-09-01',
  });
  ingestComplianceDoc(canon, { id: 'LAW-X-1', name: 'Privacy Law', zone: 'codex', type: 'LAW' });
  return canon;
}

describe('renderComplianceHtml — document shell', () => {
  it('produces a complete HTML document with branded header and stamp', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'matrix' }, { today: '2026-06-03' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Compliance Matrix</title>');
    expect(html).toContain('<div class="cmp-eyebrow">Transitrix · Compliance</div>');
    expect(html).toContain('<h1>Compliance Matrix</h1>');
    expect(html).toContain('Generated 2026-06-03');
    expect(html).toContain('@page');
    expect(html).toContain('size: A4 portrait');
  });

  it('escapes HTML in product and requirement names', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-X-1', name: '<Mobile> & "Web"' });
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-X-1', name: 'A & B' });
    const html = renderComplianceHtml(canon, { mode: 'matrix' });
    expect(html).not.toMatch(/<Mobile>/);
    expect(html).toContain('&lt;Mobile&gt; &amp; &quot;Web&quot;');
    expect(html).toContain('A &amp; B');
  });
});

describe('renderComplianceHtml — matrix', () => {
  it('renders a table with status badges and gap cells', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'matrix' });
    expect(html).toContain('<table class="cmp-matrix">');
    expect(html).toContain('<th>Erasure</th>');
    expect(html).toContain('<th>Logs</th>');
    expect(html).toContain('<span class="cmp-badge cmp-compliant">Compliant</span>');
    expect(html).toMatch(/cmp-cell-gap/);
    expect(html).toContain('1 products × 2 requirements');
  });

  it('shows an empty-state message when nothing was scanned', () => {
    const html = renderComplianceHtml(emptyCanon(), { mode: 'matrix' });
    expect(html).toContain('No products or requirements found');
  });
});

describe('renderComplianceHtml — law', () => {
  it('renders the law name, requirement block, and assertion bullet with badge', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'law', id: 'LAW-X-1' });
    expect(html).toContain('<h1>Compliance — Privacy Law</h1>');
    expect(html).toContain('class="cmp-req-name">Erasure');
    expect(html).toContain('class="cmp-req-id">REQUIREMENT-ERASURE-1');
    expect(html).toContain('cmp-sev cmp-sev-high');
    expect(html).toContain('cmp-badge cmp-compliant');
    expect(html).toContain('review by 2026-09-01');
  });

  it('handles an unknown law id with an empty-state message', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'law', id: 'LAW-NONE' });
    expect(html).toContain('<h1>Compliance — LAW-NONE</h1>');
    expect(html).toContain('No requirements derive from');
  });
});

describe('renderComplianceHtml — product', () => {
  it('renders the product table of asserted requirements', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'product', id: 'PRODUCT-M-1' });
    expect(html).toContain('<h1>Compliance — Mobile App</h1>');
    expect(html).toContain('<th>Requirement</th>');
    expect(html).toContain('<th>Status</th>');
    expect(html).toContain('cmp-badge cmp-compliant');
    expect(html).toContain('2026-09-01');
  });
});

describe('renderComplianceHtml — gap', () => {
  it('lists the un-asserted requirement and shows ✓ none for clean sections', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'gap' }, { today: '2026-06-02' });
    expect(html).toContain('Requirements without assertions');
    expect(html).toContain('REQUIREMENT-LOG-1');
    expect(html).toContain('severity low');
    expect(html).toContain('Assertions without evidence — ASSERT-007');
    expect(html).toContain('Stale assertions — ASSERT-008');
    expect(html).toContain('class="cmp-ok">✓ none');
  });

  it('counts gaps in the summary line', () => {
    const html = renderComplianceHtml(synthetic(), { mode: 'gap' });
    expect(html).toMatch(/1 gap\(s\)/);
  });
});

// ── CV-6: renderImpactMatrixHtml ─────────────────────────────────────────────

import { renderImpactMatrixHtml } from '../html.js';
import { buildImpactMatrix } from '../impact.js';

describe('renderImpactMatrixHtml (CV-6)', () => {
  it('returns a complete HTML document with matrix title and table', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'product', id: 'PROD-1', name: 'Product One' });
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-1', name: 'Req One', severity: 'high' });
    ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(
      { products: canon.products, requirements: canon.requirements, assertions: canon.assertions, codex: canon.codex, subjects: canon.subjects },
      { id: 'VIEW-1', name: 'My View', subjects: { products: ['PROD-1'] }, obligations: {} },
    );
    const html = renderImpactMatrixHtml(matrix, { today: '2026-06-09' });
    expect(html).toContain('<table>');
    expect(html).toContain('My View');
    expect(html).toContain('VIEW-1');
    expect(html).toContain('OK');
  });

  it('renders gap cells with no_obligation_label text', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'product', id: 'PROD-1', name: 'P1' });
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-1', name: 'R1' });
    const matrix = buildImpactMatrix(
      { products: canon.products, requirements: canon.requirements, assertions: canon.assertions, codex: canon.codex, subjects: canon.subjects },
      { id: 'V2', name: 'V2', subjects: { products: ['PROD-1'] }, obligations: {} },
    );
    const html = renderImpactMatrixHtml(matrix);
    expect(html).toContain('No mapped obligation');
  });
});