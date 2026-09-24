import { describe, it, expect } from 'vitest';
import { buildComplianceIndex } from '../reverse-index.js';
import { buildRequirementTrace, buildTraceElementCatalog } from '../trace.js';
import type { ComplianceIndexInput } from '../types.js';
import type { ComplianceCodexDoc } from '../classify.js';

// Requirement traceability + hierarchy view.
//
// The two halves the view exposes:
//   1. Trace chain — derived_from → REQUIREMENT → ASSERTION → subject +
//      realised_via.
//   2. Hierarchy — parent chain + children via the `parent` field
//      (15-requirement.md §2.4 / ELEMENT_PRIMITIVES.md §7.13).

const input: ComplianceIndexInput = {
  requirements: [
    // A broad legislative parent decomposed into two child requirements.
    { id: 'REQUIREMENT-DATA-PROTECTION-1', name: 'Personal-data protection', origin: 'legislative', derived_from: ['REGULATION-GDPR-2016-1'], element_kind: 'requirement' },
    { id: 'REQUIREMENT-DATA-ERASURE-1',    name: 'Erase on request within 30 days', origin: 'legislative', parent: 'REQUIREMENT-DATA-PROTECTION-1', derived_from: ['REGULATION-GDPR-2016-1'], element_kind: 'requirement' },
    { id: 'REQUIREMENT-DATA-CONSENT-1',    name: 'Obtain consent before processing', origin: 'legislative', parent: 'REQUIREMENT-DATA-PROTECTION-1', element_kind: 'requirement' },
    // A process-product sub-requirement below the erasure duty (cross-origin).
    { id: 'REQUIREMENT-ERASURE-SLA-1',     name: 'Erasure SOP — 30d target', origin: 'process-product', parent: 'REQUIREMENT-DATA-ERASURE-1', element_kind: 'requirement' },
    // Constraint hierarchy (mirror pattern).
    { id: 'CONSTRAINT-EEA-TRANSFER-1',     name: 'No transfer outside EEA without safeguards', element_kind: 'constraint' },
    { id: 'CONSTRAINT-EEA-ANALYTICS-1',    name: 'No PII in analytics logs', parent: 'CONSTRAINT-EEA-TRANSFER-1', element_kind: 'constraint' },
    // Internal-only requirement — no source, no parent — for the empty-case sanity check.
    { id: 'REQUIREMENT-INTERNAL-1',        name: 'Internal-only', element_kind: 'requirement' },
  ],
  assertions: [
    { id: 'ASSERTION-1', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-MOBILE-1', realised_via: ['CAPABILITY-V1', 'PROCESS-PURGE-1'], status: 'compliant' },
    { id: 'ASSERTION-2', about: 'REQUIREMENT-DATA-ERASURE-1', subject: 'PRODUCT-WEB-1',    status: 'partial' },
    { id: 'ASSERTION-3', about: 'REQUIREMENT-DATA-CONSENT-1', subject: 'PRODUCT-WEB-1',    status: 'compliant' },
  ],
};

const codex: ComplianceCodexDoc[] = [
  { id: 'REGULATION-GDPR-2016-1', name: 'GDPR', type: 'REGULATION', jurisdiction: 'EU' },
];

const catalog = buildTraceElementCatalog(
  [{ id: 'PRODUCT-MOBILE-1', name: 'Mobile app' }, { id: 'PRODUCT-WEB-1', name: 'Web app' }],
  [{ id: 'CAPABILITY-V1', name: 'Erasure capability v1' }, { id: 'PROCESS-PURGE-1', name: 'Purge process' }],
);

describe('buildComplianceIndex — requirementsByParent', () => {
  const idx = buildComplianceIndex(input);
  it('groups children of the same parent', () => {
    const children = idx.requirementsByParent.get('REQUIREMENT-DATA-PROTECTION-1');
    expect(children?.map(r => r.id).sort()).toEqual(['REQUIREMENT-DATA-CONSENT-1', 'REQUIREMENT-DATA-ERASURE-1']);
  });
  it('groups CONSTRAINT children the same way (element_kind-agnostic)', () => {
    const children = idx.requirementsByParent.get('CONSTRAINT-EEA-TRANSFER-1');
    expect(children?.map(r => r.id)).toEqual(['CONSTRAINT-EEA-ANALYTICS-1']);
  });
  it('returns undefined for a leaf with no children', () => {
    expect(idx.requirementsByParent.has('REQUIREMENT-INTERNAL-1')).toBe(false);
  });
});

describe('buildRequirementTrace — trace chain', () => {
  const idx = buildComplianceIndex(input);
  it('resolves derived_from codex artefacts on the sources block', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-ERASURE-1', idx, catalog, codex);
    expect(trace.sources).toHaveLength(1);
    expect(trace.sources[0].id).toBe('REGULATION-GDPR-2016-1');
    expect(trace.sources[0].codex?.jurisdiction).toBe('EU');
  });
  it('keeps a dangling derived_from ref with no codex when the artefact is missing', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-X-1', name: 'X', derived_from: ['LAW-MISSING-1'] }],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-X-1', buildComplianceIndex(local), catalog);
    expect(trace.sources).toEqual([{ id: 'LAW-MISSING-1' }]);
  });
  it('lists ASSERTIONs id-sorted, each with resolved subject + realised_via names', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-ERASURE-1', idx, catalog, codex);
    expect(trace.assertions.map(a => a.assertion.id)).toEqual(['ASSERTION-1', 'ASSERTION-2']);
    expect(trace.assertions[0].subject).toEqual({ id: 'PRODUCT-MOBILE-1', name: 'Mobile app' });
    expect(trace.assertions[0].realisedVia.map(r => r.name)).toEqual(['Erasure capability v1', 'Purge process']);
  });
  it('returns an empty assertions list for a REQUIREMENT with no filed claim', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-PROTECTION-1', idx, catalog);
    expect(trace.assertions).toEqual([]);
  });
  it('returns an empty assertions list for a CONSTRAINT (16-assertion.md §1 — CONSTRAINT-side out of v1)', () => {
    const trace = buildRequirementTrace('CONSTRAINT-EEA-TRANSFER-1', idx, catalog);
    expect(trace.assertions).toEqual([]);
  });
  it('falls back to id when the subject / realised_via element is not in the catalog (dangling ref)', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-Y-1', name: 'Y' }],
      assertions: [{ id: 'ASSERTION-9', about: 'REQUIREMENT-Y-1', subject: 'PRODUCT-GONE-1', realised_via: ['CAPABILITY-GONE-1'], status: 'n_a' }],
    };
    const trace = buildRequirementTrace('REQUIREMENT-Y-1', buildComplianceIndex(local), catalog);
    expect(trace.assertions[0].subject).toEqual({ id: 'PRODUCT-GONE-1' });
    expect(trace.assertions[0].realisedVia).toEqual([{ id: 'CAPABILITY-GONE-1' }]);
  });
});

describe('buildRequirementTrace — hierarchy', () => {
  const idx = buildComplianceIndex(input);
  it('walks ancestors: immediate parent first, root last', () => {
    const trace = buildRequirementTrace('REQUIREMENT-ERASURE-SLA-1', idx, catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual([
      'REQUIREMENT-DATA-ERASURE-1',
      'REQUIREMENT-DATA-PROTECTION-1',
    ]);
  });
  it('lists direct children id-sorted', () => {
    const trace = buildRequirementTrace('REQUIREMENT-DATA-PROTECTION-1', idx, catalog);
    expect(trace.children.map(r => r.id)).toEqual([
      'REQUIREMENT-DATA-CONSENT-1',
      'REQUIREMENT-DATA-ERASURE-1',
    ]);
  });
  it('handles a top-level requirement (no ancestors) with no children', () => {
    const trace = buildRequirementTrace('REQUIREMENT-INTERNAL-1', idx, catalog);
    expect(trace.ancestors).toEqual([]);
    expect(trace.children).toEqual([]);
  });
  it('supports CONSTRAINT hierarchy the same way', () => {
    const trace = buildRequirementTrace('CONSTRAINT-EEA-ANALYTICS-1', idx, catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual(['CONSTRAINT-EEA-TRANSFER-1']);
  });
  it('terminates at a missing parent without throwing (broken model)', () => {
    const local: ComplianceIndexInput = {
      requirements: [{ id: 'REQUIREMENT-ORPHAN-1', name: 'Orphan', parent: 'REQUIREMENT-GONE-1' }],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-ORPHAN-1', buildComplianceIndex(local), catalog);
    expect(trace.ancestors).toEqual([]);
  });
  it('breaks a parent cycle rather than looping', () => {
    // A → B → A (misauthored).
    const local: ComplianceIndexInput = {
      requirements: [
        { id: 'REQUIREMENT-A-1', name: 'A', parent: 'REQUIREMENT-B-1' },
        { id: 'REQUIREMENT-B-1', name: 'B', parent: 'REQUIREMENT-A-1' },
      ],
      assertions: [],
    };
    const trace = buildRequirementTrace('REQUIREMENT-A-1', buildComplianceIndex(local), catalog);
    expect(trace.ancestors.map(r => r.id)).toEqual(['REQUIREMENT-B-1']);
  });
});

describe('buildRequirementTrace — dangling target', () => {
  it('returns a stub carrying the id as name when the requirement is not scanned', () => {
    const trace = buildRequirementTrace('REQUIREMENT-UNKNOWN-1', buildComplianceIndex({ requirements: [], assertions: [] }), catalog);
    expect(trace.requirement).toEqual({ id: 'REQUIREMENT-UNKNOWN-1', name: 'REQUIREMENT-UNKNOWN-1' });
    expect(trace.sources).toEqual([]);
    expect(trace.assertions).toEqual([]);
    expect(trace.ancestors).toEqual([]);
    expect(trace.children).toEqual([]);
  });
});

// Shared release and matrix oracle: source records are normalized through the public intake.
import { emptyCanon, ingestComplianceDoc } from '../classify.js';
import { buildRequirementChain, selectRequirementChain, RequirementChainSnapshot } from '../requirement-chain.js';
const R = (n: number) => `REQUIREMENT-CHAIN-${n}`;
const V = (n: number) => `VERIFICATION-CHAIN-${n}`;
const A = (n: number) => `RELEASE-ALPHA-${n}`;
const B = (n: number) => `RELEASE-BETA-${n}`;
const PA = 'PRODUCT-ALPHA-1', PB = 'PRODUCT-BETA-1', JA = 'ACTION-ALPHA-1', JB = 'ACTION-BETA-1';
const N = (n: number) => `NEED-CHAIN-${n}`;
const DI = 'DRIVER-INTERNAL-1', DE = 'DRIVER-EXTERNAL-1', M = 'OBSERVATION-MARKET-1';
type Raw = Record<string, unknown>;
function chainExample(): Raw[] {
  const docs: Raw[] = [];
  const put = (id: string, fields: Raw = {}) => {
    const d = { id, notation: id.split('-')[0].toLowerCase(), name: id, description: 'Example', zone: 'canon',
      admitted_at: '2026-01-01', admitted_by: 'example', gate_checks: { uniqueness: 'pass' },
      valid_from: '2026-01-01', valid_to: null, ...fields }; docs.push(d); return d;
  };
  let serial = 0;
  const rel = (type: string, from: string, to: string, fields: Raw = {}) => put(`REL-CHAIN-${++serial}`, { notation: 'relation', type, from, to, ...fields });
  put(PA); put(PB); put(JA, { type: 'Project' }); put(JB, { type: 'Project' });
  rel('project_product', JA, PA); rel('project_product', JB, PA); rel('project_product', JB, PB);
  put(A(1), { of: PA }); put(A(2), { of: PA, predecessor: A(1) }); put(A(3), { of: PA });
  put(B(1), { of: PB }); put(B(2), { of: PB, predecessor: B(1) });
  put(M, { notation: 'observation', zone: 'field', source_document: { title: 'Market Research', uri: 'https://example.org/research/market', revision: 'research-revision-1' } });
  put(DI, { type: 'internal' }); put(DE, { type: 'external' }); put('STAKEHOLDER-CHAIN-1'); put('STAKEHOLDER-CHAIN-2');
  put(N(1),{stakeholder:'STAKEHOLDER-CHAIN-1'}); put(N(2),{stakeholder:'STAKEHOLDER-CHAIN-2'});
  rel('source_trace', DI, M); rel('source_trace', DE, M); rel('source_trace', N(1), DI); rel('source_trace', N(1), M); rel('source_trace', N(2), DE);
  const levels = ['stakeholder','system','software','system','system','stakeholder','software',undefined,'system','software','system','stakeholder','system','system','system','system','software','system'];
  for (const n of [...Array.from({ length: 18 }, (_, i) => i + 1), 20]) {
    const lifecycle: Raw = n === 16 ? { valid_to: '2026-08-31' } : n === 17 ? { valid_from: '2026-10-01' } : {};
    put(R(n), { level: n === 20 ? 'software' : levels[n - 1], ...lifecycle });
    rel('product_scope', R(n), n === 12 ? PB : PA, lifecycle);
    rel('project_scope', R(n), n === 12 || n === 13 ? JB : JA, lifecycle);
    if (n !== 9) rel('required_for', R(n), n === 1 ? A(1) : n === 10 ? A(3) : n === 11 ? 'RELEASE-MISSING-1' : n === 12 ? B(1) : A(2), lifecycle);
  }
  const get = (id: string) => docs.find(d => d.id === id)!;
  for (const n of [1,7,9,10,11,13,16,17,18,20]) get(R(n)).serves = N(1);
  get(R(4)).serves = N(2); get(R(12)).serves = N(2);
  for (const [child, parent] of [[2,1],[3,2],[14,15],[15,14]]) get(R(child)).parent = R(parent);
  get(R(7)).parent = 'REQUIREMENT-MISSING-1'; rel('requirement_parent', R(3), R(4));
  rel('source_trace', R(6), DI); rel('required_for', R(18), A(1)); rel('depends_on', R(2), R(5));
  const verification = (n: number, req: number, release: string | undefined, outcome: string, extra: Raw = {}) => put(V(n), {
    verifies: R(req), verified_on: release, method: 'test', protocol: 'Test protocol', outcome,
    performed_at: '2026-09-20', result: 'Recorded result', evidence: [{ kind: 'note', text: 'Recorded evidence' }], ...extra,
  });
  verification(2,2,A(2),'not_yet_run',{ performed_at: undefined, result: undefined, evidence: undefined });
  verification(31,3,A(2),'pass'); verification(32,3,A(2),'fail',{ performed_at: '2026-09-21' });
  verification(4,4,A(2),'inconclusive'); verification(51,5,A(1),'pass'); verification(52,5,undefined,'pass');
  verification(6,6,A(2),'pass',{ evidence: undefined }); verification(7,7,A(2),'not_yet_run',{ protocol: null, performed_at: undefined, result: undefined, evidence: undefined });
  verification(12,12,B(2),'pass'); verification(181,18,A(2),'fail',{ performed_at: '2026-09-01', valid_to: '2026-09-23' }); verification(182,18,A(2),'pass');
  verification(20,20,A(2),'pass',{ evidence: [{ kind: 'canonical_ref', ref: 'REQUIREMENT-MISSING-2' }] });
  verification(99,99,A(2),'fail',{ verifies: 'REQUIREMENT-MISSING-3' });
  return docs;
}
function project(docs = chainExample(), overrides: Partial<Parameters<typeof buildRequirementChain>[0]> = {}) {
  const canon = emptyCanon(); docs.forEach(d => ingestComplianceDoc(canon, d, `${d.id}.yaml`));
  return buildRequirementChain({ index: buildComplianceIndex(canon), scope: { catalogue: 'example', product: PA, release: A(2), project: JA },
    asAt: '2026-09-24', snapshotId: 'example-1', complete: true, ...overrides });
}
const ids = (...ns: number[]) => ns.map(R).sort();
const metricIds = (p: ReturnType<typeof project>) => Object.values(p.metrics).map(s => s.ids);
const baseline = [ids(7,14,15,20), ids(5,8,14,15), ids(1,7,8,14,15), ids(2,5,20), ids(3), ids(9)];
function change(id: string, fields: Raw, docs = chainExample()) { Object.assign(docs.find(d => d.id === id)!, fields); return docs; }
function assignment(docs: Raw[], n: number, release: string) { return docs.find(d => d.type === 'required_for' && d.from === R(n) && d.to === release)!; }
describe('requirement-chain shared projection', () => {
  it('reconciles all populations, stages, six metrics, reference units and provenance', () => {
    const p = project();
    expect(p.populations.product.ids).toEqual(ids(1,2,3,4,5,6,7,8,9,10,11,13,14,15,18,20));
    expect(p.populations.release.ids).toEqual(ids(1,2,3,4,5,6,7,8,13,14,15,18,20));
    expect(p.populations.selected.ids).toEqual(ids(1,2,3,4,5,6,7,8,14,15,18,20));
    expect(p.populations.inactive.ids).toEqual(ids(16,17));
    expect(p.stages.slice(3,7).map(s => s.ids)).toEqual([ids(1,6),ids(2,4,5,14,15,18),ids(3,7,20),ids(8)]);
    expect(metricIds(p)).toEqual(baseline);
    expect(p.selectedReferences.total).toBe(4); expect(p.defectiveReferences.total).toBe(6);
    expect(p.assignments.otherReleaseOnly.ids).toEqual(ids(10)); expect(p.assignments.invalid.ids).toEqual(ids(11));
    expect(p.assignments.provenance.find(a => a.requirement === R(1))).toMatchObject({ depth: 1, nearest: A(1) });
    expect(p.assignments.provenance.find(a => a.requirement === R(18))?.relations).toHaveLength(2);
    expect(selectRequirementChain(p).nodes).toHaveLength(37);
    expect(Object.isFrozen(p.nodes[0].raw)).toBe(true);
  });
  it('walks directions independently through branching, convergence and cycles', () => {
    const p = project();
    const nodes = (f: string, direction: 'both'|'upstream'|'downstream') => selectRequirementChain(p,f,direction).nodes.map(n => n.id).sort();
    const down = [R(2),R(3),V(2)+'.definition',V(31)+'.definition',V(31)+'.result',V(32)+'.definition',V(32)+'.result'];
    const up = [R(2),R(1),N(1),DI,M];
    expect(nodes(R(2),'downstream')).toEqual(down.sort()); expect(nodes(R(2),'upstream')).toEqual(up.sort());
    expect(nodes(R(2),'both')).toEqual([...new Set([...down,...up])].sort());
    expect(nodes(V(32)+'.result','upstream')).toEqual([V(32)+'.result',V(32)+'.definition',R(3),R(2),R(4),R(1),N(1),N(2),DI,DE,M].sort());
    expect(nodes(R(14),'both')).toEqual(ids(14,15));
    expect(nodes(R(6),'downstream')).toEqual([R(6),V(6)+'.definition',V(6)+'.result'].sort());
  });
  it('keeps project selection explicit and independent product assignment', () => {
    const scope = { catalogue: 'example', product: PA, release: A(2) };
    const p = project(undefined,{ scope }); expect(p.populations.selected.total).toBe(13); expect(p.metrics.noDefinition.ids).toEqual(ids(1,7,8,13,14,15));
    expect(project(undefined,{ scope: { ...scope, product: PB, release: B(2), project: JB } }).metrics.unassigned.total).toBe(0);
    expect(metricIds(project(undefined,{ scope: { ...scope, product: PB, release: B(2), project: JB } }))).toEqual([[],[],[],[],[],[]]);
    expect(project(undefined,{ scope: { ...scope, product: PB, release: B(2), project: JA } }).populations.selected.total).toBeNull();
    expect(project(undefined,{ scope: { ...scope, release: B(2) } }).populations.selected.total).toBeNull();
    expect(project(undefined,{ scope: { catalogue: 'example' } }).populations.selected.total).toBeNull();
    expect(project(undefined,{ scope: { ...scope, release: A(1), project: JA } }).populations.selected.ids).toEqual(ids(1,18));
    expect(project(undefined,{ scope: { ...scope, release: A(3), project: JA } }).populations.selected.ids).toEqual(ids(10));
  });
  it('does not replace incomplete product membership or invalid project scope with zero', () => {
    const docs = chainExample().filter(d => !(d.type === 'product_scope' && d.from === R(9)));
    const p = project(docs); expect(p.populations.product.ids).toHaveLength(15); expect(p.metrics.unassigned.total).toBeNull();
    expect(p.metrics.unassigned.ids).toEqual([]); expect(p.populations.selected.total).toBe(12);
    const broken = chainExample(); broken.find(d => d.type === 'project_scope' && d.from === R(13))!.to = 'ACTION-MISSING-1';
    expect(project(broken).populations.selected.total).toBeNull(); expect(project(broken).defectiveReferences.total).toBe(7);
  });
  it('retains invalid assignment alongside a valid one and separates other-release-only', () => {
    const docs = chainExample(); docs.push({ ...assignment(docs,11,'RELEASE-MISSING-1'), id: 'REL-EXTRA-1', to: A(2) });
    const p = project(docs); expect(p.populations.selected.total).toBe(13); expect(p.metrics.broken.ids).toEqual(ids(7,11,14,15,20)); expect(p.assignments.invalid.ids).toEqual(ids(11));
    const repaired = chainExample(); assignment(repaired,11,'RELEASE-MISSING-1').to=A(3);
    expect(project(repaired).assignments.otherReleaseOnly.ids).toEqual(ids(10,11)); expect(metricIds(project(repaired))).toEqual(baseline);
    expect(project(chainExample().filter(d => !(d.type==='required_for' && d.from===R(10)))).metrics.unassigned.ids).toEqual(ids(9,10));
  });
  it('uses inclusive windows and nearest surviving predecessor attachment', () => {
    const docs = chainExample(); assignment(docs,1,A(1)).valid_to='2026-09-24'; expect(metricIds(project(docs))).toEqual(baseline);
    assignment(docs,1,A(1)).valid_to='2026-09-23'; const p=project(docs); expect(p.populations.selected.total).toBe(11); expect(p.metrics.unassigned.ids).toEqual(ids(1,9));
    expect(selectRequirementChain(p).nodes.some(n=>n.id===R(1))).toBe(true);
    const withdrawn=chainExample(); assignment(withdrawn,18,A(2)).valid_to='2026-09-23';
    expect(project(withdrawn).assignments.provenance.find(a=>a.requirement===R(18))?.depth).toBe(1);
    expect(project(undefined,{asAt:'2026-10-01'}).populations.selected.total).toBe(13);
    expect(project(undefined,{asAt:'2026-08-31'}).metrics.noResult.ids).toEqual(ids(2,3,4,5,6,18,20));
    expect(project(undefined,{asAt:'2026-09-01'}).metrics.failed.ids).toEqual(ids(18));
  });
  it.each([A(2),B(1),'RELEASE-MISSING-1'])('terminates invalid predecessor %s with unknown totals', predecessor => {
    const p=project(change(predecessor===A(2)?A(1):A(2),{predecessor})); expect(p.populations.selected.total).toBeNull();
  });
  it('deduplicates logical links while retaining all authored identities and additive inline fields', () => {
    const docs=chainExample(); const r=assignment(docs,18,A(2)); docs.push({...r,id:'REL-DUPLICATE-1'});
    const parent={...r,id:'REL-PARENT-1',type:'requirement_parent',from:R(2),to:R(1)}; docs.push(parent);
    let p=project(docs); expect(metricIds(p)).toEqual(baseline); expect(p.edges.find(e=>e.kind==='parent'&&e.storedFrom===R(2))?.identities).toHaveLength(2);
    parent.valid_to='2026-09-23'; p=project(docs); expect(selectRequirementChain(p,R(2),'upstream').nodes.map(n=>n.id)).toContain(R(1));
  });
  it('retains a valid source path alongside cycles and diagnoses forbidden codex endpoints', () => {
    expect(project(change(R(14),{serves:N(1)})).metrics.noSource.ids).toEqual(ids(5,8));
    const p=project(change(R(5),{derived_from:[M]})); expect(p.metrics.broken.ids).toEqual(ids(5,7,14,15,20)); expect(p.metrics.noSource.ids).toEqual(baseline[1]);
    const repaired=change(R(7),{parent:R(1)}); change(V(7),{protocol:'Repaired'},repaired);
    expect(project(repaired).metrics.noDefinition.ids).toEqual(ids(1,8,14,15)); expect(project(repaired).metrics.noResult.ids).toEqual(ids(2,5,7,20));
    const missing=project(chainExample().filter(d=>d.id!==M)); expect(missing.metrics.broken.ids).toEqual(ids(1,2,3,4,6,7,14,15,18,20)); expect(missing.defectiveReferences.total).toBe(9); expect(missing.metrics.noSource.ids).toEqual(baseline[1]);
    expect(metricIds(project(change(M,{source_document:'https://example.org'})))).toEqual(baseline);
  });
  it('preserves individual outcomes, inclusive withdrawal and malformed execution versus definition', () => {
    expect(project(change(V(32),{valid_to:'2026-09-23'})).metrics.failed.ids).toEqual([]);
    expect(project(change(V(181),{valid_to:'2026-09-24'})).metrics.failed.ids).toEqual(ids(3,18));
    expect(project(change(V(51),{verified_on:A(2)})).metrics.noResult.ids).toEqual(ids(2,20));
    expect(project(change(V(2),{outcome:'inconclusive'})).metrics.noResult.ids).toEqual(ids(5,20));
    for(const evidence of [undefined,[{kind:'note',text:'Valid'}]]) {
      const p=project(change(V(20),{evidence})); expect(p.metrics.broken.ids).toEqual(ids(7,14,15)); expect(p.metrics.noResult.ids).toEqual(ids(2,5));
    }
    for(const performed_at of ['2026-09-25','2026-02-30']) expect(project(change(V(6),{performed_at})).metrics.noResult.ids).toEqual(ids(2,5,6,20));
    expect(metricIds(project(change(V(6),{performed_at:undefined})))).toEqual(baseline);
    const bad=change(V(31),{outcome:'invalid'}); change(V(32),{outcome:'invalid'},bad);
    expect(project(bad).metrics.noResult.ids).toEqual(ids(2,3,5,20)); expect(project(bad).metrics.failed.ids).toEqual([]);
    const fixed=project(change(V(99),{verifies:R(8)})); expect(fixed.metrics.failed.ids).toEqual(ids(3,8)); expect(selectRequirementChain(fixed).nodes).toHaveLength(39);
  });
  it('keeps multi-product assignments contextual and duplicate identities unresolved', () => {
    const docs=chainExample(); const sample=docs.find(d=>d.type==='product_scope'&&d.from===R(9))!;
    docs.push({...sample,id:'REL-EXTRA-1',to:PB},{...sample,id:'REL-EXTRA-2',type:'required_for',to:B(2)});
    expect(project(docs).metrics.unassigned.ids).toEqual(ids(9)); expect(project(docs).assignments.invalid.ids).toEqual(ids(11));
    docs.push({...docs.find(d=>d.id===R(9))!}); expect(project(docs).populations.product.total).toBeNull();
  });
  it('rejects obsolete successes and failures without mixing generations', async () => {
    const store=new RequirementChainSnapshot(); const p=project();
    const canon=emptyCanon(); chainExample().forEach(d=>ingestComplianceDoc(canon,d));
    const input={ index:buildComplianceIndex(canon),scope:p.scope,asAt:p.asAt,snapshotId:'new',complete:true };
    let resolve!: (v:typeof input)=>void;
    const old=store.refresh(()=>new Promise(r=>{resolve=r;}));
    await store.refresh(async()=>input); resolve({...input,snapshotId:'old'}); expect(await old).toBe(false); expect(store.current?.snapshotId).toBe('new');
    await store.refresh(async()=>{throw Error('failed load');}); expect(store.stale).toBe(true); expect(store.current?.snapshotId).toBe('new');
  });
});

describe('requirement-chain independent controls', () => {
  it('quarantines absent project/product pairs and malformed assignment windows', () => {
    const absent=chainExample().filter(d=>!(d.type==='project_product'&&d.from===JA));
    expect(project(absent).populations.selected.total).toBeNull();
    const docs=chainExample(); assignment(docs,18,A(2)).valid_from='invalid';
    expect(project(docs).populations.selected.total).toBeNull(); expect(project(docs).metrics.unassigned.total).toBeNull();
  });
  it('removes only the explicit converging parent path', () => {
    const docs=chainExample().filter(d=>!(d.type==='requirement_parent'&&d.from===R(3)));
    const p=project(docs), nodes=selectRequirementChain(p,V(32)+'.result','upstream').nodes.map(n=>n.id);
    for(const id of [R(4),N(2),DE]) expect(nodes).not.toContain(id);
    for(const id of [R(1),R(2),R(3),N(1),DI,M]) expect(nodes).toContain(id);
    expect(metricIds(p)).toEqual(baseline);
  });
  it('accepts explicit Field source_trace and permitted codex sources without inventing stages', () => {
    const docs=chainExample(), sample=docs.find(d=>d.type==='source_trace')!;
    docs.push({...sample,id:'REL-SOURCE-1',from:R(5),to:M});
    expect(project(docs).metrics.noSource.ids).toEqual(ids(8,14,15));
    const policyDocs=change(R(5),{derived_from:['POLICY-CHAIN-1']});
    policyDocs.push({...policyDocs.find(d=>d.id===R(5))!, id:'POLICY-CHAIN-1',notation:'policy',zone:'codex',derived_from:undefined});
    expect(project(policyDocs).metrics.noSource.ids).toEqual(ids(8,14,15));
    expect(project(policyDocs).metrics.broken.ids).toEqual(baseline[0]);
    const bad=project(change(R(8),{level:'invented'})); expect(bad.stages[6].ids).toEqual(ids(8)); expect(metricIds(bad)).toEqual(baseline);
  });
  it('retains duplicate citation identities and refreshes labels and document provenance only', () => {
    const docs=chainExample(), citation=docs.find(d=>d.type==='source_trace'&&d.from===N(1)&&d.to===M)!;
    docs.push({...citation,id:'REL-SOURCE-2'}); const p=project(docs);
    expect(metricIds(p)).toEqual(baseline); expect(selectRequirementChain(p).nodes).toHaveLength(37);
    expect(p.edges.find(e=>e.storedFrom===N(1)&&e.storedTo===M)?.identities).toHaveLength(2);
    const renamed=project(change(R(2),{name:'Renamed requirement'})); expect(metricIds(renamed)).toEqual(baseline);
    expect(renamed.nodes.find(n=>n.id===R(2))?.name).toBe('Renamed requirement');
    const revised=project(change(M,{source_document:{title:'Market Research',uri:'https://example.org/research/market',revision:'research-revision-2'}}),{snapshotId:'example-2'});
    expect(metricIds(revised)).toEqual(baseline); expect(revised.nodes.find(n=>n.id===M)?.raw.source_document).toMatchObject({revision:'research-revision-2'});
    const refreshed=project(change(R(8),{serves:N(1)}),{snapshotId:'example-2'});
    expect(refreshed.metrics.noSource.ids).toEqual(ids(5,14,15)); expect(refreshed.edges.some(e=>e.from===N(1)&&e.to===R(8))).toBe(true);
  });
  it('keeps definition identity when outcomes or evidence are malformed', () => {
    for(const fields of [{outcome:null},{evidence:[null]},{evidence:'invalid'},{performed_at:'tomorrow'},{result:null}]) {
      const p=project(change(V(6),fields)); expect(p.definitions[R(6)]).toEqual([V(6)]); expect(p.metrics.noResult.ids).toContain(R(6));
    }
    const p=project(change(V(6),{protocol:''})); expect(p.metrics.noDefinition.ids).toContain(R(6));
    expect(p.metrics.broken.ids).not.toContain(R(6));
  });
  it('preserves legacy populations and excludes CONSTRAINT from release metrics', () => {
    const docs=chainExample(); docs.push({...docs.find(d=>d.id===R(1))!,id:'CONSTRAINT-CHAIN-1',notation:'constraint'});
    const canon=emptyCanon(); docs.forEach(d=>ingestComplianceDoc(canon,d));
    expect(canon.requirements.some(r=>r.id==='CONSTRAINT-CHAIN-1')).toBe(true);
    expect(metricIds(project(docs))).toEqual(baseline);
    const {rows}=buildRequirementVerificationMatrix(buildComplianceIndex(canon));
    expect([...new Set(rows.map(r=>r.requirementId))].sort()).toEqual(canon.requirements.map(r=>r.id).sort());
  });
});
import { buildRequirementVerificationMatrix } from '../../compliance-verification-matrix/index.js';
