import * as vscode from 'vscode';

import {
  CERVIN_SETTINGS_DEPRECATION_NOTICE,
  resolveCervinFallback,
} from './settings-migration.js';

// NOTE (RD-071): DEFAULT_CERVIN_EXTENSIONS and normalizeExtension are intentionally
// duplicated in src/cli-parse.ts (as DEFAULT_CERVIN_FILE_EXTENSIONS / normalizeExt).
// The extension bundles its own compiler copy and cannot share imports with the CLI
// package. Keep both lists in sync when adding/removing extensions.
export const DEFAULT_CERVIN_EXTENSIONS = ['.cervin.yaml', '.bpmn.transitrix.yaml'];

// Settings keys subject to the cervin.* → transitrix.* migration (P2).
const MIGRATED_SETTING_KEYS = ['fileExtensions', 'exportEnabled'];

let cervinSettingsNoticeShown = false;

/**
 * Surface the cervin.* → transitrix.* settings deprecation exactly once per
 * session — both to the extension console and as a single warning toast.
 */
export function noteCervinSettingsDeprecation(): void {
  if (cervinSettingsNoticeShown) return;
  cervinSettingsNoticeShown = true;
  console.warn(CERVIN_SETTINGS_DEPRECATION_NOTICE);
  void vscode.window.showWarningMessage(CERVIN_SETTINGS_DEPRECATION_NOTICE);
}

function userHasSet(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = cfg.inspect(key);
  return (
    inspected?.globalValue !== undefined ||
    inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined
  );
}

/**
 * On activate (P2): if any migrated setting is configured only under the legacy
 * `cervin.*` key while its `transitrix.*` counterpart is unset, the legacy value
 * is the one taking effect — warn once so users migrate before 2.0.0.
 */
export function checkCervinSettingsMigration(): void {
  const transitrixCfg = vscode.workspace.getConfiguration('transitrix');
  const cervinCfg = vscode.workspace.getConfiguration('cervin');
  const usingLegacy = MIGRATED_SETTING_KEYS.some(
    (key) => userHasSet(cervinCfg, key) && !userHasSet(transitrixCfg, key),
  );
  if (usingLegacy) {
    noteCervinSettingsDeprecation();
  }
}

export function normalizeExtension(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t.startsWith('.') ? t : `.${t}`;
}

export function getConfiguredExtensions(): string[] {
  const transitrixRaw = vscode.workspace
    .getConfiguration('transitrix')
    .get<unknown>('fileExtensions');
  const cervinRaw = vscode.workspace.getConfiguration('cervin').get<unknown>('fileExtensions');

  // Prefer transitrix.fileExtensions; fall back to the legacy cervin.* value.
  const resolved = resolveCervinFallback<unknown>(
    transitrixRaw,
    cervinRaw,
    (v) => !Array.isArray(v) || v.length === 0,
  );
  if (resolved.usedCervinFallback) {
    noteCervinSettingsDeprecation();
  }

  const raw = resolved.value;
  if (!Array.isArray(raw) || raw.length === 0) {
    return [...DEFAULT_CERVIN_EXTENSIONS];
  }
  return raw
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map(normalizeExtension);
}

export function documentMatchesCervinSource(doc: vscode.TextDocument): boolean {
  const exts = getConfiguredExtensions();
  const fn = doc.fileName.replace(/\\/g, '/').toLowerCase();
  return exts.some((ext) => fn.endsWith(ext.toLowerCase()));
}

export function formatExtensionHint(exts: string[]): string {
  return exts.map((e) => `*${e}`).join(', ');
}
