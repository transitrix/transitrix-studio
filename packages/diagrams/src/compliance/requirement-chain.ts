import type { ChainRecord, ChainFinding, ComplianceIndex } from './types.js';
import { isCanonicalId } from '../typed-id.js';
import { validateNeed } from '../need/validate.js';
import { validateRequirement } from '../requirement/validate.js';
import { checkAgreement } from '../agreement.js';
import { validateVerification } from '../verification/validate.js';

export const CHAIN_STAGES = ['Source document', 'Driver', 'Need', 'Stakeholder requirement',
  'System requirement', 'Software requirement', 'Unclassified requirement', 'Verification definition', 'Result'] as const;
export interface ChainScope { catalogue: string; product?: string; release?: string; project?: string }
export interface ChainInput {
  index: ComplianceIndex; scope: ChainScope; asAt: string; snapshotId: string;
  sourceRevision?: string; complete: boolean;
}
export interface ChainSet { ids: string[]; completeness: 'complete' | 'incomplete'; total: number | null }
export interface RequirementChainNode {
  id: string; recordId: string; name: string; stage: number; sourcePath: string;
  context: string[]; raw: Record<string, unknown>;
}
export interface RequirementChainEdge {
  id: string; kind: string; storedFrom: string; storedTo: string;
  from: string; to: string; identities: string[]; trace: boolean; valid: boolean;
}
export interface ChainAssignment { requirement: string; nearest: string; depth: number; relations: string[] }
export interface RequirementChainProjection {
  contract: 'requirement-chain/0.2'; contractRevision: string; asAt: string; snapshotId: string; sourceRevision?: string;
  scope: ChainScope; completeness: 'complete' | 'incomplete'; scopeFindings: string[];
  populations: { product: ChainSet; release: ChainSet; selected: ChainSet; inactive: ChainSet; unresolved: ChainSet };
  assignments: { here: ChainSet; otherReleaseOnly: ChainSet; unassigned: ChainSet; invalid: ChainSet; provenance: ChainAssignment[] };
  stages: ChainSet[]; metrics: { broken: ChainSet; noSource: ChainSet; noDefinition: ChainSet; noResult: ChainSet; failed: ChainSet; unassigned: ChainSet };
  records: ChainRecord[]; nodes: RequirementChainNode[]; edges: RequirementChainEdge[]; findings: ChainFinding[];
  defectiveReferences: ChainSet; selectedReferences: ChainSet; unattributableFindings: ChainSet;
  affectedRequirements: Record<string, string[]>;
  definitions: Record<string, string[]>; executions: Record<string, string[]>;
}
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const map = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const sorted = (v: Iterable<string>): string[] => [...new Set(v)].sort();
export function chainDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
}
function set(ids: Iterable<string>, complete: boolean): ChainSet {
  const list = sorted(ids); return { ids: list, completeness: complete ? 'complete' : 'incomplete', total: complete ? list.length : null };
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const CODEX = ['LAW', 'REGULATION', 'STANDARD', 'POLICY', 'INTERNAL_STANDARD', 'PRINCIPLE'];
const FIELD = ['INTERVIEW', 'SURVEY', 'OBSERVATION', 'DRAFT'];

/** Pure, lossless release projection; no legacy coverage verdict is reinterpreted. */
export function buildRequirementChain(input: ChainInput): RequirementChainProjection {
  const { index, asAt, scope } = input;
  const findings = structuredClone(index.findings);
  const scopeFindings: string[] = [];
  const records = new Map<string, ChainRecord>();
  let complete = input.complete && !findings.some(f => f.severity === 'error');
  const finding = (owner: string, field: string, code: string, message: string, reference = false, warning = false) => {
    const id = `${owner}.${field}`;
    if (!findings.some(f => f.id === id && f.code === code)) findings.push({ id, owner, field, code, message, reference, severity: warning ? 'warning' : 'error' });
  };
  for (const [id, versions] of index.recordsById) {
    if (versions.length !== 1) {
      finding(id, 'id', 'DUPLICATE', 'Ambiguous catalogue identity'); complete = false;
    } else records.set(id, structuredClone(versions[0]));
  }
  if (!chainDate(asAt)) { complete = false; scopeFindings.push('Invalid as-at date'); }
  if (!scope.catalogue || !input.snapshotId) { complete = false; scopeFindings.push('Missing catalogue or snapshot identity'); }
  const envelope = new Map<string, boolean>();
  const active = new Map<string, boolean>();
  for (const r of records.values()) {
    const d = r.raw;
    const dates = chainDate(d.valid_from) && (d.valid_to === null || chainDate(d.valid_to)) &&
      (d.valid_to === null || (d.valid_to as string) >= (d.valid_from as string));
    const admitted = chainDate(d.admitted_at) && text(d.admitted_by) && map(d.gate_checks) &&
      Object.keys(d.gate_checks).length > 0 && Object.values(d.gate_checks).every(v => v === 'pass');
    const zone = CODEX.includes(r.type) ? 'codex' : FIELD.includes(r.type) ? 'field' : 'canon';
    const valid = dates && admitted && d.zone === zone && isCanonicalId(r.id);
    if (!isCanonicalId(r.id)) finding(r.id, 'id', 'IDENTITY', 'Malformed canonical identity');
    for (const v of checkAgreement(d)) finding(r.id, v.path ?? 'agreement', v.code, v.message);
    envelope.set(r.id, valid);
    active.set(r.id, valid && (d.valid_from as string) <= asAt && (d.valid_to === null || asAt <= (d.valid_to as string)));
    if (!dates) finding(r.id, 'valid_from', 'LIFECYCLE', 'Malformed or missing inclusive lifecycle window');
    if (!admitted || d.zone !== zone) finding(r.id, 'admission', 'ADMISSION', 'Invalid admission envelope or zone');
  }
  const validationCatalog = { typeOf: (id: string) => envelope.get(id) ? records.get(id)?.type : undefined };
  const validNeeds = new Set<string>();
  for (const r of records.values()) {
    const verdict = r.type === 'NEED' ? validateNeed(r.raw, { catalog: validationCatalog }) :
      r.type === 'REQUIREMENT' ? validateRequirement(r.raw, { catalog: validationCatalog }) : undefined;
    if (!verdict) continue;
    for (const v of [...verdict.errors, ...verdict.warnings]) finding(r.id, v.path ?? '', v.code, v.message,
      ['NEED-002', 'REQ-002', 'REQ-003', 'REQ-SERVES-001'].includes(v.code), verdict.warnings.includes(v));
    if (r.type === 'NEED' && !verdict.errors.some(v => !v.code.startsWith('AGREE-'))) validNeeds.add(r.id);
  }
  const is = (id: unknown, type: string) => text(id) && records.get(id)?.type === type && envelope.get(id) === true;
  const isProject = (id: unknown) => is(id, 'ACTION') && records.get(id as string)?.raw.type === 'Project';
  const requirements = [...records.values()].filter(r => r.type === 'REQUIREMENT');
  const nodes: RequirementChainNode[] = [];
  const edges: RequirementChainEdge[] = [];
  function node(r: ChainRecord, stage: number, suffix = '', context: string[] = []) {
    nodes.push({ id: r.id + suffix, recordId: r.id, name: text(r.raw.name) ? r.raw.name : r.id,
      stage, sourcePath: r.sourcePath, context, raw: r.raw });
  }
  for (const r of records.values()) {
    if (r.type === 'REQUIREMENT') {
      const levels = ['stakeholder', 'system', 'software']; const level = levels.indexOf(String(r.raw.level));
      node(r, level < 0 ? 6 : level + 3);
      if (r.raw.level !== undefined && level < 0) finding(r.id, 'level', 'REQ-LEVEL', 'Invalid level; displayed as unclassified');
    } else if (r.type === 'NEED') node(r, 2);
    else if (r.type === 'DRIVER') node(r, 1);
    else if (['PRODUCT', 'RELEASE', 'ACTION'].includes(r.type)) node(r, -1);
    else if (CODEX.includes(r.type) || FIELD.includes(r.type)) {
      node(r, 0);
      if (r.raw.source_document !== undefined) {
        const d = r.raw.source_document;
        if (!map(d) || !['title', 'uri', 'revision'].every(k => text(d[k])) || d.revision === 'latest') {
          finding(r.id, 'source_document', 'SOURCE-DOC-001', 'Source document needs title, URI and immutable revision');
        }
      }
    }
  }
  function addEdge(kind: string, from: string, to: unknown, owner: string, field: string, allowed: boolean,
    trace: boolean, reverse = true, temporal = true): RequirementChainEdge {
    const target = typeof to === 'string' ? to : String(to);
    const identity = `${owner}.${field}`;
    const valid = allowed && temporal;
    if (!valid) finding(owner, field, kind === 'parent' ? 'REQ-PARENT-001' : 'REL-002', 'Invalid endpoint, type or lifecycle reference', true);
    const edge: RequirementChainEdge = { id: `${kind}:${from}:${target}`, kind, storedFrom: from, storedTo: target,
      from: reverse ? target : from, to: reverse ? from : target, identities: [identity], trace, valid };
    const existing = edges.find(e => e.id === edge.id && e.valid === valid);
    if (existing) { existing.identities.push(identity); existing.trace ||= trace; return existing; }
    edges.push(edge); return edge;
  }
  const contains = (owner: ChainRecord, target: ChainRecord | undefined): boolean => {
    if (!target || !envelope.get(target.id) || !envelope.get(owner.id)) return false;
    const a = owner.raw, b = target.raw;
    return (a.valid_from as string) >= (b.valid_from as string) &&
      (b.valid_to === null || (a.valid_to !== null && (a.valid_to as string) <= (b.valid_to as string)));
  };
  for (const r of requirements) {
    for (const [field, type] of [['parent', 'REQUIREMENT'], ['serves', 'NEED']]) {
      if (r.raw[field] !== undefined) addEdge(field === 'parent' ? 'parent' : field, r.id, r.raw[field], r.id, field,
        is(r.raw[field], type), true, true, contains(r, records.get(String(r.raw[field]))));
    }
    if (r.raw.derived_from !== undefined) {
      const refs = Array.isArray(r.raw.derived_from) ? r.raw.derived_from : [];
      refs.forEach((ref, i) => addEdge('derived_from', r.id, ref, r.id, `derived_from[${i}]`,
        text(ref) && CODEX.includes(records.get(ref)?.type ?? '') && records.get(ref)?.raw.zone === 'codex', true,
        true, contains(r, records.get(String(ref)))));
    }
  }
  const rels = [...records.values()].filter(r => r.type === 'REL');
  const usable = new Set<string>();
  for (const r of rels) {
    const d = r.raw; const from = String(d.from); const to = String(d.to); const kind = String(d.type);
    const src = records.get(from), dst = records.get(to);
    const endpoints = kind === 'requirement_parent' ? is(from, 'REQUIREMENT') && is(to, 'REQUIREMENT') :
      kind === 'serves' ? is(from, 'REQUIREMENT') && is(to, 'NEED') :
      kind === 'product_scope' ? is(from, 'REQUIREMENT') && is(to, 'PRODUCT') :
      kind === 'project_scope' ? is(from, 'REQUIREMENT') && isProject(to) :
      kind === 'project_product' ? isProject(from) && is(to, 'PRODUCT') :
      kind === 'required_for' ? is(from, 'REQUIREMENT') && is(to, 'RELEASE') :
      kind === 'source_trace' ? !!src && !!dst && envelope.get(from) === true && envelope.get(to) === true &&
        (['REQUIREMENT', 'NEED'].includes(src.type) && (dst.type === 'DRIVER' || FIELD.includes(dst.type)) ||
          src.type === 'DRIVER' && FIELD.includes(dst.type)) : !!src && !!dst;
    const temporal = contains(r, src) && contains(r, dst);
    if (!temporal) finding(r.id, 'to', 'REL-003', 'Relation window must be contained in both endpoints', true);
    const trace = ['requirement_parent', 'serves', 'source_trace'].includes(kind);
    addEdge(kind === 'requirement_parent' ? 'parent' : kind, from, to, r.id, 'to', endpoints, trace && active.get(r.id) === true, trace, temporal);
    if (endpoints && temporal && active.get(r.id)) usable.add(r.id);
  }
  // Cycle defects retain traversal edges so a separate source path is not erased.
  const parents = edges.filter(e => e.kind === 'parent' && e.trace && e.valid);
  const reachable = (seed: string, candidates: RequirementChainEdge[], direction: 'upstream' | 'downstream') => {
    const seen = new Set<string>([seed]); const queue = [seed];
    while (queue.length) {
      const id = queue.pop()!;
      for (const e of candidates) {
        const a = direction === 'upstream' ? e.to : e.from;
        const b = direction === 'upstream' ? e.from : e.to;
        if (a === id && !seen.has(b)) { seen.add(b); queue.push(b); }
      }
    }
    return seen;
  };
  for (const e of parents) {
    if (reachable(e.to, parents, 'downstream').has(e.from)) {
      for (const identity of e.identities) {
        const split = identity.lastIndexOf('.');
        finding(identity.slice(0, split), identity.slice(split + 1), e.from === e.to ? 'REL-009' : 'REL-010', 'Decomposition cycle', true);
      }
    }
  }
  const memberships = (id: string, kind: string) => rels.filter(r => usable.has(r.id) && r.raw.type === kind && r.raw.from === id).map(r => String(r.raw.to));
  const unresolved = requirements.filter(r => active.get(r.id) && memberships(r.id, 'product_scope').length === 0).map(r => r.id);
  const P = requirements.filter(r => active.get(r.id) && memberships(r.id, 'product_scope').includes(scope.product ?? '')).map(r => r.id);
  let productComplete = complete && unresolved.length === 0;
  if (unresolved.length) scopeFindings.push('Unresolved product membership');
  if (requirements.some(r => !envelope.get(r.id)) || rels.some(r => r.raw.type === 'product_scope' && active.get(r.id) && !usable.has(r.id))) productComplete = false;
  const invalidAssignments = new Set<string>();
  for (const r of rels.filter(r => r.raw.type === 'required_for')) {
    const from = String(r.raw.from), to = records.get(String(r.raw.to));
    const historical = chainDate(r.raw.valid_to) && r.raw.valid_to < asAt;
    const future = chainDate(r.raw.valid_from) && r.raw.valid_from > asAt;
    if (!historical && !future && (!usable.has(r.id) || !memberships(from, 'product_scope').includes(String(to?.raw.of)))) {
      invalidAssignments.add(from);
      finding(r.id, 'to', 'ASSIGNMENT', 'Invalid, dangling or wrong-product assignment', true);
      if (!envelope.get(r.id)) productComplete = false;
    }
  }
  let selectedComplete = complete;
  if (!is(scope.product, 'PRODUCT')) { productComplete = false; selectedComplete = false; scopeFindings.push('Product unselected or unresolved'); }
  if (!is(scope.release, 'RELEASE') || records.get(scope.release ?? '')?.raw.of !== scope.product) {
    selectedComplete = false; scopeFindings.push('Release unselected, unresolved or wrong product');
  }
  if (scope.project && (!isProject(scope.project) || !memberships(scope.project, 'project_product').includes(scope.product ?? ''))) {
    selectedComplete = false; scopeFindings.push('Invalid or unmodelled project/product pair');
  }
  function query(release: string): { ids: string[]; provenance: ChainAssignment[]; complete: boolean } {
    const chain: string[] = []; let cursor: string | undefined = release; let valid = true;
    while (cursor) {
      const r: ChainRecord | undefined = records.get(cursor);
      if (chain.includes(cursor) || !is(cursor, 'RELEASE') || r?.raw.of !== scope.product) {
        valid = false;
        finding(chain[chain.length - 1] ?? release, 'predecessor', 'RELEASE-SCOPE',
          chain.includes(cursor) ? 'Release predecessor cycle' : 'Missing, invalid or cross-product predecessor');
        break;
      }
      chain.push(cursor);
      cursor = r?.raw.predecessor === undefined || r.raw.predecessor === null ? undefined : String(r.raw.predecessor);
    }
    if (!valid) scopeFindings.push(`Incomplete predecessor chain: ${release}`);
    const provenance: ChainAssignment[] = [];
    for (const id of P) {
      const attachments = rels.filter(r => usable.has(r.id) && r.raw.type === 'required_for' && r.raw.from === id && chain.includes(String(r.raw.to)))
        .sort((a, b) => chain.indexOf(String(a.raw.to)) - chain.indexOf(String(b.raw.to)) || a.id.localeCompare(b.id));
      if (attachments.length) provenance.push({ requirement: id, nearest: String(attachments[0].raw.to),
        depth: chain.indexOf(String(attachments[0].raw.to)), relations: attachments.map(r => r.id) });
    }
    return { ids: provenance.map(p => p.requirement), provenance, complete: valid };
  }
  const selected = scope.release ? query(scope.release) : { ids: [], provenance: [], complete: false };
  const L = selected.ids; selectedComplete &&= selected.complete;
  if (rels.some(r => r.raw.type === 'required_for' && String(r.raw.to) === scope.release && unresolved.includes(String(r.raw.from)))) selectedComplete = false;
  if (scope.project && L.some(id => memberships(id, 'project_scope').length === 0 || rels.some(r => r.raw.type === 'project_scope' && r.raw.from === id && active.get(r.id) && !usable.has(r.id)))) {
    selectedComplete = false; scopeFindings.push('Unresolved project membership');
  }
  if (rels.some(r => ['product_scope', 'project_scope', 'required_for'].includes(String(r.raw.type)) && !envelope.get(r.id))) selectedComplete = false;
  if (scope.project && L.some(id => memberships(id, 'project_scope').some(project => !memberships(project, 'project_product').includes(scope.product ?? '')))) {
    selectedComplete = false; scopeFindings.push('Inconsistent project/product membership');
  }
  const S = L.filter(id => !scope.project || memberships(id, 'project_scope').includes(scope.project));
  const elsewhere = new Set<string>();
  for (const release of records.values()) if (release.type === 'RELEASE' && release.raw.of === scope.product) {
    const q = query(release.id); productComplete &&= q.complete; q.ids.forEach(id => elsewhere.add(id));
  }
  const unassigned = P.filter(id => !elsewhere.has(id) && !invalidAssignments.has(id));
  const definitions: Record<string, string[]> = {}, executions: Record<string, string[]> = {};
  const verifications = [...records.values()].filter(r => r.type === 'VERIFICATION');
  const catalog = { typeOf: (id: string) => envelope.get(id) ? records.get(id)?.type : undefined };
  for (const r of verifications) {
    const d = r.raw, target = String(d.verifies);
    const verdict = validateVerification(d, { catalog });
    for (const v of [...verdict.errors, ...verdict.warnings]) finding(r.id, v.path ?? '', v.code, v.message,
      v.code === 'VERIF-002' || v.code === 'VERIF-005', verdict.warnings.includes(v));
    const definitionErrors = verdict.errors.filter(v => !['outcome', 'evidence', 'performed_at', 'verified_on', 'result'].some(k => v.path?.startsWith(k)));
    const validDefinition = active.get(r.id) && definitionErrors.length === 0 && is(d.verifies, 'REQUIREMENT') && contains(r, records.get(target));
    let executionValid = verdict.errors.length === 0;
    if (d.performed_at !== undefined && (!chainDate(d.performed_at) || d.performed_at > asAt)) {
      finding(r.id, 'performed_at', 'EXECUTION-DATE', 'Malformed or future execution date'); executionValid = false;
    } else if (d.performed_at === undefined) finding(r.id, 'performed_at', 'EXECUTION-DATE', 'Execution date absent', false, true);
    if (d.result !== undefined && !text(d.result)) { finding(r.id, 'result', 'VERIF-001', 'Malformed result narrative'); executionValid = false; }
    if (Array.isArray(d.evidence)) d.evidence.forEach((v, i) => {
      if (!map(v) || !['note', 'canonical_ref', 'external_doc'].includes(String(v.kind)) ||
          (v.kind === 'note' && !text(v.text)) || (v.kind === 'external_doc' && (!text(v.url) || !text(v.title)))) {
        finding(r.id, `evidence[${i}]`, 'VERIF-001', 'Malformed evidence entry'); executionValid = false;
      }
    });
    if (d.verified_on !== undefined && !is(d.verified_on, 'RELEASE')) {
      finding(r.id, 'verified_on', 'VERIF-RELEASE', 'Unresolved release qualifier', true); executionValid = false;
    }
    const context = !active.get(r.id) ? ['inactive'] : !validDefinition ? ['invalid definition'] : [];
    if (d.verified_on === undefined) context.push('unqualified');
    else if (d.verified_on !== scope.release) context.push('other release');
    if (!executionValid) context.push('malformed or future execution');
    node(r, 7, '.definition', [...context]);
    const verificationEdge = addEdge('verifies', r.id + '.definition', target, r.id, 'verifies', is(d.verifies, 'REQUIREMENT'), true, true, contains(r, records.get(target)));
    verificationEdge.storedFrom = r.id;
    if (['pass', 'fail', 'inconclusive'].includes(String(d.outcome))) {
      node(r, 8, '.result', [...context]);
      addEdge('result', r.id + '.definition', r.id + '.result', r.id, 'result', true, true, false);
    }
    if (validDefinition) (definitions[target] ??= []).push(r.id);
    if (validDefinition && executionValid && d.verified_on === scope.release && ['pass', 'fail', 'inconclusive'].includes(String(d.outcome))) (executions[target] ??= []).push(r.id);
  }
  const traceEdges = edges.filter(e => e.trace && e.valid);
  const affectedRequirements: Record<string, string[]> = {};
  const noSource: string[] = [];
  for (const r of requirements) {
    const ancestors = reachable(r.id, traceEdges, 'upstream');
    const owners = new Set(ancestors);
    for (const v of verifications) if (v.raw.verifies === r.id) owners.add(v.id);
    for (const rel of rels) {
      const ownScope = ['product_scope', 'project_scope', 'required_for'].includes(String(rel.raw.type));
      if (ownScope ? rel.raw.from === r.id : owners.has(String(rel.raw.from))) owners.add(rel.id);
    }
    for (const f of findings) if (owners.has(f.owner)) (affectedRequirements[f.id] ??= []).push(r.id);
    const source = [...ancestors].some(id => {
      const a = records.get(id); if (!a || !active.get(id)) return false;
      return (a.type === 'NEED' && validNeeds.has(id)) || a.type === 'DRIVER' || CODEX.includes(a.type) ||
        FIELD.includes(a.type) && map(a.raw.source_document) && !findings.some(f => f.owner === id && f.code === 'SOURCE-DOC-001');
    });
    if (!source && S.includes(r.id)) noSource.push(r.id);
  }
  for (const collection of [affectedRequirements, definitions, executions]) {
    for (const key of Object.keys(collection)) collection[key] = sorted(collection[key]);
  }
  findings.sort((a, b) => a.id.localeCompare(b.id) || a.code.localeCompare(b.code));
  const refs = findings.filter(f => f.reference);
  const selectedRefs = refs.filter(f => affectedRequirements[f.id]?.some(id => S.includes(id)));
  const broken = S.filter(id => selectedRefs.some(f => affectedRequirements[f.id]?.includes(id)));
  for (const n of nodes) if (records.get(n.recordId)?.type === 'REQUIREMENT' && !S.includes(n.recordId)) {
    n.context.push(!active.get(n.recordId) ? 'inactive' : !P.includes(n.recordId) ? 'unresolved or other product' :
      !L.includes(n.recordId) ? 'other release or unassigned' : 'other project');
  }
  const unassignedSet = set(unassigned, productComplete);
  const result: RequirementChainProjection = {
    contract: 'requirement-chain/0.2', contractRevision: '97c9d41819011ead8fe192c266cba32707eae82f', asAt, snapshotId: input.snapshotId, sourceRevision: input.sourceRevision,
    scope: structuredClone(scope), completeness: productComplete && selectedComplete ? 'complete' : 'incomplete', scopeFindings: sorted(scopeFindings),
    populations: { product: set(P, productComplete), release: set(L, selectedComplete), selected: set(S, selectedComplete),
      inactive: set(requirements.filter(r => envelope.get(r.id) && !active.get(r.id) && rels.some(rel => rel.raw.type === 'product_scope' && rel.raw.from === r.id && rel.raw.to === scope.product && envelope.get(rel.id))).map(r => r.id), complete),
      unresolved: set(unresolved, complete) },
    assignments: { here: set(L, selectedComplete), otherReleaseOnly: set(P.filter(id => elsewhere.has(id) && !L.includes(id)), productComplete),
      unassigned: unassignedSet, invalid: set(P.filter(id => invalidAssignments.has(id)), complete), provenance: selected.provenance.sort((a, b) => a.requirement.localeCompare(b.requirement)) },
    stages: CHAIN_STAGES.map((_, stage) => set(nodes.filter(n => n.stage === stage && S.includes(n.id)).map(n => n.id), selectedComplete)),
    metrics: { broken: set(broken, selectedComplete), noSource: set(noSource, selectedComplete),
      noDefinition: set(S.filter(id => !definitions[id]?.length), selectedComplete),
      noResult: set(S.filter(id => definitions[id]?.length && !executions[id]?.length), selectedComplete),
      failed: set(S.filter(id => executions[id]?.some(v => records.get(v)?.raw.outcome === 'fail')), selectedComplete), unassigned: unassignedSet },
    records: structuredClone([...index.recordsById.values()].flat()).sort((a, b) => a.id.localeCompare(b.id) || a.sourcePath.localeCompare(b.sourcePath)),
    nodes: nodes.sort((a, b) => a.stage - b.stage || a.id.localeCompare(b.id)),
    edges: edges.map(e => ({ ...e, identities: sorted(e.identities) })).sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.id.localeCompare(b.id)),
    findings, defectiveReferences: set(refs.map(f => f.id), complete), selectedReferences: set(selectedRefs.map(f => f.id), selectedComplete),
    unattributableFindings: set(findings.filter(f => !affectedRequirements[f.id]?.length).map(f => f.id), complete),
    affectedRequirements, definitions, executions,
  };
  return freeze(result);
}

/** Both is two independent walks, never an expansion from the union frontier. */
export function selectRequirementChain(p: RequirementChainProjection, focus?: string, direction: 'upstream' | 'downstream' | 'both' = 'both') {
  const ids = new Set<string>(); const edgeIds = new Set<string>();
  const walk = (seeds: string[], upstream: boolean) => {
    const seen = new Set(seeds), queue = [...seeds]; seeds.forEach(id => ids.add(id));
    while (queue.length) {
      const id = queue.pop()!;
      for (const e of p.edges.filter(e => e.trace)) {
        if ((upstream ? e.to : e.from) !== id) continue;
        edgeIds.add(e.id);
        const next = upstream ? e.from : e.to;
        if (e.valid && p.nodes.some(n => n.id === next) && !seen.has(next)) { seen.add(next); ids.add(next); queue.push(next); }
      }
    }
  };
  if (focus) {
    if (direction !== 'downstream') walk([focus], true);
    if (direction !== 'upstream') walk([focus], false);
  } else {
    walk(p.populations.selected.ids, true);
    for (const e of p.edges) if (e.kind === 'verifies' && p.populations.selected.ids.includes(e.from)) {
      ids.add(e.to); edgeIds.add(e.id);
      for (const result of p.edges.filter(x => x.kind === 'result' && x.from === e.to)) { ids.add(result.to); edgeIds.add(result.id); }
    }
  }
  return { nodes: p.nodes.filter(n => ids.has(n.id)), edges: p.edges.filter(e => edgeIds.has(e.id)) };
}

/** Count/list contract for the release report, derived solely from the shared snapshot. */
export function requirementReleaseCounts(p: RequirementChainProjection) {
  type Count = { label: string; unit: 'requirements' | 'references' | 'findings' | 'source documents' | 'drivers' | 'needs' | 'definition parts' | 'result parts'; set: ChainSet };
  const counts: Record<string, Count> = {};
  const add = (key: string, label: string, value: ChainSet, unit: Count['unit'] = 'requirements') => {
    counts[key] = { label, unit, set: value };
  };
  const labels = { broken: 'Broken references', noSource: 'No accepted source path', noDefinition: 'No valid verification definition',
    noResult: 'No applicable executed result (defined verification)', failed: 'Applicable failed verification', unassigned: 'No effective release assignment (whole product)' };
  for (const key of Object.keys(labels) as (keyof typeof labels)[]) add('metric-' + key, labels[key], p.metrics[key]);
  for (let stage = 3; stage <= 6; stage++) {
    add('stage-' + stage, CHAIN_STAGES[stage], p.stages[stage]);
    add('unassigned-' + stage, 'Unassigned: ' + CHAIN_STAGES[stage], set(p.metrics.unassigned.ids.filter(id => p.nodes.some(n => n.id === id && n.stage === stage)), p.metrics.unassigned.completeness === 'complete'));
  }
  add('selected', 'Selected requirements', p.populations.selected);
  add('product', 'Product requirements', p.populations.product);
  add('here', 'Assigned here (whole product)', p.assignments.here);
  add('other', 'Other-release-only (whole product)', p.assignments.otherReleaseOnly);
  add('invalid', 'Invalid or dangling assignment (whole product)', p.assignments.invalid);
  add('unresolved', 'Unresolved membership (catalogue)', p.populations.unresolved);
  add('selected-references', 'Selected defective references', p.selectedReferences, 'references');
  add('all-references', 'Known reference inventory', p.defectiveReferences, 'references');
  add('unattributable', 'Unattributable findings', p.unattributableFindings, 'findings');
  const view = selectRequirementChain(p);
  const contextUnits = { 0: 'source documents', 1: 'drivers', 2: 'needs', 7: 'definition parts', 8: 'result parts' } as const;
  for (const stage of [0, 1, 2, 7, 8] as const) add('context-' + stage, CHAIN_STAGES[stage],
    set(view.nodes.filter(n => n.stage === stage).map(n => n.id), p.populations.selected.completeness === 'complete'), contextUnits[stage]);
  return freeze(counts);
}

/** Monotonic refresh gate shared by reports; late successes and failures cannot replace newer data. */
export class RequirementChainSnapshot {
  private generation = 0;
  current?: RequirementChainProjection;
  stale = false;
  async refresh(load: () => Promise<ChainInput>): Promise<boolean> {
    const generation = ++this.generation;
    try {
      const input = await load();
      if (generation !== this.generation) return false;
      this.current = buildRequirementChain(input); this.stale = false; return true;
    } catch {
      if (generation === this.generation) this.stale = true;
      return false;
    }
  }
}
