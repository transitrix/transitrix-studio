import { createHash } from 'node:crypto';
import letters from '@unicode/unicode-15.1.0/General_Category/Letter/regex.mjs';
import marks from '@unicode/unicode-15.1.0/General_Category/Mark/regex.mjs';
import numbers from '@unicode/unicode-15.1.0/General_Category/Number/regex.mjs';
import connectors from '@unicode/unicode-15.1.0/General_Category/Connector_Punctuation/regex.mjs';
import { exclusions, extractRequirement, sourceSegments, type Span, type Exclusion } from './source.js';

export const VERSION = '0.1.0';
export const CONTRACT_REVISION = 'e3b51b64c837bd6a05eb5c1631819cc2adf1ccfd';
export const RULES = ['RLA-PLACEHOLDER', 'RLA-TIMING', 'RLA-EVALUATIVE'] as const;
export type Rule = typeof RULES[number];
export type Field = 'name' | 'description';
export type Coverage = 'not-evaluated' | 'partially-evaluated' | 'evaluated';
export const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const digest = (value: unknown) => hash(JSON.stringify(value));
const questions: Record<Rule, string> = {
  'RLA-PLACEHOLDER': 'What decision or reference resolves this recorded placeholder, and who can confirm it?',
  'RLA-TIMING': 'Which applicable deadline or triggering condition is intended here, or is this deliberately high-level timing?',
  'RLA-EVALUATIVE': 'Which acceptance criterion or definition applies here, or is this deliberately a stakeholder-level quality goal?',
};
const patterns: Record<Rule, RegExp> = {
  'RLA-PLACEHOLDER': /tbd|tbc/g,
  'RLA-TIMING': /as[ \t\n]+soon[ \t\n]+as[ \t\n]+possible/g,
  'RLA-EVALUATIVE': /user-friendly|quickly|fast/g,
};

export interface Configuration {
  enabled: boolean;
  rules: Rule[];
  /** Explicitly declared English fields or non-overlapping scalar ranges. */
  english: Partial<Record<Field, true | Span[]>>;
}
export interface Snapshot { commit: string; overlaySha256: string }
export interface VisibleContext {
  kind: 'verification' | 'definition';
  identity: string; revision: string; snapshot: Snapshot; excerpt: string;
  verifies?: string; admitted?: boolean; verifiedOn?: string;
  selectedLink?: string; target?: string; anchor?: string;
  requirementPath?: string;
}
export interface Binding {
  requirementId: string; field: Field; fieldSha256: string; span: Span;
  rule: Rule; contextSha256: string; snapshot: Snapshot;
  actor: string; rationale: string;
  resolution: 'criterion-supplied' | 'placeholder-resolved' | 'intentional-high-level';
}
export interface Selection {
  /** Opaque handles must not be copied to diagnostics before authorization. */
  handle: string; fields: Field[]; contextHandles?: string[]; release?: string;
  excerpts?: Partial<Record<Field, { span: Span; provenance: string }[]>>;
  bindings?: Binding[];
}
export interface Adapter {
  authorize(handle: string, kind: 'requirement' | 'context'): boolean | Promise<boolean>;
  readRequirement(handle: string): Promise<{ path: string; bytes: Uint8Array }>;
  readContext(handle: string): Promise<VisibleContext | undefined>;
}
export interface Finding {
  identity: string; path: string; requirementId: string; field: Field;
  span: Span; sourceSegments: Span[]; matchedText: string;
  ruleId: Rule; ruleVersion: string; severity: 'advisory'; question: string;
  negation: 'nearby' | 'unknown'; criterion: 'unknown' | 'context-present';
  contexts: VisibleContext[]; contextSha256: string; limitations: string[];
  snapshot: Snapshot; sourceSha256: string; fieldSha256: string;
}
export interface AuditEvent {
  action: 'dismiss' | 'revoke'; findingIdentity: string; snapshot: Snapshot;
  contextSha256: string; actor: string; reason: string; time: string;
}
export interface Result {
  resultVersion: '1.0.0'; contractVersion: string; contractRevision: string; unicodeVersion: '15.1.0';
  configuration: Configuration; configurationSha256: string; repositoryIdentity: string; snapshot: Snapshot;
  optIn: boolean; coverage: Coverage; status: Coverage | 'no-findings' | 'findings';
  fields: { path: string; requirementId: string; field: Field; coverage: Coverage; limitations: string[]; exclusions: Exclusion[] }[];
  findings: Finding[]; contextResolutions: { finding: Finding; binding: Binding }[];
  dismissed: { finding: Finding; event: AuditEvent }[]; limitations: string[];
}

function identifier(c: string | undefined): boolean {
  return !!c && (letters.test(c) || marks.test(c) || numbers.test(c) || connectors.test(c) || '-./:@+'.includes(c));
}
function boundary(chars: string[], i: number): boolean {
  return !identifier(chars[i]) || chars[i] === '.' && (i + 1 === chars.length || /\s/u.test(chars[i + 1]));
}
function ranges(input: true | Span[] | undefined, length: number): Span[] {
  if (input === true) return length ? [[0, length]] : [];
  if (!Array.isArray(input)) return [];
  const sorted = input.map(s => [...s] as Span).sort((a, b) => a[0] - b[0]);
  if (sorted.some((s, i) => s.length !== 2 || !s.every(Number.isSafeInteger) || s[0] < 0 || s[1] <= s[0] || s[1] > length || i > 0 && s[0] < sorted[i - 1][1])) return [];
  return sorted;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const overlap = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1];
const compare = (a: Finding, b: Finding) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) ||
  Buffer.compare(Buffer.from(a.requirementId), Buffer.from(b.requirementId)) ||
  (a.field === b.field ? 0 : a.field === 'name' ? -1 : 1) || a.span[0] - b.span[0] || a.span[1] - b.span[1] || a.ruleId.localeCompare(b.ruleId, 'en');

/** No reads or writes outside the explicitly authorized adapter. Missing and denied are indistinguishable. */
export async function evaluateRequirements(input: {
  repositoryIdentity: string; snapshot: Snapshot; configuration: Configuration;
  selections: Selection[]; adapter: Adapter; audit?: readonly AuditEvent[];
}): Promise<Result> {
  const { adapter, snapshot, repositoryIdentity } = input;
  const authorized = async (handle: string, kind: 'requirement' | 'context') => {
    try { return await adapter.authorize(handle, kind) === true; } catch { return false; }
  };
  if (!repositoryIdentity || !snapshot.commit || !/^[a-f0-9]{64}$/.test(snapshot.overlaySha256)) throw new Error('Actual snapshot identity is required');
  const configuration = structuredClone(input.configuration);
  if (configuration.rules.some(r => !RULES.includes(r))) throw new Error('Unsupported advisory rule');
  configuration.rules = RULES.filter(r => configuration.rules.includes(r));
  configuration.english = Object.fromEntries((['name', 'description'] as const)
    .filter(f => configuration.english[f] !== undefined).map(f => [f, configuration.english[f]]));
  const result: Result = { resultVersion: '1.0.0', contractVersion: VERSION, contractRevision: CONTRACT_REVISION,
    unicodeVersion: '15.1.0', configuration, configurationSha256: digest(configuration), repositoryIdentity, snapshot,
    optIn: configuration.enabled, coverage: 'not-evaluated', status: 'not-evaluated', fields: [], findings: [], contextResolutions: [], dismissed: [], limitations: [] };
  for (const selection of input.selections) {
    if (!await authorized(selection.handle, 'requirement')) {
      if (!result.limitations.includes('scope-unavailable')) result.limitations.push('scope-unavailable');
      continue;
    }
    let source: Awaited<ReturnType<Adapter['readRequirement']>>;
    try { source = await adapter.readRequirement(selection.handle); }
    catch { if (!result.limitations.includes('scope-unavailable')) result.limitations.push('scope-unavailable'); continue; }
    const parsed = extractRequirement(source.bytes);
    const requirementId = parsed.id ?? '';
    const sourceSha256 = hash(source.bytes);
    for (const field of ['name', 'description'] as const) {
      if (!selection.fields.includes(field)) continue;
      const mapped = parsed.fields[field];
      const limitations: string[] = [];
      if (result.fields.some(f => f.path === source.path && f.field === field)) throw new Error('Duplicate requested field');
      const coverage = { path: source.path, requirementId, field, coverage: 'not-evaluated' as Coverage, limitations, exclusions: [] as Exclusion[] };
      result.fields.push(coverage);
      if (!configuration.enabled || !configuration.rules.length) { limitations.push('disabled'); continue; }
      if (!mapped) { limitations.push(parsed.limitation ?? 'source-map-unavailable'); continue; }
      const chars = Array.from(mapped.value);
      const english = ranges(configuration.english[field], chars.length);
      if (!english.length) { limitations.push('english-scope-unavailable'); continue; }
      coverage.coverage = english.reduce((n, s) => n + s[1] - s[0], 0) === chars.length ? 'evaluated' : 'partially-evaluated';
      if (coverage.coverage === 'partially-evaluated') limitations.push('partial-language-scope');
      const markdown = exclusions(mapped.value); coverage.exclusions = markdown.exclusions;
      for (const excerpt of selection.excerpts?.[field] ?? []) {
        if (excerpt.provenance && ranges([excerpt.span], chars.length).length) coverage.exclusions.push({ span: excerpt.span, reason: 'source-excerpt' });
        else { coverage.coverage = 'partially-evaluated'; limitations.push('unsupported-excerpt'); }
      }
      const contexts: VisibleContext[] = [];
      let unavailable = false;
      for (const handle of selection.contextHandles ?? []) {
        if (!await authorized(handle, 'context')) { unavailable = true; continue; }
        let context: VisibleContext | undefined;
        try { context = await adapter.readContext(handle); } catch { unavailable = true; continue; }
        if (!context || !same(context.snapshot, snapshot) || !context.identity || !context.revision || !context.excerpt) { unavailable = true; continue; }
        const eligible = context.kind === 'verification'
          ? context.admitted === true && context.verifies === requirementId && (!selection.release || context.verifiedOn === selection.release)
          : context.kind === 'definition' && !!context.target && !!context.anchor &&
            (!context.requirementPath || context.requirementPath === source.path) &&
            context.selectedLink === context.target + '#' + context.anchor && markdown.links.includes(context.selectedLink);
        if (!eligible) { unavailable = true; continue; }
        contexts.push(structuredClone(context));
      }
      contexts.sort((a, b) => Buffer.compare(Buffer.from(a.identity), Buffer.from(b.identity)) || Buffer.compare(Buffer.from(a.revision), Buffer.from(b.revision)));
      if (unavailable) { coverage.coverage = 'partially-evaluated'; limitations.push('context-unavailable'); }
      const contextSha256 = digest(contexts);
      const fieldSha256 = hash(mapped.value);
      for (const scope of english) {
        const text = chars.slice(...scope).join('').replace(/[A-Z]/g, c => c.toLowerCase());
        for (const rule of configuration.rules) {
          for (const match of text.matchAll(new RegExp(patterns[rule]))) {
            const start = scope[0] + Array.from(text.slice(0, match.index)).length;
            const end = start + Array.from(match[0]).length; const span: Span = [start, end];
            if (start > scope[0] && !boundary(chars, start - 1) || end < scope[1] && !boundary(chars, end) || coverage.exclusions.some(e => overlap(e.span, span))) continue;
            const before = chars.slice(scope[0], start).join('');
            const negation = /(?:^|[^a-zA-Z])(?:not|never|no)[ \t\n]+$/i.test(before) ? 'nearby' : 'unknown';
            const finding: Finding = { identity: digest(['rla-finding-1', repositoryIdentity, requirementId, field, rule, VERSION, fieldSha256, start, end]),
              path: source.path, requirementId, field, span, sourceSegments: sourceSegments(mapped, span), matchedText: chars.slice(start, end).join(''),
              ruleId: rule, ruleVersion: VERSION, severity: 'advisory', question: questions[rule] + (contexts.length ? ' Check the cited context before adding another criterion.' : ''),
              negation, criterion: contexts.length ? 'context-present' : 'unknown', contexts, contextSha256, limitations: [...limitations], snapshot, sourceSha256, fieldSha256 };
            const candidates = (selection.bindings ?? []).filter(b => b.requirementId === requirementId && b.field === field && b.rule === rule && same(b.span, span));
            const bindings = candidates.filter(b =>
              b.fieldSha256 === fieldSha256 && same(b.span, span) && same(b.snapshot, snapshot) && b.contextSha256 === contextSha256 &&
              b.actor.trim() && b.rationale.trim() && ['criterion-supplied', 'placeholder-resolved', 'intentional-high-level'].includes(b.resolution));
            if (!unavailable && contexts.length && bindings.length === 1 && candidates.length === 1) { result.contextResolutions.push({ finding, binding: structuredClone(bindings[0]) }); continue; }
            const event = input.audit?.filter(e => validAudit(e) && e.findingIdentity === finding.identity && same(e.snapshot, snapshot) && e.contextSha256 === contextSha256).at(-1);
            if (event?.action === 'dismiss') result.dismissed.push({ finding, event: structuredClone(event) });
            else result.findings.push(finding);
          }
        }
      }
    }
  }
  result.findings.sort(compare); result.contextResolutions.sort((a, b) => compare(a.finding, b.finding)); result.dismissed.sort((a, b) => compare(a.finding, b.finding));
  result.fields.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)) || Buffer.compare(Buffer.from(a.requirementId), Buffer.from(b.requirementId)) || (a.field === b.field ? 0 : a.field === 'name' ? -1 : 1));
  result.coverage = result.fields.length && result.fields.every(f => f.coverage === 'evaluated') && !result.limitations.length ? 'evaluated'
    : result.fields.some(f => f.coverage !== 'not-evaluated') ? 'partially-evaluated' : 'not-evaluated';
  result.status = result.coverage === 'evaluated' ? result.findings.length ? 'findings' : 'no-findings' : result.coverage;
  return result;
}

function validAudit(e: AuditEvent): boolean {
  return ['dismiss', 'revoke'].includes(e.action) && !!e.actor?.trim() && !!e.reason?.trim() && Number.isFinite(Date.parse(e.time));
}
/** The adapter must authenticate actor and authorize this explicit action before persisting. */
export function auditEvent(finding: Finding, action: 'dismiss' | 'revoke', actor: string, reason: string, time: string): AuditEvent {
  const event = { action, findingIdentity: finding.identity, snapshot: finding.snapshot, contextSha256: finding.contextSha256, actor, reason, time };
  if (!validAudit(event)) throw new Error('Dismissal/revocation requires actor, reason and time');
  return event;
}
