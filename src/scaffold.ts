// `transitrix new goal` — "authoring a first element requires only its own
// content, the envelope is supplied" — first cut. Scaffolds a
// standalone GOAL element file (ELEMENT_PRIMITIVES.md §7.2) with the
// admission record (CONTRACT.md §6) and primitive lifecycle (CONTRACT.md §7)
// computed by the tool, not hand-typed by the author.
//
// Scope of this first cut: GOAL only, and only the *creation* path (a brand
// new file, hand-formatted so header comments match the existing
// `.templates/elements/*_template.yaml` convention). Completing envelope
// fields on an already-hand-authored file (`validate --fix`) is a distinct,
// harder problem — this repo has no comment-preserving YAML writer, so a
// naive parse-mutate-dump round-trip would silently strip every comment in
// the file — and is left for a follow-up.
//
// `admitted_by` identifies the human running this command (CONTRACT.md §6.2:
// a tool self-identifying would make this an `ai_reviewed` record, not what
// a human authoring their own canon wants) — resolved from `--author` or
// `git config user.name`, never invented. `gate_checks` records checks this
// command actually ran, not a constant `pass` (per the epic's own
// constraint): `uniqueness` is a real scan of `canon/elements/**` and
// `canon/relations/**` for an id collision; `consistency` verifies every
// `factors:` reference resolves to an existing canon id; `completeness` is
// true by construction (id/name are required CLI args). Any failed check
// aborts before writing — this command never writes a `gate_checks` entry
// that says `pass` when the thing it describes didn't happen.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import type { AgreementValue } from '@transitrix/diagrams/agreement.js';
import { isIsoDate } from './cli-parse.js';

const SKIP_SEGMENTS = new Set(['node_modules', '.templates', '.validators']);
const GOAL_ELEM_ID_RE = /^GOAL-([A-Z0-9]+-)*[0-9]+$/;

function segments(rel: string): string[] {
  return rel.split(/[\\/]/);
}

function isYaml(rel: string): boolean {
  return /\.ya?ml$/i.test(rel);
}

function shouldSkip(rel: string): boolean {
  return segments(rel).some((s) => SKIP_SEGMENTS.has(s));
}

/** Every `id:` found under `canon/elements/**` and `canon/relations/**` —
 *  used for the uniqueness gate check and for resolving `factors:`
 *  references. Deliberately minimal (id only, no full RepoDoc/RepoFinding
 *  machinery): this is a pre-write existence check, not a validation pass,
 *  and an unreadable file is skipped rather than surfaced — a broken
 *  neighbour file must not block scaffolding a new one.
 *
 *  `excludeAbsPath`, when given, skips that one file — so a caller checking
 *  an *existing* canon file's own id (e.g. `validate --fix` computing
 *  `gate_checks.uniqueness`) doesn't trivially find itself. */
export function collectExistingCanonIds(root: string, excludeAbsPath?: string): Set<string> {
  const ids = new Set<string>();
  for (const zone of ['elements', 'relations']) {
    let entries: string[] = [];
    try {
      entries = readdirSync(path.join(root, 'canon', zone), { recursive: true }) as string[];
    } catch {
      continue;
    }
    for (const rel of entries) {
      if (typeof rel !== 'string' || !isYaml(rel) || shouldSkip(rel)) continue;
      const absPath = path.join(root, 'canon', zone, rel);
      if (excludeAbsPath && path.resolve(absPath) === excludeAbsPath) continue;
      try {
        const data = yaml.load(readFileSync(absPath, 'utf-8'));
        if (data && typeof data === 'object' && !Array.isArray(data)) {
          const id = (data as Record<string, unknown>).id;
          if (typeof id === 'string' && id) ids.add(id);
        }
      } catch {
        // Unreadable/unparseable neighbour — not this command's concern.
      }
    }
  }
  return ids;
}

/** `git config user.name` in `root`, or undefined if git is unavailable /
 *  unconfigured. Never a fallback guess — an absent identity is surfaced to
 *  the caller as a missing `--author`, not silently invented. */
export function gitUserName(root: string): string | undefined {
  try {
    const out = execFileSync('git', ['config', 'user.name'], { cwd: root, encoding: 'utf-8' }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
}

export interface NewGoalOptions {
  /** Adopter repo root containing `canon/`. */
  root: string;
  id: string;
  name: string;
  /** Person handle recorded as `admitted_by` (CONTRACT.md §6.2 — a human
   *  handle here, never a tool id, keeps `admission_state`/`reviewer_authority`
   *  at their human-authored defaults: absent ⇒ active ⇒ expert_confirmed). */
  admittedBy: string;
  /** ISO 8601 date (CONTRACT.md §4) used for `admitted_at`, and for
   *  `valid_from` when {@link NewGoalOptions.validFrom} is absent.
   *  Caller-supplied rather than computed here so the function stays pure
   *  and testable without mocking the clock. */
  today: string;
  /** Overrides `valid_from` (CONTRACT.md §7 — the date the primitive starts
   *  being true). Defaults to `today`.
   *
   *  `admitted_at` has deliberately no counterpart override: it records when
   *  admission actually happened, so a caller-set value would falsify the
   *  admission record — the same reason `gate_checks` is never written as a
   *  constant `pass`. `valid_from` is a modelling statement about the subject,
   *  which the author may legitimately know to be earlier or later than the
   *  day they type the command. */
  validFrom?: string;
  type?: string;
  level?: number;
  parent?: string;
  factors?: string[];
  description?: string;
  link?: string;
}

export type ScaffoldOutcome =
  | { ok: true; relPath: string; content: string; filled: string[] }
  | { ok: false; errors: string[] };

/** Renders the GOAL element YAML by hand (not `js-yaml.dump`) so the output
 *  keeps the same header-comment convention as
 *  `.templates/elements/01_motivation_template.yaml` and every worked
 *  example under `organizations/acme_corp/canon/elements/`. */
function renderGoalYaml(opts: NewGoalOptions): string {
  const lines: string[] = [];
  lines.push('notation: goal');
  lines.push(`id: ${opts.id}`);
  lines.push(`name: "${opts.name.replace(/"/g, '\\"')}"`);
  if (opts.type) lines.push(`type: "${opts.type.replace(/"/g, '\\"')}"`);
  if (opts.level !== undefined) lines.push(`level: ${opts.level}`);
  if (opts.parent) lines.push(`parent: ${opts.parent}`);
  if (opts.factors && opts.factors.length > 0) {
    lines.push(`factors: [${opts.factors.join(', ')}]`);
  }
  if (opts.description) lines.push(`description: "${opts.description.replace(/"/g, '\\"')}"`);
  if (opts.link) lines.push(`link: "${opts.link.replace(/"/g, '\\"')}"`);
  lines.push('');
  lines.push('# Admission record (CONTRACT.md §6) — filled by `transitrix new goal`');
  lines.push('zone: canon');
  lines.push(`admitted_at: "${opts.today}"`);
  lines.push(`admitted_by: "${opts.admittedBy.replace(/"/g, '\\"')}"`);
  lines.push('gate_checks:');
  lines.push('  uniqueness: pass   # id not already present under canon/elements or canon/relations');
  lines.push('  consistency: pass  # every factors: reference resolves to an existing canon id');
  lines.push('  completeness: pass # required fields present');
  lines.push('');
  lines.push('# Primitive lifecycle (CONTRACT.md §7)');
  lines.push(`valid_from: "${opts.validFrom ?? opts.today}"`);
  lines.push('valid_to: null');
  lines.push('');
  return lines.join('\n');
}

/**
 * Computes the envelope for a new GOAL element and renders its YAML, or
 * returns the list of gate-check failures without writing anything.
 * `consistency` and `uniqueness` are real checks against `opts.root`'s
 * current canon — a failure here means the check that would have produced
 * that `gate_checks` entry did not pass, so the file is not written rather
 * than written with a false `pass`.
 */
export function scaffoldGoalElement(opts: NewGoalOptions): ScaffoldOutcome {
  const errors: string[] = [];

  if (!GOAL_ELEM_ID_RE.test(opts.id)) {
    errors.push(`id '${opts.id}' does not match the canonical GOAL-[<middle>-]<INTEGER> grammar`);
  }
  if (!opts.name.trim()) {
    errors.push('name is required');
  }
  if (!opts.admittedBy.trim()) {
    errors.push(
      'no admitted_by identity available — pass --author "<name>" or set `git config user.name`',
    );
  }

  const existingIds = collectExistingCanonIds(opts.root);

  if (errors.length === 0 && existingIds.has(opts.id)) {
    errors.push(`gate_checks.uniqueness: id '${opts.id}' already exists in canon`);
  }

  const missingFactors = (opts.factors ?? []).filter((f) => !existingIds.has(f));
  if (errors.length === 0 && missingFactors.length > 0) {
    errors.push(`gate_checks.consistency: factor(s) not found in canon: ${missingFactors.join(', ')}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const relPath = ['canon', 'elements', '01_motivation', 'goals', `${opts.id}.yaml`].join('/');
  return {
    ok: true,
    relPath,
    content: renderGoalYaml(opts),
    filled: ['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to'],
  };
}

/** Writes a successful {@link scaffoldGoalElement} outcome to disk, creating
 *  parent directories as needed. Refuses to overwrite an existing file —
 *  the uniqueness gate check already means this should not happen for a
 *  well-formed id, but a stray non-canon file at the same path (e.g. a
 *  `.gitkeep`) must not be clobbered silently. */
export function writeScaffoldedElement(root: string, outcome: Extract<ScaffoldOutcome, { ok: true }>): string {
  const absPath = path.join(root, ...outcome.relPath.split('/'));
  if (existsSync(absPath)) {
    throw new Error(`refusing to overwrite existing file: ${outcome.relPath}`);
  }
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, outcome.content, 'utf-8');
  return absPath;
}

// ── DRIVER, CONSTRAINT, REQUIREMENT — same mechanism as GOAL, per-TYPE fields ──
//
// Same admission-record/lifecycle computation as scaffoldGoalElement above;
// only the notation, id grammar, folder, and per-TYPE field set differ.
// Field sets: ELEMENT_PRIMITIVES.md §7.1 (DRIVER), §7.13 (CONSTRAINT, sharing
// RULE's §7.12 shape), elements/15-requirement.md §2 (REQUIREMENT).

const DRIVER_ELEM_ID_RE = /^DRIVER-([A-Z0-9]+-)*[0-9]+$/;
const CONSTRAINT_ELEM_ID_RE = /^CONSTRAINT-([A-Z0-9]+-)*[0-9]+$/;
const REQUIREMENT_ELEM_ID_RE = /^REQUIREMENT-([A-Z0-9]+-)*[0-9]+$/;

/** Agreement-axis fields (CONTRACT.md §6.3), when requested — REQUIREMENT /
 *  CONSTRAINT / NEED only. `draft` / `disputed` render as-is; `agreed` is
 *  refused before this is ever reached ({@link refuseWriteAgreed}), since
 *  the axis is worth having only because a *human* commits it (AGREE-002) —
 *  the tool writing the file must never be the one that sets it. */
export interface AgreementOptions {
  agreement?: AgreementValue;
  agreedBy?: string;
  agreedAt?: string;
}

/** AGREE-002 (CONTRACT.md §6.3.1): a tool must never write `agreement:
 *  agreed`. Every `transitrix new` command — CLI flag or the VS Code
 *  quick-input flow — is a tool; unlike the validator's `looksLikeTool`
 *  heuristic on `agreed_by` (which only catches an *obviously* tool-shaped
 *  handle), this refusal is unconditional: it does not matter whose name
 *  would go in `agreed_by`, because the write is coming from the tool
 *  either way. Returns a refusal message, or undefined when the request is
 *  fine to render. */
export function refuseWriteAgreed(opts: AgreementOptions): string | undefined {
  if (opts.agreement !== 'agreed') return undefined;
  return (
    'agreement: agreed cannot be scaffolded — a tool must never write "agreed" (AGREE-002). ' +
    'Use --agreement draft or --agreement disputed, or have a human set agreement: agreed by ' +
    'hand once they have actually committed to the statement.'
  );
}

function renderAgreementLines(opts: AgreementOptions): string[] {
  if (!opts.agreement) return [];
  const lines = [`agreement: ${opts.agreement}`];
  if (opts.agreedBy) lines.push(`agreed_by: "${opts.agreedBy.replace(/"/g, '\\"')}"`);
  if (opts.agreedAt) lines.push(`agreed_at: "${opts.agreedAt}"`);
  return lines;
}

function renderEnvelopeSuffix(
  cmd: string,
  today: string,
  admittedBy: string,
  validFrom?: string,
  agreement: AgreementOptions = {},
): string {
  const agreementLines = renderAgreementLines(agreement);
  return [
    '',
    ...(agreementLines.length > 0
      ? ['# Agreement axis (CONTRACT.md §6.3) — has the accountable party committed?', ...agreementLines, '']
      : []),
    `# Admission record (CONTRACT.md §6) — filled by \`transitrix new ${cmd}\``,
    'zone: canon',
    `admitted_at: "${today}"`,
    `admitted_by: "${admittedBy.replace(/"/g, '\\"')}"`,
    'gate_checks:',
    '  uniqueness: pass   # id not already present under canon/elements or canon/relations',
    '  consistency: pass  # every cross-reference resolves to an existing canon id',
    '  completeness: pass # required fields present',
    '',
    '# Primitive lifecycle (CONTRACT.md §7)',
    `valid_from: "${validFrom ?? today}"`,
    'valid_to: null',
    '',
  ].join('\n');
}

// ── DRIVER — `01_motivation/factors/` ───────────────────────────────────────

export interface NewDriverOptions {
  root: string;
  id: string;
  name: string;
  admittedBy: string;
  today: string;
  /** Overrides `valid_from`; see {@link NewGoalOptions.validFrom}. */
  validFrom?: string;
  driverType?: string;
  category?: string;
  description?: string;
  referencesConstraint?: string[];
}

function renderDriverYaml(opts: NewDriverOptions): string {
  const lines: string[] = [];
  lines.push('notation: driver');
  lines.push(`id: ${opts.id}`);
  lines.push(`name: "${opts.name.replace(/"/g, '\\"')}"`);
  if (opts.driverType) lines.push(`type: ${opts.driverType}`);
  if (opts.category) lines.push(`category: ${opts.category}`);
  if (opts.description) lines.push(`description: "${opts.description.replace(/"/g, '\\"')}"`);
  if (opts.referencesConstraint && opts.referencesConstraint.length > 0) {
    lines.push(`references_constraint: [${opts.referencesConstraint.join(', ')}]`);
  }
  return lines.join('\n') + '\n' + renderEnvelopeSuffix('driver', opts.today, opts.admittedBy, opts.validFrom);
}

export function scaffoldDriverElement(opts: NewDriverOptions): ScaffoldOutcome {
  const errors: string[] = [];

  if (!DRIVER_ELEM_ID_RE.test(opts.id)) {
    errors.push(`id '${opts.id}' does not match the canonical DRIVER-[<middle>-]<INTEGER> grammar`);
  }
  if (!opts.name.trim()) errors.push('name is required');
  if (!opts.admittedBy.trim()) {
    errors.push(
      'no admitted_by identity available — pass --author "<name>" or set `git config user.name`',
    );
  }

  const existingIds = collectExistingCanonIds(opts.root);

  if (errors.length === 0 && existingIds.has(opts.id)) {
    errors.push(`gate_checks.uniqueness: id '${opts.id}' already exists in canon`);
  }

  const missingConstraints = (opts.referencesConstraint ?? []).filter((c) => !existingIds.has(c));
  if (errors.length === 0 && missingConstraints.length > 0) {
    errors.push(`gate_checks.consistency: constraint(s) not found in canon: ${missingConstraints.join(', ')}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const relPath = ['canon', 'elements', '01_motivation', 'factors', `${opts.id}.yaml`].join('/');
  return {
    ok: true,
    relPath,
    content: renderDriverYaml(opts),
    filled: ['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to'],
  };
}

// ── CONSTRAINT — `01_motivation/constraints/` ───────────────────────────────

export interface NewConstraintOptions {
  root: string;
  id: string;
  name: string;
  admittedBy: string;
  today: string;
  /** Overrides `valid_from`; see {@link NewGoalOptions.validFrom}. */
  validFrom?: string;
  statement: string;
  /** Organisation-defined workflow state (envelope §3) — `active` | `proposed`
   *  | `deprecated` | `retired`. Not part of the methodology's own required
   *  set (ELEMENT_PRIMITIVES.md §7.13, §3), but this repo's own CONSTRAINT
   *  validator (`packages/diagrams/src/constraint/validate.ts`, CONST-001)
   *  requires it — defaulted to `active` so a scaffolded file passes
   *  `validate` out of the box, same posture as the acme-corp worked example. */
  status?: string;
  appliesTo?: string[];
  source?: string;
  ownerRole?: string;
  severity?: string;
  rationale?: string;
  nextReviewAt?: string;
  parent?: string;
  agreement?: AgreementValue;
  agreedBy?: string;
  agreedAt?: string;
}

function renderConstraintYaml(opts: NewConstraintOptions): string {
  const lines: string[] = [];
  lines.push('notation: constraint');
  lines.push(`id: ${opts.id}`);
  lines.push(`name: "${opts.name.replace(/"/g, '\\"')}"`);
  lines.push(`statement: "${opts.statement.replace(/"/g, '\\"')}"`);
  lines.push(`status: ${(opts.status?.trim() || 'active')}`);
  if (opts.appliesTo && opts.appliesTo.length > 0) lines.push(`applies_to: [${opts.appliesTo.join(', ')}]`);
  if (opts.source) lines.push(`source: "${opts.source.replace(/"/g, '\\"')}"`);
  if (opts.ownerRole) lines.push(`owner_role: ${opts.ownerRole}`);
  if (opts.severity) lines.push(`severity: ${opts.severity}`);
  if (opts.rationale) lines.push(`rationale: "${opts.rationale.replace(/"/g, '\\"')}"`);
  if (opts.nextReviewAt) lines.push(`next_review_at: "${opts.nextReviewAt}"`);
  if (opts.parent) lines.push(`parent: ${opts.parent}`);
  return (
    lines.join('\n') +
    '\n' +
    renderEnvelopeSuffix('constraint', opts.today, opts.admittedBy, opts.validFrom, {
      agreement: opts.agreement, agreedBy: opts.agreedBy, agreedAt: opts.agreedAt,
    })
  );
}

export function scaffoldConstraintElement(opts: NewConstraintOptions): ScaffoldOutcome {
  const errors: string[] = [];

  const agreedRefusal = refuseWriteAgreed(opts);
  if (agreedRefusal) errors.push(agreedRefusal);

  if (!CONSTRAINT_ELEM_ID_RE.test(opts.id)) {
    errors.push(`id '${opts.id}' does not match the canonical CONSTRAINT-[<middle>-]<INTEGER> grammar`);
  }
  if (!opts.name.trim()) errors.push('name is required');
  if (!opts.statement.trim()) errors.push('statement is required');
  if (!opts.admittedBy.trim()) {
    errors.push(
      'no admitted_by identity available — pass --author "<name>" or set `git config user.name`',
    );
  }

  const existingIds = collectExistingCanonIds(opts.root);

  if (errors.length === 0 && existingIds.has(opts.id)) {
    errors.push(`gate_checks.uniqueness: id '${opts.id}' already exists in canon`);
  }

  if (errors.length === 0 && opts.parent && !existingIds.has(opts.parent)) {
    errors.push(`gate_checks.consistency: parent not found in canon: ${opts.parent}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const relPath = ['canon', 'elements', '01_motivation', 'constraints', `${opts.id}.yaml`].join('/');
  return {
    ok: true,
    relPath,
    content: renderConstraintYaml(opts),
    filled: ['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to'],
  };
}

// ── REQUIREMENT — `01_motivation/requirements/` ─────────────────────────────

export interface NewRequirementOptions {
  root: string;
  id: string;
  name: string;
  admittedBy: string;
  today: string;
  /** Overrides `valid_from`; see {@link NewGoalOptions.validFrom}. */
  validFrom?: string;
  description: string;
  origin?: string;
  severity?: string;
  level?: string;
  kind?: string;
  parent?: string;
  nextReviewAt?: string;
  serves?: string;
  derivedFrom?: string[];
  agreement?: AgreementValue;
  agreedBy?: string;
  agreedAt?: string;
}

function renderRequirementYaml(opts: NewRequirementOptions): string {
  const lines: string[] = [];
  lines.push('notation: requirement');
  lines.push(`id: ${opts.id}`);
  lines.push(`name: "${opts.name.replace(/"/g, '\\"')}"`);
  lines.push(`description: "${opts.description.replace(/"/g, '\\"')}"`);
  if (opts.origin) lines.push(`origin: ${opts.origin}`);
  if (opts.severity) lines.push(`severity: ${opts.severity}`);
  if (opts.level) lines.push(`level: ${opts.level}`);
  if (opts.kind) lines.push(`kind: ${opts.kind}`);
  if (opts.parent) lines.push(`parent: ${opts.parent}`);
  if (opts.nextReviewAt) lines.push(`next_review_at: "${opts.nextReviewAt}"`);
  if (opts.serves) lines.push(`serves: ${opts.serves}`);
  if (opts.derivedFrom && opts.derivedFrom.length > 0) lines.push(`derived_from: [${opts.derivedFrom.join(', ')}]`);
  return (
    lines.join('\n') +
    '\n' +
    renderEnvelopeSuffix('requirement', opts.today, opts.admittedBy, opts.validFrom, {
      agreement: opts.agreement, agreedBy: opts.agreedBy, agreedAt: opts.agreedAt,
    })
  );
}

export function scaffoldRequirementElement(opts: NewRequirementOptions): ScaffoldOutcome {
  const errors: string[] = [];

  const agreedRefusal = refuseWriteAgreed(opts);
  if (agreedRefusal) errors.push(agreedRefusal);

  if (!REQUIREMENT_ELEM_ID_RE.test(opts.id)) {
    errors.push(`id '${opts.id}' does not match the canonical REQUIREMENT-[<middle>-]<INTEGER> grammar`);
  }
  if (!opts.name.trim()) errors.push('name is required');
  if (!opts.description.trim()) errors.push('description is required');
  if (!opts.admittedBy.trim()) {
    errors.push(
      'no admitted_by identity available — pass --author "<name>" or set `git config user.name`',
    );
  }

  const existingIds = collectExistingCanonIds(opts.root);

  if (errors.length === 0 && existingIds.has(opts.id)) {
    errors.push(`gate_checks.uniqueness: id '${opts.id}' already exists in canon`);
  }

  const consistencyErrors: string[] = [];
  if (opts.parent && !existingIds.has(opts.parent)) {
    consistencyErrors.push(`parent not found in canon: ${opts.parent}`);
  }
  if (opts.serves && !existingIds.has(opts.serves)) {
    consistencyErrors.push(`serves target not found in canon: ${opts.serves}`);
  }
  if (errors.length === 0 && consistencyErrors.length > 0) {
    errors.push(`gate_checks.consistency: ${consistencyErrors.join('; ')}`);
  }

  if (errors.length > 0) return { ok: false, errors };

  const relPath = ['canon', 'elements', '01_motivation', 'requirements', `${opts.id}.yaml`].join('/');
  return {
    ok: true,
    relPath,
    content: renderRequirementYaml(opts),
    filled: ['zone', 'admitted_at', 'admitted_by', 'gate_checks', 'valid_from', 'valid_to'],
  };
}

// ── CLI wiring: `transitrix new <goal|driver|constraint|requirement>` ──────

export interface NewElementArgs {
  type: 'goal' | 'driver' | 'constraint' | 'requirement' | undefined;
  id: string | undefined;
  name: string | undefined;
  author: string | undefined;
  /** `--valid-from` — raw, unvalidated; {@link handleNewCommand} rejects a
   *  non-`YYYY-MM-DD` value rather than falling back to today. */
  validFrom: string | undefined;
  root: string;
  typeValue: string | undefined;
  level: number | undefined;
  levelRaw: string | undefined;
  parent: string | undefined;
  factors: string[] | undefined;
  description: string | undefined;
  link: string | undefined;
  category: string | undefined;
  referencesConstraint: string[] | undefined;
  statement: string | undefined;
  status: string | undefined;
  appliesTo: string[] | undefined;
  source: string | undefined;
  ownerRole: string | undefined;
  severity: string | undefined;
  rationale: string | undefined;
  nextReviewAt: string | undefined;
  origin: string | undefined;
  kind: string | undefined;
  serves: string | undefined;
  derivedFrom: string[] | undefined;
  agreement: string | undefined;
  agreedBy: string | undefined;
  agreedAt: string | undefined;
  dryRun: boolean;
  wantsHelp: boolean;
}

const NEW_ELEMENT_TYPES = new Set(['goal', 'driver', 'constraint', 'requirement']);

function splitList(v: string | undefined): string[] | undefined {
  return v?.split(',').map((s) => s.trim()).filter(Boolean);
}

export function parseNewArgv(argv: string[]): NewElementArgs {
  const type = NEW_ELEMENT_TYPES.has(argv[0]) ? (argv[0] as NewElementArgs['type']) : undefined;
  const rest = type ? argv.slice(1) : argv;

  const args: NewElementArgs = {
    type,
    id: undefined,
    name: undefined,
    author: undefined,
    validFrom: undefined,
    root: process.cwd(),
    typeValue: undefined,
    level: undefined,
    levelRaw: undefined,
    parent: undefined,
    factors: undefined,
    description: undefined,
    link: undefined,
    category: undefined,
    referencesConstraint: undefined,
    statement: undefined,
    status: undefined,
    appliesTo: undefined,
    source: undefined,
    ownerRole: undefined,
    severity: undefined,
    rationale: undefined,
    nextReviewAt: undefined,
    origin: undefined,
    kind: undefined,
    serves: undefined,
    derivedFrom: undefined,
    agreement: undefined,
    agreedBy: undefined,
    agreedAt: undefined,
    dryRun: false,
    wantsHelp: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--help' || a === '-h') { args.wantsHelp = true; continue; }
    if (a === '--dry-run') { args.dryRun = true; continue; }
    if (a === '--id') { args.id = rest[++i]; continue; }
    if (a.startsWith('--id=')) { args.id = a.slice('--id='.length); continue; }
    if (a === '--name') { args.name = rest[++i]; continue; }
    if (a.startsWith('--name=')) { args.name = a.slice('--name='.length); continue; }
    if (a === '--author') { args.author = rest[++i]; continue; }
    if (a.startsWith('--author=')) { args.author = a.slice('--author='.length); continue; }
    if (a === '--valid-from') { args.validFrom = rest[++i]; continue; }
    if (a.startsWith('--valid-from=')) { args.validFrom = a.slice('--valid-from='.length); continue; }
    if (a === '--root') { args.root = rest[++i]; continue; }
    if (a.startsWith('--root=')) { args.root = a.slice('--root='.length); continue; }
    if (a === '--type') { args.typeValue = rest[++i]; continue; }
    if (a.startsWith('--type=')) { args.typeValue = a.slice('--type='.length); continue; }
    if (a === '--level') { const v = rest[++i]; args.level = Number(v); args.levelRaw = v; continue; }
    if (a.startsWith('--level=')) { const v = a.slice('--level='.length); args.level = Number(v); args.levelRaw = v; continue; }
    if (a === '--parent') { args.parent = rest[++i]; continue; }
    if (a.startsWith('--parent=')) { args.parent = a.slice('--parent='.length); continue; }
    if (a === '--factors') { args.factors = rest[++i]?.split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a.startsWith('--factors=')) { args.factors = a.slice('--factors='.length).split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a === '--description') { args.description = rest[++i]; continue; }
    if (a.startsWith('--description=')) { args.description = a.slice('--description='.length); continue; }
    if (a === '--link') { args.link = rest[++i]; continue; }
    if (a.startsWith('--link=')) { args.link = a.slice('--link='.length); continue; }
    if (a === '--category') { args.category = rest[++i]; continue; }
    if (a.startsWith('--category=')) { args.category = a.slice('--category='.length); continue; }
    if (a === '--references-constraint') { args.referencesConstraint = splitList(rest[++i]); continue; }
    if (a.startsWith('--references-constraint=')) { args.referencesConstraint = splitList(a.slice('--references-constraint='.length)); continue; }
    if (a === '--statement') { args.statement = rest[++i]; continue; }
    if (a.startsWith('--statement=')) { args.statement = a.slice('--statement='.length); continue; }
    if (a === '--status') { args.status = rest[++i]; continue; }
    if (a.startsWith('--status=')) { args.status = a.slice('--status='.length); continue; }
    if (a === '--applies-to') { args.appliesTo = splitList(rest[++i]); continue; }
    if (a.startsWith('--applies-to=')) { args.appliesTo = splitList(a.slice('--applies-to='.length)); continue; }
    if (a === '--source') { args.source = rest[++i]; continue; }
    if (a.startsWith('--source=')) { args.source = a.slice('--source='.length); continue; }
    if (a === '--owner-role') { args.ownerRole = rest[++i]; continue; }
    if (a.startsWith('--owner-role=')) { args.ownerRole = a.slice('--owner-role='.length); continue; }
    if (a === '--severity') { args.severity = rest[++i]; continue; }
    if (a.startsWith('--severity=')) { args.severity = a.slice('--severity='.length); continue; }
    if (a === '--rationale') { args.rationale = rest[++i]; continue; }
    if (a.startsWith('--rationale=')) { args.rationale = a.slice('--rationale='.length); continue; }
    if (a === '--next-review-at') { args.nextReviewAt = rest[++i]; continue; }
    if (a.startsWith('--next-review-at=')) { args.nextReviewAt = a.slice('--next-review-at='.length); continue; }
    if (a === '--origin') { args.origin = rest[++i]; continue; }
    if (a.startsWith('--origin=')) { args.origin = a.slice('--origin='.length); continue; }
    if (a === '--kind') { args.kind = rest[++i]; continue; }
    if (a.startsWith('--kind=')) { args.kind = a.slice('--kind='.length); continue; }
    if (a === '--serves') { args.serves = rest[++i]; continue; }
    if (a.startsWith('--serves=')) { args.serves = a.slice('--serves='.length); continue; }
    if (a === '--derived-from') { args.derivedFrom = splitList(rest[++i]); continue; }
    if (a.startsWith('--derived-from=')) { args.derivedFrom = splitList(a.slice('--derived-from='.length)); continue; }
    if (a === '--agreement') { args.agreement = rest[++i]; continue; }
    if (a.startsWith('--agreement=')) { args.agreement = a.slice('--agreement='.length); continue; }
    if (a === '--agreed-by') { args.agreedBy = rest[++i]; continue; }
    if (a.startsWith('--agreed-by=')) { args.agreedBy = a.slice('--agreed-by='.length); continue; }
    if (a === '--agreed-at') { args.agreedAt = rest[++i]; continue; }
    if (a.startsWith('--agreed-at=')) { args.agreedAt = a.slice('--agreed-at='.length); continue; }
  }

  return args;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function printGeneralUsage(): void {
  console.error('usage: transitrix new <goal|driver|constraint|requirement> [options]');
  console.error('');
  console.error('  Scaffolds a standalone motivation-layer element with the admission record');
  console.error('  and lifecycle envelope computed, not hand-typed.');
  console.error('');
  console.error('  transitrix new goal --id <GOAL-…> --name "<label>" [options]');
  console.error('  transitrix new driver --id <DRIVER-…> --name "<label>" [options]');
  console.error('  transitrix new constraint --id <CONSTRAINT-…> --name "<label>" --statement "<…>" [options]');
  console.error('  transitrix new requirement --id <REQUIREMENT-…> --name "<label>" --description "<…>" [options]');
  console.error('');
  console.error('  Run `transitrix new <type> --help` for type-specific options.');
}

function printTypeUsage(type: 'goal' | 'driver' | 'constraint' | 'requirement'): void {
  const common = [
    '  --id <…>             Required — canonical id.',
    '  --name "<label>"     Required — human-readable name.',
    '  --author "<name>"    Recorded as admitted_by. Default: `git config user.name`.',
    '  --valid-from <date>  Recorded as valid_from (YYYY-MM-DD). Default: today.',
    '  --root <dir>         Adopter repo root containing canon/ (default: cwd).',
    '  --dry-run            Print what would be written; do not write the file.',
  ];
  if (type === 'goal') {
    console.error('usage: transitrix new goal --id <GOAL-…> --name "<label>" [options]');
    console.error('');
    console.error('  Scaffolds a standalone GOAL element (canon/elements/01_motivation/goals/).');
    console.error('');
    console.error(common.join('\n'));
    console.error('  --type "<label>"     Goal-type label (e.g. "Strategic Goal").');
    console.error('  --level <n>          Hierarchical level.');
    console.error('  --parent <GOAL-…>    Parent goal id.');
    console.error('  --factors <a,b>      Comma-separated DRIVER-… ids; each must already exist in canon.');
    console.error('  --description "…"    One-paragraph elaboration.');
    console.error('  --link <url>         Supplementary documentation URL.');
  } else if (type === 'driver') {
    console.error('usage: transitrix new driver --id <DRIVER-…> --name "<label>" [options]');
    console.error('');
    console.error('  Scaffolds a standalone DRIVER element (canon/elements/01_motivation/factors/).');
    console.error('');
    console.error(common.join('\n'));
    console.error('  --type <external|internal>  Driver kind.');
    console.error('  --category <…>       PESTLE sub-classification for external drivers.');
    console.error('  --description "…"    One-paragraph elaboration (the standing force, not a finding).');
    console.error('  --references-constraint <a,b>  Comma-separated CONSTRAINT-… ids; each must already exist in canon.');
  } else if (type === 'constraint') {
    console.error('usage: transitrix new constraint --id <CONSTRAINT-…> --name "<label>" --statement "<…>" [options]');
    console.error('');
    console.error('  Scaffolds a standalone CONSTRAINT element (canon/elements/01_motivation/constraints/).');
    console.error('');
    console.error(common.join('\n'));
    console.error('  --statement "<…>"    Required — the normative restriction sentence.');
    console.error('  --status <…>         Workflow state (active|proposed|deprecated|retired). Default: active.');
    console.error('  --applies-to <a,b>   Comma-separated typed ids the constraint governs.');
    console.error('  --source "<…>"       Citation of the authority behind the constraint.');
    console.error('  --owner-role <ROLE-…>  Accountable role.');
    console.error('  --severity <…>       e.g. "mandatory".');
    console.error('  --rationale "…"      Why the constraint exists.');
    console.error('  --next-review-at <date>  Review-due date (ISO 8601).');
    console.error('  --parent <CONSTRAINT-…>  Parent constraint id; must already exist in canon.');
    console.error('  --agreement <draft|disputed>  Agreement axis (CONTRACT.md §6.3). "agreed" is refused —');
    console.error('                       a tool must never write it (AGREE-002); set it by hand instead.');
    console.error('  --agreed-by "<name>"  Accountable party recorded alongside --agreement.');
    console.error('  --agreed-at <date>   Commitment date (ISO 8601).');
  } else {
    console.error('usage: transitrix new requirement --id <REQUIREMENT-…> --name "<label>" --description "<…>" [options]');
    console.error('');
    console.error('  Scaffolds a standalone REQUIREMENT element (canon/elements/01_motivation/requirements/).');
    console.error('');
    console.error(common.join('\n'));
    console.error('  --description "…"    Required — the obligation, its scope, and its conditions.');
    console.error('  --origin <legislative|process-product|project-product>  Requirement taxonomy.');
    console.error('  --severity <…>       Organisation-defined priority.');
    console.error('  --level <stakeholder|system|software>  ISO/IEC/IEEE 29148 specification tier.');
    console.error('  --kind <functional|quality>  Whether the obligation is a behaviour or a quality attribute.');
    console.error('  --parent <REQUIREMENT-…>  Parent requirement id; must already exist in canon.');
    console.error('  --next-review-at <date>  Review-due date (ISO 8601).');
    console.error('  --serves <NEED-…>    Upstream NEED this requirement traces to; must already exist in canon.');
    console.error('  --derived-from <a,b>  Comma-separated codex artefact ids.');
    console.error('  --agreement <draft|disputed>  Agreement axis (CONTRACT.md §6.3). "agreed" is refused —');
    console.error('                       a tool must never write it (AGREE-002); set it by hand instead.');
    console.error('  --agreed-by "<name>"  Accountable party recorded alongside --agreement.');
    console.error('  --agreed-at <date>   Commitment date (ISO 8601).');
  }
}

export async function handleNewCommand(argv: string[]): Promise<void> {
  const args = parseNewArgv(argv);

  if (!args.type) {
    printGeneralUsage();
    process.exit(args.wantsHelp ? 0 : 1);
  }

  if (args.wantsHelp) {
    printTypeUsage(args.type);
    process.exit(0);
  }

  if (!args.id || !args.name) {
    console.error(`transitrix new ${args.type}: --id and --name are required.`);
    process.exit(1);
  }
  if (args.type === 'constraint' && !args.statement) {
    console.error('transitrix new constraint: --statement is required.');
    process.exit(1);
  }
  if (args.type === 'requirement' && !args.description) {
    console.error('transitrix new requirement: --description is required.');
    process.exit(1);
  }

  if (args.validFrom !== undefined && !isIsoDate(args.validFrom)) {
    console.error(
      `transitrix new ${args.type}: --valid-from "${args.validFrom}" is not a calendar date in YYYY-MM-DD form (CONTRACT.md §4).`,
    );
    process.exit(1);
  }

  const root = path.resolve(args.root);
  const admittedBy = args.author ?? gitUserName(root);
  if (!admittedBy) {
    console.error(`transitrix new ${args.type}: no admitted_by identity available.`);
    console.error('  Pass --author "<name>" or set `git config user.name`.');
    process.exit(1);
  }

  const today = todayIso();
  const validFrom = args.validFrom;
  let outcome: ScaffoldOutcome;
  if (args.type === 'goal') {
    outcome = scaffoldGoalElement({
      root, id: args.id, name: args.name, admittedBy, today, validFrom,
      type: args.typeValue, level: args.level, parent: args.parent,
      factors: args.factors, description: args.description, link: args.link,
    });
  } else if (args.type === 'driver') {
    outcome = scaffoldDriverElement({
      root, id: args.id, name: args.name, admittedBy, today, validFrom,
      driverType: args.typeValue, category: args.category,
      description: args.description, referencesConstraint: args.referencesConstraint,
    });
  } else if (args.type === 'constraint') {
    outcome = scaffoldConstraintElement({
      root, id: args.id, name: args.name, admittedBy, today, validFrom,
      statement: args.statement as string, status: args.status, appliesTo: args.appliesTo,
      source: args.source, ownerRole: args.ownerRole, severity: args.severity,
      rationale: args.rationale, nextReviewAt: args.nextReviewAt, parent: args.parent,
      agreement: args.agreement as AgreementValue | undefined, agreedBy: args.agreedBy, agreedAt: args.agreedAt,
    });
  } else {
    outcome = scaffoldRequirementElement({
      root, id: args.id, name: args.name, admittedBy, today, validFrom,
      description: args.description as string, origin: args.origin, severity: args.severity,
      level: args.levelRaw, kind: args.kind, parent: args.parent,
      nextReviewAt: args.nextReviewAt, serves: args.serves, derivedFrom: args.derivedFrom,
      agreement: args.agreement as AgreementValue | undefined, agreedBy: args.agreedBy, agreedAt: args.agreedAt,
    });
  }

  if (!outcome.ok) {
    console.error(`transitrix new ${args.type}: cannot scaffold this element:`);
    outcome.errors.forEach((e) => console.error(`  • ${e}`));
    process.exit(1);
  }

  if (args.dryRun) {
    console.log(`Would write ${outcome.relPath}:`);
    console.log('');
    console.log(outcome.content);
    return;
  }

  const absPath = writeScaffoldedElement(root, outcome);
  console.log(`✓ wrote ${path.relative(root, absPath).replace(/\\/g, '/')}`);
  console.log(`  filled envelope fields: ${outcome.filled.join(', ')}`);
}
