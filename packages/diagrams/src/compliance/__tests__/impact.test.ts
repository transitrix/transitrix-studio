import { describe, it, expect } from 'vitest';
import { emptyCanon } from '../classify.js';
import {
  buildImpactMatrix,
  renderImpactMarkdown,
  parseImpactViewConfig,
  COMPLIANCE_IMPACT_DEFAULTS,
  extractStageGroups,
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

describe('CV-3a — stage grouping (ImpactColumn, extractStageGroups, buildImpactMatrix stage grain)', () => {
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
      { ...baseConfig, subjects: { products: ['PRODUCT-A-1'] }, grouping: { columns: 'product-stage' } },
      [{ subjectId: 'PRODUCT-A-1', stages: [{ id: 'STAGE-1', name: 'Stage One' }, { id: 'STAGE-2', name: 'Stage Two' }] }],
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
        grouping: { columns: 'product-stage' },
      },
      [{ subjectId: 'PROD-1', stages: [{ id: 'S1', name: 's1' }, { id: 'S2', name: 's2' }] }],
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
        grouping: { columns: 'product-stage' },
      },
      [{ subjectId: 'PROD-1', stages: [{ id: 'STAGE-A', name: 'a' }, { id: 'STAGE-B', name: 'b' }] }],
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
        grouping: { columns: 'product-stage' },
      },
      // Only provide stages for A — B falls back to a single column.
      [{ subjectId: 'PRODUCT-A-1', stages: [{ id: 'S1', name: 's1' }] }],
    );
    expect(matrix.columns.map(c => c.label)).toEqual(['PRODUCT-A-1:S1', 'PRODUCT-B-1']);
    // PRODUCT-B-1 fallback column: no stageId.
    expect(matrix.columns[1].stageId).toBeUndefined();
  });

  it('extractStageGroups — returns null for non-blueprint docs', () => {
    expect(extractStageGroups(null)).toBeNull();
    expect(extractStageGroups({ notation: 'requirement', id: 'R1' })).toBeNull();
    expect(extractStageGroups({ process_blueprint: { stages: [{ id: 'S1' }] } })).toBeNull(); // missing id
  });

  it('extractStageGroups — extracts subjectId and stages from process_blueprint wrapper', () => {
    const doc = { process_blueprint: { id: 'PROC-1', notation: 'process_blueprint', stages: [{ id: 'S1', name: 'Stage One' }, { id: 'S2', name: 'Stage Two' }] } };
    const sg = extractStageGroups(doc);
    expect(sg).not.toBeNull();
    expect(sg!.subjectId).toBe('PROC-1');
    expect(sg!.stages.map((s: { id: string }) => s.id)).toEqual(['S1', 'S2']);
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
        grouping: { columns: 'product-stage' },
      },
      [{ subjectId: 'PROD-1', stages: [{ id: 'S1', name: 'Stage One' }] }],
    );
    const md = renderImpactMarkdown(matrix);
    expect(md).toContain('PROD-1:S1');
  });
});