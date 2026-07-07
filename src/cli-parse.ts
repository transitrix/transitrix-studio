/** CLI argument parsing for `transitrix <input> <output>` (not `serve` subcommand). Pure — no process.exit. */

// NOTE (RD-071): DEFAULT_TRANSITRIX_FILE_EXTENSIONS and normalizeExt are intentionally
// duplicated in extension/src/source-files.ts (as DEFAULT_TRANSITRIX_EXTENSIONS /
// normalizeExtension). The extension bundles its own compiler copy and cannot share
// imports with the CLI package. Keep both lists in sync when adding/removing extensions.
export const DEFAULT_TRANSITRIX_FILE_EXTENSIONS = ['.bpmn.transitrix.yaml'];
/** @deprecated Removed in 2.0.0 — use {@link DEFAULT_TRANSITRIX_FILE_EXTENSIONS}. */
export const DEFAULT_CERVIN_FILE_EXTENSIONS = DEFAULT_TRANSITRIX_FILE_EXTENSIONS;

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

