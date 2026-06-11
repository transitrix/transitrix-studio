/** CLI argument parsing for `cervin <input> <output>` (not `serve` subcommand). Pure — no process.exit. */

// NOTE (RD-071): DEFAULT_CERVIN_FILE_EXTENSIONS and normalizeExt are intentionally
// duplicated in extension/src/source-files.ts (as DEFAULT_CERVIN_EXTENSIONS /
// normalizeExtension). The extension bundles its own compiler copy and cannot share
// imports with the CLI package. Keep both lists in sync when adding/removing extensions.
export const DEFAULT_CERVIN_FILE_EXTENSIONS = ['.cervin.yaml', '.bpmn.transitrix.yaml'];

export function normalizeExt(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.startsWith('.') ? t : `.${t}`;
}

export type ParseCliFileArgvResult =
  | { ok: true; positional: string[]; extList: string[]; wantsHelp: boolean }
  | { ok: false; error: '--ext_requires_value' };

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
      positional: string[];
      extList: string[];
      wantsHelp: boolean;
    }
  | { ok: false; error: '--ext_requires_value' | '--scope_requires_value' | '--root_requires_value' | 'bad_scope'; scope?: ValidateScope };

/**
 * Parse `validate` argv (#141). Recognises `--scope=file|repo` (and the spaced
 * `--scope repo` form) and `--root <dir>` for repo-scope; everything else is
 * delegated to {@link parseCliFileArgv}. Default scope is `file`, preserving the
 * existing per-file `validate <input.yaml>` behaviour.
 */
export function parseValidateArgv(argv: string[]): ParseValidateArgvResult {
  let scope: ValidateScope = 'file';
  let root: string | undefined;
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
    rest.push(a);
  }

  const parsed = parseCliFileArgv(rest);
  if (!parsed.ok) return { ok: false, error: '--ext_requires_value', scope };

  return {
    ok: true,
    scope,
    root,
    positional: parsed.positional,
    extList: parsed.extList,
    wantsHelp: parsed.wantsHelp,
  };
}

export function inputMatchesExtension(filePath: string, exts: string[]): boolean {
  const lowered = filePath.replace(/\\/g, '/').toLowerCase();
  return exts.some((e) => lowered.endsWith(e.toLowerCase()));
}

/**
 * Cervin → Transitrix deprecation (CLAUDE.md §Cervin naming, P1). The `cervin`
 * binary is a kept-for-compatibility alias of `transitrix`; both bin entries
 * resolve to the same `dist/cli.js`. We surface a one-line deprecation notice
 * when the tool was launched under the legacy name.
 *
 * Detection is best-effort from the invocation path (argv[1]): on POSIX, npm
 * installs the bin as a symlink whose basename is the alias the user typed
 * (`.../bin/cervin`), so this fires. On Windows the `.cmd` shim invokes node
 * with the resolved `cli.js` path, so the legacy name is not observable there
 * and no notice is shown — acceptable graceful degradation for a hint.
 */
export const CERVIN_DEPRECATION_NOTICE =
  'cervin: the `cervin` command is deprecated and will be removed in 2.0.0 — use `transitrix` instead.';

export function invokedAsCervin(argv1: string | undefined): boolean {
  if (!argv1) return false;
  const base = argv1.replace(/\\/g, '/').split('/').pop() ?? '';
  // Strip a trailing extension (.js, .cmd, .exe) before matching the stem.
  const stem = base.replace(/\.[^.]+$/, '').toLowerCase();
  return stem === 'cervin';
}
