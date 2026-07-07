import * as vscode from 'vscode';

// NOTE (RD-071): DEFAULT_TRANSITRIX_EXTENSIONS and normalizeExtension are intentionally
// duplicated in src/cli-parse.ts (as DEFAULT_TRANSITRIX_FILE_EXTENSIONS / normalizeExt).
// The extension bundles its own compiler copy and cannot share imports with the CLI
// package. Keep both lists in sync when adding/removing extensions.
export const DEFAULT_TRANSITRIX_EXTENSIONS = ['.bpmn.transitrix.yaml'];

export function normalizeExtension(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.startsWith('.') ? t : `.${t}`;
}

export function getConfiguredExtensions(): string[] {
  const raw = vscode.workspace.getConfiguration('transitrix').get<unknown>('fileExtensions');
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_TRANSITRIX_EXTENSIONS];
  }
  return raw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(normalizeExtension);
}

export function documentMatchesTransitrixSource(doc: vscode.TextDocument): boolean {
  const exts = getConfiguredExtensions();
  const fn = doc.fileName.replace(/\\/g, '/').toLowerCase();
  return exts.some((ext) => fn.endsWith(ext.toLowerCase()));
}

export function formatExtensionHint(exts: string[]): string {
  return exts.map((e) => `*${e}`).join(', ');
}
