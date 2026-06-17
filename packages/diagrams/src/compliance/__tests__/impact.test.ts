import { describe, it, expect } from 'vitest';
import { emptyCanon } from '../classify.js';
import {
  buildImpactMatrix,
  renderImpactMarkdown,
  parseImpactViewConfig,
  COMPLIANCE_IMPACT_DEFAULTS,
  extractObjectDetails,
  computeDeadlineStatus,
  type ImpactViewConfig,
} from '../impact.js';
import type { ComplianceCanon } from '../classify.js';

// Industry- and regime-agnostic synthetic fixture: opaque ids only, no real
// regulator / product names, per #166 acceptance ("Output is aggregates only —
// no subject/obligation names tied to any real corpus").
function buildCanon(): ComplianceCanon {
  const canon = emptyCanon();
  canon.products.push({ id: 'PRODUCT-A-1', name: 'Product A' });
  canon.products.push({ id: 'PRODUCT-B-1', name: 'Product B' });
  canon.requirements.push(
    { id: 'REQUIREMENT-FOO-1', name: 'Foo', derived_from: ['LAW-X-1'] },
    { id: 'REQUIREMENT-BAR-1', name: 'Bar', derived_from: ['LAW-X-1', 'REGULATION-Y-1'] },
    { id: 'REQUIREMENT-BAZ-1', name: 'Baz', derived_from: ['REGULATION-Y-1'] },
    // Internal-only requirement, no codex derivation:
    { id: 'REQUIREMENT-INT-1', name: 'Internal-only' },
  );
  canon.assertions.push(
    // (PRODUCT-A-1, FOO) — two assertions; partial wins over compliant per §5.2 step 4.
    { id: 'ASSERTION-1', about: 'REQUIREMENT-FOO-1', subject: 'PRODUCT-A-1', status: 'compliant' },
    { id: 'ASSERTION-2', about: 'REQUIREMENT-FOO-1', subject: 'PRODUCT-A-1', status: 'partial' },
    // (PRODUCT-A-1, BAR) — single n_a → modelled fact ("No obligation applies").
    { id: 'ASSERTION-3', about: 'REQUIREMENT-BAR-1', subject: 'PRODUCT-A-1', status: 'n_a' },
    // (PRODUCT-B-1, BAR) — non_compliant.
    { id: 'ASSERTION-4', about: 'REQUIREMENT-BAR-1', subject: 'PRODUCT-B-1', status: 'non_compliant' },
    // (PRODUCT-B-1, BAZ) — under_review beats compliant.
    { id: 'ASSERTION-5', about: 'REQUIREMENT-BAZ-1', subject: 'PRODUCT-B-1', status: 'under_review' },
    { id: 'ASSERTION-6', about: 'REQUIREMENT-BAZ-1', subject: 'PRODUCT-B-1', status: 'compliant' },
  );
  return canon;
}

const baseConfig: ImpactViewConfig = {
  id: 'COMPLIANCE_IMPACT-FIXTURE-1',
  name: 'Fixture matrix',
  subjects: { products: ['PRODUCT-A-1', 'PRODUCT-B-1'] },
  obligations: {},
};

describe('buildImpactMatrix', () => {
  it('aggregates statuses per §5.2 step 4 — non_compliant > partial > under_review > compliant', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-FOO-1', 'REQUIREMENT-BAR-1', 'REQUIREMENT-BAZ-1'] },
    });
    expect(matrix.columns.map(c => c.label)).toEqual(['PRODUCT-A-1', 'PRODUCT-B-1']);
    expect(matrix.rows.map(r => r.id)).toEqual(['REQUIREMENT-BAR-1', 'REQUIREMENT-BAZ-1', 'REQUIREMENT-FOO-1']);

    const cellFor = (req: string, subject: string) => {
      const r = matrix.rows.findIndex(x => x.id === req);
      const c = matrix.columns.findIndex(col => col.label === subject);
      return matrix.cells[r][c];
    };

    expect(cellFor('REQUIREMENT-FOO-1', 'PRODUCT-A-1').status).toBe('partial');
    expect(cellFor('REQUIREMENT-FOO-1', 'PRODUCT-A-1').kind).toBe('bound');
    expect(cellFor('REQUIREMENT-BAR-1', 'PRODUCT-A-1').kind).toBe('n_a_only');
    expect(cellFor('REQUIREMENT-BAR-1', 'PRODUCT-B-1').status).toBe('non_compliant');
    expect(cellFor('REQUIREMENT-BAZ-1', 'PRODUCT-B-1').status).toBe('under_review');
    expect(cellFor('REQUIREMENT-FOO-1', 'PRODUCT-B-1').kind).toBe('gap');
    expect(cellFor('REQUIREMENT-BAZ-1', 'PRODUCT-A-1').kind).toBe('gap');
  });

  it('selects obligations by `filter.derived_from_codex`', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { filter: { derived_from_codex: ['REGULATION-Y-1'] } },
    });
    expect(matrix.rows.map(r => r.id)).toEqual(['REQUIREMENT-BAR-1', 'REQUIREMENT-BAZ-1']);
  });

  it('`include` wins when both `include` and `filter` are present (COMPIMP-007)', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: {
        include: ['REQUIREMENT-INT-1'],
        filter: { derived_from_codex: ['LAW-X-1'] },
      },
    });
    expect(matrix.rows.map(r => r.id)).toEqual(['REQUIREMENT-INT-1']);
  });

  it('distinguishes modelling gap from n_a-only per §5.3', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-BAR-1'] },
    });
    const aCell = matrix.cells[0][matrix.columns.findIndex(c => c.label === 'PRODUCT-A-1')];
    const bCell = matrix.cells[0][matrix.columns.findIndex(c => c.label === 'PRODUCT-B-1')];
    expect(aCell.kind).toBe('n_a_only');
    expect(bCell.kind).toBe('bound');
    expect(bCell.status).toBe('non_compliant');
  });

  it('respects `status_display.show` — filtered-out statuses leave the cell as a gap', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-BAZ-1'] },
      status_display: { show: ['non_compliant'] }, // under_review + compliant filtered out
    });
    const cell = matrix.cells[0][matrix.columns.findIndex(c => c.label === 'PRODUCT-B-1')];
    expect(cell.kind).toBe('gap');
  });

  it('keeps subjects with no binding obligation as columns so the gap is visible', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      subjects: { products: ['PRODUCT-A-1', 'PRODUCT-B-1', 'PRODUCT-NONE-1'] },
      obligations: { include: ['REQUIREMENT-FOO-1'] },
    });
    expect(matrix.columns.map(c => c.label)).toContain('PRODUCT-NONE-1');
    const cell = matrix.cells[0][matrix.columns.findIndex(c => c.label === 'PRODUCT-NONE-1')];
    expect(cell.kind).toBe('gap');
  });

  it('orders rows alphabetically by name when `order_rows_by: name`', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-FOO-1', 'REQUIREMENT-BAR-1', 'REQUIREMENT-BAZ-1'] },
      order_rows_by: 'name',
    });
    expect(matrix.rows.map(r => r.name)).toEqual(['Bar', 'Baz', 'Foo']);
  });
});

describe('renderImpactMarkdown', () => {
  it('renders a header, table, and §5.3 legend', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-FOO-1', 'REQUIREMENT-BAR-1'] },
    });
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('# Fixture matrix');
    expect(md).toContain('View ID: `COMPLIANCE_IMPACT-FIXTURE-1`');
    expect(md).toContain('| Obligation | PRODUCT-A-1 | PRODUCT-B-1 |');
    expect(md).toContain('PARTIAL');
    expect(md).toContain('FAIL');
    expect(md).toContain('No mapped obligation (current model)');
    expect(md).toContain('No obligation applies');
    expect(md).toContain('## Legend');
  });

  it('honours custom empty-cell labels', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-FOO-1', 'REQUIREMENT-BAR-1'] },
      empty_cells: {
        no_obligation_label: 'GAP',
        no_obligation_applies_label: 'EXCLUDED',
      },
    });
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('GAP');
    expect(md).toContain('EXCLUDED');
    expect(md).not.toContain('No mapped obligation (current model)');
  });

  it('renders a placeholder when zero obligations are selected', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, {
      ...baseConfig,
      obligations: { include: ['REQUIREMENT-DOES-NOT-EXIST-1'] },
    });
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('No obligations in scope');
  });

  it('propagates snapshot_at into the matrix and renders it', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, { ...baseConfig, snapshot_at: '2026-06-09' });
    expect(matrix.snapshotAt).toBe('2026-06-09');
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('Report snapshot: 2026-06-09');
  });

  it('resolves capability subject names from canon.subjects', () => {
    const canon = emptyCanon();
    canon.subjects.push({ id: 'CAPABILITY-CRM-1', name: 'CRM Platform' });
    canon.requirements.push({ id: 'REQUIREMENT-FOO-1', name: 'Foo' });
    canon.assertions.push({
      id: 'ASSERTION-1',
      about: 'REQUIREMENT-FOO-1',
      subject: 'CAPABILITY-CRM-1',
      status: 'compliant',
    });
    const matrix = buildImpactMatrix(canon, {
      id: 'V-1', name: 'Test',
      subjects: { capabilities: ['CAPABILITY-CRM-1'] },
      obligations: {},
    });
    expect(matrix.columns[0].subjectId).toBe('CAPABILITY-CRM-1');
    expect(matrix.columns[0].subjectName).toBe('CRM Platform');
    expect(matrix.cells[0][0].status).toBe('compliant');
  });

  it('resolves process subject names from canon.subjects', () => {
    const canon = emptyCanon();
    canon.subjects.push({ id: 'PROCESS-CS-1', name: 'Customer Support' });
    canon.requirements.push({ id: 'REQUIREMENT-BAR-1', name: 'Bar' });
    canon.assertions.push({
      id: 'ASSERTION-P1',
      about: 'REQUIREMENT-BAR-1',
      subject: 'PROCESS-CS-1',
      status: 'partial',
    });
    const matrix = buildImpactMatrix(canon, {
      id: 'V-2', name: 'Test',
      subjects: { processes: ['PROCESS-CS-1'] },
      obligations: {},
    });
    expect(matrix.columns[0].subjectName).toBe('Customer Support');
    expect(matrix.cells[0][0].status).toBe('partial');
  });

  it('mixed product + capability columns — names resolved from respective buckets', () => {
    const canon = buildCanon();
    canon.subjects.push({ id: 'CAPABILITY-CRM-1', name: 'CRM' });
    canon.requirements.push({ id: 'REQUIREMENT-CRM-1', name: 'CRM req' });
    canon.assertions.push({
      id: 'ASSERTION-CRM-1',
      about: 'REQUIREMENT-CRM-1',
      subject: 'CAPABILITY-CRM-1',
      status: 'under_review',
    });
    const matrix = buildImpactMatrix(canon, {
      id: 'V-3', name: 'Mixed',
      subjects: { products: ['PRODUCT-A-1'], capabilities: ['CAPABILITY-CRM-1'] },
      obligations: {},
    });
    expect(matrix.columns.map(c => c.subjectId)).toEqual(['PRODUCT-A-1', 'CAPABILITY-CRM-1']);
    expect(matrix.columns[0].subjectName).toBe('Product A');
    expect(matrix.columns[1].subjectName).toBe('CRM');
  });

  it('pending_owner cell renders as bound with PENDING status', () => {
    const canon = emptyCanon();
    canon.products.push({ id: 'PRODUCT-A-1', name: 'Product A' });
    canon.requirements.push({ id: 'REQUIREMENT-PO-1', name: 'PO req' });
    canon.assertions.push({
      id: 'ASSERTION-PO-1',
      about: 'REQUIREMENT-PO-1',
      subject: 'PRODUCT-A-1',
      status: 'pending_owner',
      owner_to_confirm: 'alice@example.com',
    });
    const matrix = buildImpactMatrix(canon, {
      id: 'V-PO', name: 'PO Test',
      subjects: { products: ['PRODUCT-A-1'] },
      obligations: {},
    });
    expect(matrix.cells[0][0].kind).toBe('bound');
    expect(matrix.cells[0][0].status).toBe('pending_owner');
    expect(matrix.cells[0][0].assertions[0].owner_to_confirm).toBe('alice@example.com');
  });

  it('pending_owner loses to partial in aggregation', () => {
    const canon = emptyCanon();
    canon.products.push({ id: 'PRODUCT-A-1', name: 'Product A' });
    canon.requirements.push({ id: 'REQUIREMENT-PO-2', name: 'PO req 2' });
    canon.assertions.push(
      { id: 'ASSERTION-PO-2a', about: 'REQUIREMENT-PO-2', subject: 'PRODUCT-A-1', status: 'partial' },
      { id: 'ASSERTION-PO-2b', about: 'REQUIREMENT-PO-2', subject: 'PRODUCT-A-1', status: 'pending_owner' },
    );
    const matrix = buildImpactMatrix(canon, {
      id: 'V-PO2', name: 'PO Agg',
      subjects: { products: ['PRODUCT-A-1'] },
      obligations: {},
    });
    expect(matrix.cells[0][0].status).toBe('partial');
  });
});

// ── parseImpactViewConfig ───────────────────────────────────────────────────

describe('parseImpactViewConfig', () => {
  it('returns ok:false for a non-object', () => {
    const r = parseImpactViewConfig(null);
    expect(r.ok).toBe(false);
  });

  it('returns ok:false when id is missing', () => {
    const r = parseImpactViewConfig({ name: 'X', subjects: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.includes('id'))).toBe(true);
  });

  it('returns ok:false when name is missing', () => {
    const r = parseImpactViewConfig({ id: 'X', subjects: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some(e => e.includes('name'))).toBe(true);
  });

  it('unwraps the top-level view: wrapper', () => {
    const r = parseImpactViewConfig({ view: { id: 'V-1', name: 'My view', subjects: {} } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.id).toBe('V-1');
  });

  it('fills all optional fields from COMPLIANCE_IMPACT_DEFAULTS', () => {
    const r = parseImpactViewConfig({ id: 'V-1', name: 'My view', subjects: {} });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.config;
    expect(c.subjects.products).toEqual([]);
    expect(c.subjects.processes).toEqual([]);
    expect(c.subjects.capabilities).toEqual([]);
    expect(c.status_display?.show).toEqual(COMPLIANCE_IMPACT_DEFAULTS.status_display.show);
    expect(c.order_rows_by).toBe('id');
    expect(c.empty_cells?.no_obligation_label).toBe(
      COMPLIANCE_IMPACT_DEFAULTS.empty_cells.no_obligation_label,
    );
    expect(c.empty_cells?.no_obligation_applies_label).toBe(
      COMPLIANCE_IMPACT_DEFAULTS.empty_cells.no_obligation_applies_label,
    );
  });

  it('preserves explicit subject lists and snapshot_at', () => {
    const r = parseImpactViewConfig({
      id: 'V-2',
      name: 'View 2',
      snapshot_at: '2026-01-01',
      subjects: { products: ['PRODUCT-A-1', 'PRODUCT-B-1'] },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.config.subjects.products).toEqual(['PRODUCT-A-1', 'PRODUCT-B-1']);
    expect(r.config.snapshot_at).toBe('2026-01-01');
  });

  it('applies custom order_rows_by:name', () => {
    const r = parseImpactViewConfig({ id: 'V-3', name: 'V', subjects: {}, order_rows_by: 'name' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.order_rows_by).toBe('name');
  });

  it('parses obligation filter correctly', () => {
    const r = parseImpactViewConfig({
      id: 'V-4',
      name: 'V',
      subjects: {},
      obligations: { filter: { derived_from_codex: ['LAW-X-1'] } },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.obligations.filter?.derived_from_codex).toEqual(['LAW-X-1']);
  });
});

describe('CV-3a — stage grouping (ImpactColumn, extractObjectDetails, buildImpactMatrix stage grain)', () => {
  it('default product grain: columns are plain ImpactColumn with label=subjectId', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(canon, baseConfig);
    expect(matrix.columns.map(c => c.subjectId)).toEqual(['PRODUCT-A-1', 'PRODUCT-B-1']);
    expect(matrix.columns.map(c => c.label)).toEqual(['PRODUCT-A-1', 'PRODUCT-B-1']);
    expect(matrix.columns.every(c => !c.stageId)).toBe(true);
  });

  it('product-stage grain: expands columns by stage, label is subjectId:stageId', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(
      canon,
      { ...baseConfig, subjects: { products: ['PRODUCT-A-1'] }, grouping: { columns: 'object-details' } },
      [{ objectId: 'PRODUCT-A-1', details: [{ id: 'STAGE-1', name: 'Stage One' }, { id: 'STAGE-2', name: 'Stage Two' }] }],
    );
    expect(matrix.columns.map(c => c.label)).toEqual(['PRODUCT-A-1:STAGE-1', 'PRODUCT-A-1:STAGE-2']);
    expect(matrix.columns.map(c => c.stageId)).toEqual(['STAGE-1', 'STAGE-2']);
  });

  it('assertion without realised_via fills every stage column for its subject', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1' });
    // Assertion with no realised_via — covers the whole subject.
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(
      canon,
      {
        id: 'V', name: 'V',
        subjects: { products: ['PROD-1'] },
        obligations: {},
        grouping: { columns: 'object-details' },
      },
      [{ objectId: 'PROD-1', details: [{ id: 'S1', name: 's1' }, { id: 'S2', name: 's2' }] }],
    );
    // Both stage columns should be bound (no realised_via means all stages inherit).
    expect(matrix.cells[0][0].kind).toBe('bound');
    expect(matrix.cells[0][1].kind).toBe('bound');
  });

  it('assertion with realised_via fills only the matching stage column', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1' });
    // Assertion only covers STAGE-A.
    canon.assertions.push({
      id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant',
      realised_via: ['STAGE-A'],
    });
    const matrix = buildImpactMatrix(
      canon,
      {
        id: 'V', name: 'V',
        subjects: { products: ['PROD-1'] },
        obligations: {},
        grouping: { columns: 'object-details' },
      },
      [{ objectId: 'PROD-1', details: [{ id: 'STAGE-A', name: 'a' }, { id: 'STAGE-B', name: 'b' }] }],
    );
    expect(matrix.cells[0][0].kind).toBe('bound');   // STAGE-A: covered
    expect(matrix.cells[0][1].kind).toBe('gap');     // STAGE-B: gap
  });

  it('subject with no stage mapping falls back to single product-grain column', () => {
    const canon = buildCanon();
    const matrix = buildImpactMatrix(
      canon,
      {
        ...baseConfig,
        subjects: { products: ['PRODUCT-A-1', 'PRODUCT-B-1'] },
        grouping: { columns: 'object-details' },
      },
      // Only provide stages for A — B falls back to a single column.
      [{ objectId: 'PRODUCT-A-1', details: [{ id: 'S1', name: 's1' }] }],
    );
    expect(matrix.columns.map(c => c.label)).toEqual(['PRODUCT-A-1:S1', 'PRODUCT-B-1']);
    // PRODUCT-B-1 fallback column: no stageId.
    expect(matrix.columns[1].stageId).toBeUndefined();
  });

  it('extractObjectDetails — returns null for non-blueprint docs', () => {
    expect(extractObjectDetails(null)).toBeNull();
    expect(extractObjectDetails({ notation: 'requirement', id: 'R1' })).toBeNull();
    expect(extractObjectDetails({ process_blueprint: { details: [{ id: 'S1' }] } })).toBeNull(); // missing id
  });

  it('extractObjectDetails — extracts subjectId and stages from process_blueprint wrapper', () => {
    const doc = { process_blueprint: { id: 'PROC-1', notation: 'process_blueprint', stages: [{ id: 'S1', name: 'Stage One' }, { id: 'S2', name: 'Stage Two' }] } };
    const sg = extractObjectDetails(doc);
    expect(sg).not.toBeNull();
    expect(sg!.objectId).toBe('PROC-1');
    expect(sg!.details.map((s: { id: string }) => s.id)).toEqual(['S1', 'S2']);
  });

  it('renderImpactMarkdown uses column labels in the table header', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'Req' });
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(
      canon,
      {
        id: 'V', name: 'Stage Report',
        subjects: { products: ['PROD-1'] },
        obligations: {},
        grouping: { columns: 'object-details' },
      },
      [{ objectId: 'PROD-1', details: [{ id: 'S1', name: 'Stage One' }] }],
    );
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('PROD-1:S1');
  });
});

describe('CV-3 -- blueprint-lane decorations + obligations lane', () => {
  it('computeDeadlineStatus function is available', () => {
    expect(typeof computeDeadlineStatus).toBe('function');
  });

  it('cell.decoration.isNew = false when no snapshot_at', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', admitted_at: '2026-01-01' });
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    expect(matrix.cells[0][0].decoration.isNew).toBe(false);
  });

  it('cell.decoration.isNew = true when req admitted after snapshot_at', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', admitted_at: '2026-06-01' });
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      snapshot_at: '2026-05-01',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    // admitted_at (2026-06-01) > snapshot_at (2026-05-01) -> isNew
    expect(matrix.cells[0][0].decoration.isNew).toBe(true);
  });

  it('cell.decoration.isUrgent = true when gap + past_due deadline', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', deadline: '2000-01-01' });
    // No assertion -> gap cell
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    expect(matrix.cells[0][0].kind).toBe('gap');
    expect(matrix.cells[0][0].decoration.isUrgent).toBe(true);
    expect(matrix.cells[0][0].decoration.deadlineStatus).toBe('past_due');
  });

  it('cell.decoration.isUrgent = false on bound cell even with past deadline', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', deadline: '2000-01-01' });
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    expect(matrix.cells[0][0].kind).toBe('bound');
    // Not urgent: cell is bound, not a gap
    expect(matrix.cells[0][0].decoration.isUrgent).toBe(false);
  });

  it('obligationsLane lists derived_from codex IDs for non-gap columns', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', derived_from: ['LAW-X', 'REG-Y'] });
    canon.requirements.push({ id: 'REQ-2', name: 'R2', derived_from: ['LAW-X'] });
    // Only REQ-1 is bound in PROD-1 column; REQ-2 is a gap
    canon.assertions.push({ id: 'ASS-1', about: 'REQ-1', subject: 'PROD-1', status: 'compliant' });
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    // obligationsLane[0] (PROD-1 column): REQ-1 is bound -> derived_from -> LAW-X, REG-Y sorted
    expect(matrix.obligationsLane[0]).toEqual(['LAW-X', 'REG-Y']);
  });

  it('obligationsLane is empty for columns with only gap cells', () => {
    const canon = emptyCanon();
    canon.requirements.push({ id: 'REQ-1', name: 'R1', derived_from: ['LAW-X'] });
    // No assertions -> all gaps
    const matrix = buildImpactMatrix(canon, {
      id: 'V', name: 'V',
      subjects: { products: ['PROD-1'] },
      obligations: {},
    });
    expect(matrix.obligationsLane[0]).toEqual([]);
  });
});

describe('computeDeadlineStatus', () => {
  it('returns none for missing deadline', () => {
    expect(computeDeadlineStatus(undefined, '2026-06-01')).toBe('none');
  });
  it('returns past_due when deadline < today', () => {
    expect(computeDeadlineStatus('2026-01-01', '2026-06-01')).toBe('past_due');
  });
  it('returns in_force within 30 days', () => {
    expect(computeDeadlineStatus('2026-06-20', '2026-06-01')).toBe('in_force');
  });
  it('returns upcoming more than 30 days away', () => {
    expect(computeDeadlineStatus('2026-12-31', '2026-06-01')).toBe('upcoming');
  });
});