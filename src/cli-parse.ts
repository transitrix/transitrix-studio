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

export function inputMatchesExtension(filePath: string, exts: string[]): boolean {
  const lowered = filePath.replace(/\\/g, '/').toLowerCase();
  return exts.some((e) => lowered.endsWith(e.toLowerCase()));
}
