// `transitrix new goal` — hub epic #919 ("Authoring a first element requires
// only its own content — the envelope is supplied"), first cut. Scaffolds a
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
 *  neighbour file must not block scaffolding a new one. */
export function collectExistingCanonIds(root: string): Set<string> {
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
      try {
        const data = yaml.load(readFileSync(path.join(root, 'canon', zone, rel), 'utf-8'));
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
  /** ISO 8601 date (CONTRACT.md §4) used for `admitted_at` and `valid_from`.
   *  Caller-supplied rather than computed here so the function stays pure
   *  and testable without mocking the clock. */
  today: string;
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
  lines.push(`valid_from: "${opts.today}"`);
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

// ── CLI wiring: `transitrix new goal` ───────────────────────────────────────

export interface NewGoalArgs {
  type: 'goal' | undefined;
  id: string | undefined;
  name: string | undefined;
  author: string | undefined;
  root: string;
  goalType: string | undefined;
  level: number | undefined;
  parent: string | undefined;
  factors: string[] | undefined;
  description: string | undefined;
  link: string | undefined;
  dryRun: boolean;
  wantsHelp: boolean;
}

export function parseNewArgv(argv: string[]): NewGoalArgs {
  const type = argv[0] === 'goal' ? 'goal' : undefined;
  const rest = type ? argv.slice(1) : argv;

  const args: NewGoalArgs = {
    type,
    id: undefined,
    name: undefined,
    author: undefined,
    root: process.cwd(),
    goalType: undefined,
    level: undefined,
    parent: undefined,
    factors: undefined,
    description: undefined,
    link: undefined,
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
    if (a === '--root') { args.root = rest[++i]; continue; }
    if (a.startsWith('--root=')) { args.root = a.slice('--root='.length); continue; }
    if (a === '--type') { args.goalType = rest[++i]; continue; }
    if (a.startsWith('--type=')) { args.goalType = a.slice('--type='.length); continue; }
    if (a === '--level') { args.level = Number(rest[++i]); continue; }
    if (a.startsWith('--level=')) { args.level = Number(a.slice('--level='.length)); continue; }
    if (a === '--parent') { args.parent = rest[++i]; continue; }
    if (a.startsWith('--parent=')) { args.parent = a.slice('--parent='.length); continue; }
    if (a === '--factors') { args.factors = rest[++i]?.split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a.startsWith('--factors=')) { args.factors = a.slice('--factors='.length).split(',').map((s) => s.trim()).filter(Boolean); continue; }
    if (a === '--description') { args.description = rest[++i]; continue; }
    if (a.startsWith('--description=')) { args.description = a.slice('--description='.length); continue; }
    if (a === '--link') { args.link = rest[++i]; continue; }
    if (a.startsWith('--link=')) { args.link = a.slice('--link='.length); continue; }
  }

  return args;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleNewCommand(argv: string[]): Promise<void> {
  const args = parseNewArgv(argv);

  if (args.wantsHelp || !args.type) {
    console.error('usage: transitrix new goal --id <GOAL-…> --name "<label>" [options]');
    console.error('');
    console.error('  Scaffolds a standalone GOAL element (canon/elements/01_motivation/goals/)');
    console.error('  with the admission record and lifecycle envelope computed, not hand-typed');
    console.error('  (hub epic #919).');
    console.error('');
    console.error('  --id <GOAL-…>        Required — canonical id (GOAL-[<middle>-]<INTEGER>).');
    console.error('  --name "<label>"     Required — human-readable name.');
    console.error('  --author "<name>"    Recorded as admitted_by. Default: `git config user.name`.');
    console.error('  --root <dir>         Adopter repo root containing canon/ (default: cwd).');
    console.error('  --type "<label>"     Goal-type label (e.g. "Strategic Goal").');
    console.error('  --level <n>          Hierarchical level.');
    console.error('  --parent <GOAL-…>    Parent goal id.');
    console.error('  --factors <a,b>      Comma-separated DRIVER-… ids; each must already exist in canon.');
    console.error('  --description "…"    One-paragraph elaboration.');
    console.error('  --link <url>         Supplementary documentation URL.');
    console.error('  --dry-run            Print what would be written; do not write the file.');
    process.exit(args.wantsHelp ? 0 : 1);
  }

  if (!args.id || !args.name) {
    console.error('transitrix new goal: --id and --name are required.');
    process.exit(1);
  }

  const root = path.resolve(args.root);
  const admittedBy = args.author ?? gitUserName(root);
  if (!admittedBy) {
    console.error('transitrix new goal: no admitted_by identity available.');
    console.error('  Pass --author "<name>" or set `git config user.name`.');
    process.exit(1);
  }

  const outcome = scaffoldGoalElement({
    root,
    id: args.id,
    name: args.name,
    admittedBy,
    today: todayIso(),
    type: args.goalType,
    level: args.level,
    parent: args.parent,
    factors: args.factors,
    description: args.description,
    link: args.link,
  });

  if (!outcome.ok) {
    console.error('transitrix new goal: cannot scaffold this element:');
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
