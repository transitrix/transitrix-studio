import * as path from 'node:path';
import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from '@transitrix/diagrams/compliance';
import { findCanonRootPath } from './canon-loader.js';

// Workspace scanner for the compliance views. The
// compliance matrix (Phase 2), the single-law / single-product views (Phase 3)
// and the gap dashboard (Phase 4) all need the same sweep of canon artefacts
// the CLI uses (`canon/` + sibling `codex/`). Classification lives in the
// shared `ingestComplianceDoc`, so the recognition rules are defined once.

/**
 * The scanned canon plus an id → workspace file path map for click-to-open
 * and skip diagnostics. Unrecognized-notation skips are files that had both
 * `id` and `notation` but matched neither a compliance artefact nor a known
 * non-compliance Transitrix notation. Duplicate ids are a separate list —
 * `ingestComplianceDoc` returns null for those too, and mislabeling them as
 * unrecognized hid the real defect.
 */
export type ScannedCanon = ComplianceCanon & {
  pathById: Map<string, string>;
  /** Files skipped due to an unrecognized `notation` value. */
  skippedNotations: Array<{ shortPath: string; notation: string }>;
  /** Files skipped because their id was already ingested into the same bucket. */
  skippedDuplicates: Array<{ shortPath: string; id: string }>;
};

export const WORKSPACE_COMPLIANCE_INCLUDE = '**/{canon,codex}/**/*.{yaml,yml}';
export const WORKSPACE_COMPLIANCE_EXCLUDE =
  '{**/node_modules/**,**/.archive/**,**/packages/**,**/tests/fixtures/**}';

export type ComplianceScanScope =
  | { kind: 'scoped'; roots: string[] }
  | { kind: 'workspace' };

/**
 * Anchor the scan on the nearest `canon/` ancestor of `fromFilePath` (and its
 * sibling `codex/`), matching `loadComplianceYamlDocs` in the CLI. Files with
 * no such ancestor fall back to a workspace-wide `canon/` + `codex/` glob.
 */
export function resolveComplianceScanScope(fromFilePath?: string): ComplianceScanScope {
  if (!fromFilePath) return { kind: 'workspace' };
  const canonDir = findCanonRootPath(fromFilePath);
  if (!canonDir) return { kind: 'workspace' };
  return {
    kind: 'scoped',
    roots: [canonDir, path.join(path.dirname(canonDir), 'codex')],
  };
}

export type ScanMissKind = 'duplicate' | 'unrecognized';

/**
 * Why `ingestComplianceDoc` returned null. Duplicates win over notation
 * classification: the same id in two files is not an unknown notation.
 * Known non-compliance notations and incomplete compliance artefacts are
 * silent — the warning is reserved for a typo like `asssertion`.
 */
export function classifyScanMiss(parsed: unknown, duplicateGrew: boolean): ScanMissKind | undefined {
  if (duplicateGrew) return 'duplicate';
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const d = parsed as Record<string, unknown>;
  if (typeof d.id !== 'string' || typeof d.notation !== 'string') return undefined;
  if (COMPLIANCE_NOTATIONS.has(d.notation) || SILENT_NOTATIONS.has(d.notation)) return undefined;
  return 'unrecognized';
}

/**
 * Workspace-relative display path. Uses `path.relative` so a sibling whose
 * name only shares a prefix with the root (e.g. `repo-copy` vs `repo`) is
 * not treated as nested. Cross-drive and parent-traversal paths stay absolute.
 * On Windows, `path.relative` compares case-insensitively.
 */
export function shortWorkspacePath(fsPath: string, workspaceRoot?: string): string {
  if (!workspaceRoot) return fsPath;
  const rel = path.relative(path.resolve(workspaceRoot), path.resolve(fsPath));
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return fsPath;
  return rel;
}

export function complianceScanWarnings(scan: ScannedCanon): string[] {
  return [
    ...(scan.skippedDuplicates ?? []).map(s => `Skipped — duplicate id "${s.id}": ${s.shortPath}`),
    ...(scan.skippedNotations ?? []).map(s => `Skipped — unrecognized notation "${s.notation}": ${s.shortPath}`),
  ];
}

/**
 * Scans `canon/` + `codex/` for compliance artefacts. When `fromFile` sits
 * under a `canon/` tree, only that tree and its sibling `codex/` are read.
 * Callers that omit `fromFile` always get a workspace-wide scan — the active
 * editor is not consulted. Unreadable/unparseable files and non-artefacts
 * are skipped.
 */
export async function scanComplianceCanon(fromFile?: vscode.Uri): Promise<ScannedCanon> {
  const canon = emptyCanon();
  const pathById = new Map<string, string>();
  const skippedNotations: Array<{ shortPath: string; notation: string }> = [];
  const skippedDuplicates: Array<{ shortPath: string; id: string }> = [];

  const fromPath = fromFile?.fsPath;
  const uris = await collectScanUris(resolveComplianceScanScope(fromPath));

  for (const uri of uris) {
    let parsed: unknown;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      parsed = yaml.load(Buffer.from(bytes).toString('utf-8'));
    } catch {
      continue;
    }
    const dupBefore = canon.duplicateIds.length;
    const id = ingestComplianceDoc(canon, parsed);
    const folderRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
    const shortPath = shortWorkspacePath(uri.fsPath, folderRoot);
    if (id) {
      pathById.set(id, uri.fsPath);
      continue;
    }
    const miss = classifyScanMiss(parsed, canon.duplicateIds.length > dupBefore);
    if (miss === 'duplicate') {
      const dupId =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed) && typeof (parsed as { id?: unknown }).id === 'string'
          ? (parsed as { id: string }).id
          : canon.duplicateIds[canon.duplicateIds.length - 1];
      skippedDuplicates.push({ shortPath, id: dupId });
    } else if (miss === 'unrecognized') {
      skippedNotations.push({
        shortPath,
        notation: (parsed as Record<string, unknown>).notation as string,
      });
    }
  }

  return { ...canon, pathById, skippedNotations, skippedDuplicates };
}

async function collectScanUris(scope: ComplianceScanScope): Promise<vscode.Uri[]> {
  if (scope.kind === 'scoped') {
    const out: vscode.Uri[] = [];
    for (const root of scope.roots) {
      const found = await vscode.workspace.findFiles(
        new vscode.RelativePattern(vscode.Uri.file(root), '**/*.{yaml,yml}'),
        undefined,
        5000,
      );
      out.push(...found);
    }
    return out;
  }
  return vscode.workspace.findFiles(WORKSPACE_COMPLIANCE_INCLUDE, WORKSPACE_COMPLIANCE_EXCLUDE, 5000);
}

// Notations `ingestComplianceDoc` actually classifies. Incomplete documents of
// these types are silent (missing fields, not a typo). `constraint` is here so
// a typo like `constrain` still warns.
const COMPLIANCE_NOTATIONS = new Set([
  'product', 'requirement', 'constraint', 'assertion', 'verification',
  'need', 'validation', 'capability', 'process', 'application', 'system',
]);

// Known Transitrix notation values that are definitively not compliance artefacts.
// Files with these notations have `id` + `notation` but are silently skipped —
// no warning is emitted. The warning is reserved for truly unrecognised values
// (e.g. a typo like "asssertion") that might indicate a miscategorised file.
const SILENT_NOTATIONS = new Set([
  // Element notations
  'activity', 'actor', 'amendment', 'assessment', 'business-object', 'business_object',
  'business-service', 'business_service', 'change', 'driver', 'equipment', 'factor',
  'goal', 'integration', 'location', 'metric', 'milestone', 'node', 'registry',
  'relation', 'release', 'risk', 'role', 'rule', 'scenario', 'segment',
  'stakeholder', 'step', 'target-state', 'target_state', 'technology-service',
  'technology_service', 'term',
  // View / diagram / document notations
  'action', 'action-card', 'activities', 'applications', 'blocks', 'bpmn',
  'capability-map', 'compliance-impact', 'coverage-metric', 'dga', 'dgca',
  'fga', 'fgca', 'glossary', 'goals', 'integration-map', 'issues', 'mrd',
  'process-blueprint', 'process-map', 'products', 'rules-in-force',
  'scenarios', 'sdd', 'srs',
]);

/** Opens a canon artefact file beside the active editor — the click-to-open
 *  target shared by every compliance view's command-URI cells/links. */
export async function openComplianceFile(fsPath: string): Promise<void> {
  if (!fsPath) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
}
