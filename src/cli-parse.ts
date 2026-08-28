/** CLI argument parsing for `transitrix <input> <output>` (not `serve` subcommand). Pure — no process.exit. */

// NOTE (RD-071): DEFAULT_TRANSITRIX_FILE_EXTENSIONS and normalizeExt are intentionally
// duplicated in extension/src/source-files.ts (as DEFAULT_TRANSITRIX_EXTENSIONS /
// normalizeExtension). The extension bundles its own compiler copy and cannot share
// imports with the CLI package. Keep both lists in sync when adding/removing extensions.
export const DEFAULT_TRANSITRIX_FILE_EXTENSIONS = ['.bpmn.transitrix.yaml'];

export function normalizeExt(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.startsWith('.') ? t : `.${t}`;
}

/** CONTRACT.md §4 — every date-typed field is a quoted `YYYY-MM-DD` string.
 *  A caller-supplied date is checked against this before it can reach a
 *  written file: an unparseable override is a hard failure, never a silent
 *  fall back to today, which would record a lifecycle date nobody asked for.
 *  The shape alone would accept `2026-02-31`, so the round-trip through `Date`
 *  is what rejects a well-formed non-day. */
export function isIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export type ParseCliFileArgvResult =
  | { ok: true; positional: string[]; extList: string[]; wantsHelp: boolean }
  | { ok: false; error: '--ext_requires_value' };

export type BpmnCompileProfileFlag = 'default' | 'presentation';

export type ParseCompileArgvResult =
  | {
      ok: true;
      positional: string[];
      extList: string[];
      wantsHelp: boolean;
      profile: BpmnCompileProfileFlag;
      noMetrics: boolean;
      noValidate: boolean;
    }
  | { ok: false; error: '--ext_requires_value' | '--profile_requires_value' | 'bad_profile' };

/**
 * Compile argv: known flags (`--profile`, `--no-metrics`, `--no-validate`)
 * are stripped so they cannot be mistaken for the input/output paths.
 */
export function parseCompileArgv(argv: string[]): ParseCompileArgvResult {
  const rest: string[] = [];
  let profile: BpmnCompileProfileFlag = 'default';
  let noMetrics = false;
  let noValidate = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-metrics') {
      noMetrics = true;
      continue;
    }
    if (a === '--no-validate') {
      noValidate = true;
      continue;
    }
    if (a === '--profile') {
      const raw = argv[++i];
      if (!raw) return { ok: false, error: '--profile_requires_value' };
      if (raw !== 'default' && raw !== 'presentation') return { ok: false, error: 'bad_profile' };
      profile = raw;
      continue;
    }
    if (a.startsWith('--profile=')) {
      const raw = a.slice('--profile='.length);
      if (raw !== 'default' && raw !== 'presentation') return { ok: false, error: 'bad_profile' };
      profile = raw;
      continue;
    }
    rest.push(a);
  }

  const parsed = parseCliFileArgv(rest);
  if (!parsed.ok) return parsed;
  return { ...parsed, profile, noMetrics, noValidate };
}

export function parseCliFileArgv(argv: string[]): ParseCliFileArgvResult {
  const positional: string[] = [];
  const extList: string[] = [];
  let wantsHelp = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      wantsHelp = true;
      continue;
    }
    if (a === '--ext') {
      const raw = argv[++i];
      if (!raw) {
        return { ok: false, error: '--ext_requires_value' };
      }
      raw
        .split(',')
        .map((x) => normalizeExt(x))
        .filter(Boolean)
        .forEach((x) => extList.push(x));
      continue;
    }
    if (a.startsWith('--ext=')) {
      const raw = a.slice('--ext='.length);
      raw
        .split(',')
        .map((x) => normalizeExt(x))
        .filter(Boolean)
        .forEach((x) => extList.push(x));
      continue;
    }
    positional.push(a);
  }

  return { ok: true, positional, extList, wantsHelp };
}

export type ValidateScope = 'file' | 'repo';

export type ParseValidateArgvResult =
  | {
      ok: true;
      scope: ValidateScope;
      root: string | undefined;
      template: string | undefined;
      fix: boolean;
      author: string | undefined;
      validFrom: string | undefined;
      dryRun: boolean;
      strict: boolean;
      positional: string[];
      extList: string[];
      wantsHelp: boolean;
    }
  | {
      ok: false;
      error:
        | '--ext_requires_value'
        | '--scope_requires_value'
        | '--root_requires_value'
        | '--template_requires_value'
        | '--author_requires_value'
        | '--valid-from_requires_value'
        | 'bad_valid_from'
        | 'bad_scope';
      scope?: ValidateScope;
    };

/**
 * Parse `validate` argv (#141). Recognises `--scope=file|repo` (and the spaced
 * `--scope repo` form), `--root <dir>` for repo-scope, `--template <name>`
 * (matrix-subset `blocks` documents, §6a — e.g. `raci`) for file scope, and
 * `--fix` (file scope only — completes missing envelope fields; `--author`
 * overrides `git config user.name` for `admitted_by`, `--valid-from`
 * overrides today for `valid_from`, `--dry-run` previews without writing);
 * everything else is delegated to {@link parseCliFileArgv}.
 * Default scope is `file`, preserving the existing per-file
 * `validate <input.yaml>` behaviour.
 */
export function parseValidateArgv(argv: string[]): ParseValidateArgvResult {
  let scope: ValidateScope = 'file';
  let root: string | undefined;
  let template: string | undefined;
  let fix = false;
  let author: string | undefined;
  let validFrom: string | undefined;
  let dryRun = false;
  let strict = false;
  const rest: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--scope_requires_value' };
      if (v !== 'file' && v !== 'repo') return { ok: false, error: 'bad_scope' };
      scope = v;
      continue;
    }
    if (a.startsWith('--scope=')) {
      const v = a.slice('--scope='.length);
      if (v !== 'file' && v !== 'repo') return { ok: false, error: 'bad_scope' };
      scope = v;
      continue;
    }
    if (a === '--root') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--root_requires_value' };
      root = v;
      continue;
    }
    if (a.startsWith('--root=')) {
      root = a.slice('--root='.length);
      continue;
    }
    if (a === '--template') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--template_requires_value' };
      template = v;
      continue;
    }
    if (a.startsWith('--template=')) {
      template = a.slice('--template='.length);
      continue;
    }
    if (a === '--fix') {
      fix = true;
      continue;
    }
    if (a === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (a === '--strict') {
      strict = true;
      continue;
    }
    if (a === '--author') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--author_requires_value' };
      author = v;
      continue;
    }
    if (a.startsWith('--author=')) {
      author = a.slice('--author='.length);
      continue;
    }
    if (a === '--valid-from') {
      const v = argv[++i];
      if (v === undefined) return { ok: false, error: '--valid-from_requires_value' };
      if (!isIsoDate(v)) return { ok: false, error: 'bad_valid_from' };
      validFrom = v;
      continue;
    }
    if (a.startsWith('--valid-from=')) {
      const v = a.slice('--valid-from='.length);
      if (!isIsoDate(v)) return { ok: false, error: 'bad_valid_from' };
      validFrom = v;
      continue;
    }
    rest.push(a);
  }

  const parsed = parseCliFileArgv(rest);
  if (!parsed.ok) return { ok: false, error: '--ext_requires_value', scope };

  return {
    ok: true,
    scope,
    root,
    template,
    fix,
    author,
    validFrom,
    dryRun,
    strict,
    positional: parsed.positional,
    extList: parsed.extList,
    wantsHelp: parsed.wantsHelp,
  };
}

export function inputMatchesExtension(filePath: string, exts: string[]): boolean {
  const lowered = filePath.replace(/\\/g, '/').toLowerCase();
  return exts.some((e) => lowered.endsWith(e.toLowerCase()));
}

