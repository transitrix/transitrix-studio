import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from '@transitrix/diagrams/compliance';

// Workspace scanner for the compliance views (vkgeorgia/strategy#84). The
// compliance matrix (Phase 2), the single-law / single-product views (Phase 3)
// and the gap dashboard (Phase 4) all need the same repo-wide sweep of the
// canon artefacts. Classification lives in the shared `ingestComplianceDoc`
// (also used by the CLI's `export-compliance` scan), so the recognition rules
// are defined once.

/**
 * The scanned canon plus an id → workspace file path map for click-to-open
 * and an array of files that had both `id` and `notation` fields but weren't
 * recognised as compliance artefacts (unrecognized notation value), with the
 * short workspace-relative path and the actual notation string found.
 */
export type ScannedCanon = ComplianceCanon & {
  pathById: Map<string, string>;
  /** Files skipped due to an unrecognized `notation` value. */
  skippedNotations: Array<{ shortPath: string; notation: string }>;
};

/**
 * Scans the workspace for compliance canon artefacts (products / requirements /
 * assertions by `notation`, codex by `zone: codex`). Unreadable/unparseable
 * files and non-artefacts are skipped. node_modules is excluded.
 *
 * Files that have both `id` and `notation` fields but aren't recognised by
 * `ingestComplianceDoc` are collected in `skippedNotations` so callers can
 * surface a diagnostic with the actual notation value and file path.
 */
export async function scanComplianceCanon(): Promise<ScannedCanon> {
  const canon = emptyCanon();
  const pathById = new Map<string, string>();
  const skippedNotations: Array<{ shortPath: string; notation: string }> = [];

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const uris = await vscode.workspace.findFiles('**/*.{yaml,yml}', '**/node_modules/**', 5000);
  for (const uri of uris) {
    let parsed: unknown;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      parsed = yaml.load(Buffer.from(bytes).toString('utf-8'));
    } catch {
      continue;
    }
    const id = ingestComplianceDoc(canon, parsed);
    if (id) {
      pathById.set(id, uri.fsPath);
    } else if (hasIdAndNotation(parsed)) {
      const notation = (parsed as Record<string, unknown>).notation as string;
      const shortPath = workspaceRoot && uri.fsPath.startsWith(workspaceRoot)
        ? uri.fsPath.slice(workspaceRoot.length).replace(/^[\\/]/, '')
        : uri.fsPath;
      skippedNotations.push({ shortPath, notation });
    }
  }

  return { ...canon, pathById, skippedNotations };
}

// Known Transitrix notation values that are definitively not compliance artefacts.
// Files with these notations have `id` + `notation` but are silently skipped —
// no warning is emitted. The warning is reserved for truly unrecognised values
// (e.g. a typo like "asssertion") that might indicate a miscategorised file.
const SILENT_NOTATIONS = new Set([
  // Element notations
  'activity', 'actor', 'assessment', 'business_object', 'change', 'constraint',
  'driver', 'equipment', 'factor', 'goal', 'registry', 'relation', 'role', 'rule',
  'stakeholder', 'target-state',
  // View / diagram notations
  'activities', 'activity-card', 'applications', 'blocks', 'bpmn',
  'capability-map', 'compliance-impact', 'coverage-metric', 'dga', 'dgca', 'fga', 'fgca',
  'goals', 'issues', 'process-blueprint', 'process-map', 'products', 'scenarios',
]);

/** True when a parsed YAML document looks like a canon artefact candidate
 *  (has `id` + `notation`) but was not recognised by `ingestComplianceDoc`
 *  and is not a known non-compliance Transitrix notation. */
function hasIdAndNotation(doc: unknown): boolean {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return false;
  const d = doc as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.notation !== 'string') return false;
  return !SILENT_NOTATIONS.has(d.notation);
}

/** Opens a canon artefact file beside the active editor — the click-to-open
 *  target shared by every compliance view's command-URI cells/links. */
export async function openComplianceFile(fsPath: string): Promise<void> {
  if (!fsPath) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
}
