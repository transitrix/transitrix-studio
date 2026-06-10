import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import yaml from 'js-yaml';
import { renderComplianceMarkdown } from '../markdown.js';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from '../classify.js';

function synthetic(): ComplianceCanon {
  const canon = emptyCanon();
  ingestComplianceDoc(canon, { notation: 'product', id: 'PRODUCT-M-1', name: 'Mobile App' });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-ERASURE-1', name: 'Erasure', severity: 'high', derived_from: ['LAW-X-1'] });
  ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQUIREMENT-LOG-1', name: 'Logs', severity: 'low' });
  ingestComplianceDoc(canon, { notation: 'assertion', id: 'ASSERTION-1', about: 'REQUIREMENT-ERASURE-1', subject: 'PRODUCT-M-1', status: 'compliant', evidence: [{ kind: 'note', text: 'x' }], next_review_at: '2026-09-01' });
  ingestComplianceDoc(canon, { id: 'LAW-X-1', name: 'Privacy Law', zone: 'codex', type: 'LAW' });
  return canon;
}

describe('renderComplianceMarkdown — matrix', () => {
  it('renders a table with status cells and gap dashes', () => {
    const md = renderComplianceMarkdown(synthetic(), { mode: 'matrix' });
    expect(md).toContain('# Compliance Matrix');
    expect(md).toContain('| Product \\ Requirement | Erasure | Logs |');
    expect(md).toMatch(/\| Mobile App \| Compliant \| — \|/);
  });
});

describe('renderComplianceMarkdown — law', () => {
  it('renders the law name and its requirement with the assertion bullet', () => {
    const md = renderComplianceMarkdown(synthetic(), { mode: 'law', id: 'LAW-X-1' });
    expect(md).toContain('# Compliance — Privacy Law');
    expect(md).toContain('## Erasure (`REQUIREMENT-ERASURE-1`) — severity: high');
    expect(md).toContain('- **Compliant** — `ASSERTION-1`');
  });
});

describe('renderComplianceMarkdown — product', () => {
  it('renders the product table of asserted requirements', () => {
    const md = renderComplianceMarkdown(synthetic(), { mode: 'product', id: 'PRODUCT-M-1' });
    expect(md).toContain('# Compliance — Mobile App');
    expect(md).toContain('| Requirement | Status | Assertion | Next review |');
    expect(md).toMatch(/\| Erasure \(`REQUIREMENT-ERASURE-1`\) \| Compliant \| `ASSERTION-1` \| 2026-09-01 \|/);
  });
});

describe('renderComplianceMarkdown — gap', () => {
  it('lists the un-asserted requirement as a checklist item', () => {
    const md = renderComplianceMarkdown(synthetic(), { mode: 'gap' }, { today: '2026-06-02' });
    expect(md).toContain('## Requirements without assertions (1)');
    expect(md).toContain('- [ ] `REQUIREMENT-LOG-1` Logs — severity: low');
    expect(md).toContain('## Assertions without evidence — ASSERT-007 (0)');
  });
});

// ── Conformance: build canon by ingesting the acme example files ────────────

const examples = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../tests/fixtures/notation-corpus');
function ingestDir(canon: ComplianceCanon, dir: string): void {
  const full = path.join(examples, dir);
  for (const f of readdirSync(full)) {
    if (!f.endsWith('.yaml')) continue;
    ingestComplianceDoc(canon, yaml.load(readFileSync(path.join(full, f), 'utf-8')));
  }
}

describe('renderComplianceMarkdown — acme conformance', () => {
  const canon = emptyCanon();
  ingestDir(canon, 'product');
  ingestDir(canon, 'requirement');
  ingestDir(canon, 'assertion');

  it('matrix marks the dangling PRODUCT-MOBILE-1 row and shows compliant + gaps', () => {
    const md = renderComplianceMarkdown(canon, { mode: 'matrix' });
    expect(md).toContain('PRODUCT-MOBILE-1 ⚠');
    expect(md).toContain('Compliant');
    expect(md).toContain('—'); // at least one gap dash
  });

  it('gap report surfaces the un-asserted audit-log requirement', () => {
    const md = renderComplianceMarkdown(canon, { mode: 'gap' }, { today: '2026-06-02' });
    expect(md).toContain('`REQUIREMENT-AUDIT-LOG-RETENTION-1`');
  });
});

describe('gapMarkdown CV-5 pastDeadlineRequirements section', () => {
  it('includes the 4th section in output', () => {
    const canon = emptyCanon();
    ingestComplianceDoc(canon, { notation: 'requirement', id: 'REQ-PD-1', name: 'Past', deadline: '2020-01-01' });
    const md = renderComplianceMarkdown(canon, { mode: 'gap' }, { today: '2026-06-09' });
    expect(md).toContain('Past-deadline requirements');
    expect(md).toContain('REQ-PD-1');
    expect(md).toContain('2020-01-01');
    expect(md).toContain('4 checks');
  });
});