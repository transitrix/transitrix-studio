// `transitrix validate <file> --fix` — targeted text insertion of missing
// envelope fields (CONTRACT.md §6 admission record, §7 primitive lifecycle)
// into an already hand-authored file: insert at a deterministic anchor and
// touch nothing else, failing rather than guessing a position when the
// anchor can't be located; report every field filled and the value used; a
// field this command can't determine is left as a failure, not invented;
// idempotent — running it twice changes nothing the second time.
//
// Deliberately not a parse-mutate-dump round trip — this repo's `js-yaml` has
// no comment-preserving writer, and this repository's premise is that the
// diff is the product (see scaffold.ts's header for the same reasoning on the
// creation path). Missing fields are spliced into the raw text immediately
// after the file's top-level `id:` line — the one anchor every
// envelope-carrying notation already requires and checks first.
//
// Scope: the ten standalone `canon/elements/**` notations whose envelope
// validators share one shape (REQUIRED_STRING_FIELDS name/admitted_at/
// admitted_by/valid_from, a `zone: canon` check, a `gate_checks` presence
// check, a `valid_to` presence check). Reuses each notation's own raw
// validator (not the CLI's `validate-notation.ts` dispatch, which discards
// the `path` field these functions already set — see FIXABLE_NOTATIONS
// below) so "which field is missing" comes from the same check that reports
// it, never a second guess at the message text.

import * as path from 'node:path';
import { validateActor } from '@transitrix/diagrams/actor/validate.js';
import { validateChange } from '@transitrix/diagrams/change/validate.js';
import { validateFactor } from '@transitrix/diagrams/factor/validate.js';
import { validateStakeholder } from '@transitrix/diagrams/stakeholder/validate.js';
import { validateTargetState } from '@transitrix/diagrams/target-state/validate.js';
import { validateLocation } from '@transitrix/diagrams/location/validate.js';
import { validateBusinessService } from '@transitrix/diagrams/business-service/validate.js';
import { validateIntegration } from '@transitrix/diagrams/integration/validate.js';
import { validateNode } from '@transitrix/diagrams/node/validate.js';
import { validateTechnologyService } from '@transitrix/diagrams/technology-service/validate.js';
import type { ValidationResult } from '@transitrix/diagrams/validation-types.js';
import type { CanonCatalog } from '@transitrix/diagrams/typed-id.js';
import { gitUserName, collectExistingCanonIds } from './scaffold.js';

type RawValidator = (input: unknown, options?: { catalog?: CanonCatalog }) => ValidationResult;

/** Keyed by the document's `notation:` field value (not always the package
 *  directory name — `driver` ships from `factor/validate.ts`, per the
 *  DGCA-era rename). */
export const FIXABLE_NOTATIONS: Record<string, RawValidator> = {
  actor: validateActor,
  change: validateChange,
  driver: validateFactor,
  stakeholder: validateStakeholder,
  'target-state': validateTargetState,
  location: validateLocation,
  'business-service': validateBusinessService,
  integration: validateIntegration,
  node: validateNode,
  'technology-service': validateTechnologyService,
};

export function isFixableNotation(notation: string): boolean {
  return Object.prototype.hasOwnProperty.call(FIXABLE_NOTATIONS, notation);
}

/** Envelope fields `--fix` can derive a value for on its own. `name` is also
 *  in every validator's REQUIRED_STRING_FIELDS list but is content, not
 *  envelope — `--fix` never invents it. */
const ENVELOPE_SIMPLE_FIELDS = ['zone', 'admitted_at', 'admitted_by', 'valid_from', 'valid_to'] as const;
type EnvelopeSimpleField = (typeof ENVELOPE_SIMPLE_FIELDS)[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface FixFieldResult {
  field: EnvelopeSimpleField | 'gate_checks';
  value: unknown;
}

export interface FixPlan {
  filled: FixFieldResult[];
  unresolved: Array<{ field: string; reason: string }>;
}

export interface ComputeFixPlanOptions {
  /** Adopter repo root containing `canon/` — for the gate_checks.uniqueness
   *  scan and `git config user.name`. */
  root: string;
  /** Resolved absolute path of the file being fixed, excluded from the
   *  uniqueness scan so the file doesn't collide with itself. */
  absFilePath: string;
  /** `--author`, else `git config user.name` (never invented). */
  author?: string;
  /** `--valid-from` — overrides the `valid_from` fill (CONTRACT.md §7, the
   *  date the primitive starts being true). Defaults to today.
   *
   *  `admitted_at` has no counterpart override on purpose: it records when
   *  admission actually happened, so a caller-set value would falsify the
   *  admission record — the same posture that keeps `gate_checks` from ever
   *  being written as a constant `pass`. Callers validate the format before
   *  passing it; an already-present `valid_from` is never touched, override
   *  or not. */
  validFrom?: string;
  /** Repo-wide catalogue, so the catalogue-aware notations (change,
   *  stakeholder, target-state) can actually resolve cross-references when
   *  deciding whether `gate_checks.consistency` truly holds. */
  catalog?: CanonCatalog;
}

/** Computes which missing envelope fields a `--fix` run can fill, and why the
 *  rest can't be. Pure with respect to `data` — the only side effects are the
 *  read-only canon scan (uniqueness) and `git config` (author). */
export function computeFixPlan(
  notation: string,
  data: Record<string, unknown>,
  opts: ComputeFixPlanOptions,
): FixPlan {
  const validator = FIXABLE_NOTATIONS[notation];
  const filled: FixFieldResult[] = [];
  const unresolved: Array<{ field: string; reason: string }> = [];

  const original = validator(data, { catalog: opts.catalog });
  const missingSimple = new Set(
    original.errors
      .filter(
        (e): e is typeof e & { path: EnvelopeSimpleField } =>
          !!e.path &&
          (ENVELOPE_SIMPLE_FIELDS as readonly string[]).includes(e.path) &&
          !(e.path in data),
      )
      .map((e) => e.path),
  );

  const candidate: Record<string, unknown> = { ...data };

  if (missingSimple.has('zone')) {
    candidate.zone = 'canon';
    filled.push({ field: 'zone', value: 'canon' });
  }
  if (missingSimple.has('admitted_at')) {
    const v = todayIso();
    candidate.admitted_at = v;
    filled.push({ field: 'admitted_at', value: v });
  }
  if (missingSimple.has('valid_from')) {
    const v = opts.validFrom ?? todayIso();
    candidate.valid_from = v;
    filled.push({ field: 'valid_from', value: v });
  }
  if (missingSimple.has('valid_to')) {
    candidate.valid_to = null;
    filled.push({ field: 'valid_to', value: null });
  }
  if (missingSimple.has('admitted_by')) {
    const by = opts.author?.trim() || gitUserName(opts.root);
    if (by) {
      candidate.admitted_by = by;
      filled.push({ field: 'admitted_by', value: by });
    } else {
      unresolved.push({
        field: 'admitted_by',
        reason: 'no admitted_by identity available — pass --author "<name>" or set `git config user.name`',
      });
    }
  }

  const gateChecksMissing =
    original.errors.some((e) => e.path === 'gate_checks') && !('gate_checks' in data);
  if (gateChecksMissing) {
    // gate_checks is only filled when it can be filled honestly: the same
    // posture `transitrix new` already takes (scaffold.ts) — this command
    // never writes a `pass` for a check that didn't actually pass. Filling
    // it here means (a) the id doesn't collide elsewhere in canon, and
    // (b) applying every other derivable field above leaves the document
    // with no other unresolved finding — i.e. the fix makes the file fully
    // valid, not just envelope-shaped.
    const recheck = validator(candidate, { catalog: opts.catalog });
    const otherRemaining = recheck.errors.filter((e) => e.path !== 'gate_checks');
    const id = typeof data.id === 'string' ? data.id : undefined;
    const idsElsewhere = collectExistingCanonIds(opts.root, opts.absFilePath);
    const duplicate = id ? idsElsewhere.has(id) : false;

    if (otherRemaining.length === 0 && !duplicate) {
      const gateChecks = { uniqueness: 'pass', consistency: 'pass', completeness: 'pass' };
      candidate.gate_checks = gateChecks;
      filled.push({ field: 'gate_checks', value: gateChecks });
    } else {
      const reasons: string[] = [];
      if (duplicate) {
        reasons.push(`id "${id}" also exists elsewhere in canon — gate_checks.uniqueness would fail`);
      }
      if (otherRemaining.length > 0) {
        reasons.push(
          `${otherRemaining.length} other unresolved finding(s) remain (${otherRemaining
            .map((e) => e.code)
            .join(', ')}) — gate_checks cannot be certified until they're resolved`,
        );
      }
      unresolved.push({ field: 'gate_checks', reason: reasons.join('; ') });
    }
  }

  return { filled, unresolved };
}

function escapeYamlDoubleQuoted(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function renderScalarLine(field: EnvelopeSimpleField, value: unknown): string {
  switch (field) {
    case 'zone':
      return 'zone: canon';
    case 'admitted_at':
    case 'valid_from':
      return `${field}: "${escapeYamlDoubleQuoted(String(value))}"`;
    case 'admitted_by':
      return `admitted_by: "${escapeYamlDoubleQuoted(String(value))}"`;
    case 'valid_to':
      return 'valid_to: null';
  }
}

/** Renders the lines to splice in, grouped and commented the same way
 *  `scaffold.ts` labels a brand-new file's envelope — but only the fields
 *  this plan actually fills, since `--fix` may be completing just one gap. */
function renderInsertionLines(filled: FixFieldResult[]): string[] {
  const byField = new Map(filled.map((f) => [f.field, f.value] as const));
  const admissionFields: EnvelopeSimpleField[] = ['zone', 'admitted_at', 'admitted_by'];
  const lines: string[] = [''];

  const hasAdmission = admissionFields.some((f) => byField.has(f)) || byField.has('gate_checks');
  if (hasAdmission) {
    lines.push('# Admission record (CONTRACT.md §6) — filled by `transitrix validate --fix`');
    for (const field of admissionFields) {
      if (byField.has(field)) lines.push(renderScalarLine(field, byField.get(field)));
    }
    if (byField.has('gate_checks')) {
      const gc = byField.get('gate_checks') as { uniqueness: string; consistency: string; completeness: string };
      lines.push('gate_checks:');
      lines.push(`  uniqueness: ${gc.uniqueness}`);
      lines.push(`  consistency: ${gc.consistency}`);
      lines.push(`  completeness: ${gc.completeness}`);
    }
  }

  const hasLifecycle = byField.has('valid_from') || byField.has('valid_to');
  if (hasLifecycle) {
    if (hasAdmission) lines.push('');
    lines.push('# Primitive lifecycle (CONTRACT.md §7) — filled by `transitrix validate --fix`');
    if (byField.has('valid_from')) lines.push(renderScalarLine('valid_from', byField.get('valid_from')));
    if (byField.has('valid_to')) lines.push(renderScalarLine('valid_to', byField.get('valid_to')));
  }

  return lines;
}

export type ApplyFixResult = { ok: true; text: string } | { ok: false; error: string };

/** Splices the filled fields into `text` immediately after the sole
 *  top-level `id:` line — deterministic, and every notation this module
 *  supports already requires `id` to exist and checks it first. Zero or
 *  more than one match means the document isn't shaped as expected, so this
 *  fails rather than guessing where to insert (per the epic decision). */
export function applyEnvelopeFix(text: string, filled: FixFieldResult[]): ApplyFixResult {
  if (filled.length === 0) return { ok: true, text };

  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r\n|\n/);
  const anchorMatches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^id:\s*\S/.test(lines[i])) anchorMatches.push(i);
  }
  if (anchorMatches.length !== 1) {
    return {
      ok: false,
      error:
        anchorMatches.length === 0
          ? 'cannot find a deterministic anchor to insert at: no top-level "id:" line in this file.'
          : `cannot find a deterministic anchor to insert at: ${anchorMatches.length} top-level "id:" lines found.`,
    };
  }

  const anchorIdx = anchorMatches[0];
  const insertion = renderInsertionLines(filled);
  const newLines = [...lines.slice(0, anchorIdx + 1), ...insertion, ...lines.slice(anchorIdx + 1)];
  return { ok: true, text: newLines.join(eol) };
}

/** Resolves `--root`/cwd to an absolute path — small shared helper so the
 *  CLI and tests agree on what "root" means here. */
export function resolveFixRoot(root: string | undefined): string {
  return path.resolve(root ?? process.cwd());
}
