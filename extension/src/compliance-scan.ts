import * as vscode from 'vscode';
import yaml from 'js-yaml';
import { emptyCanon, ingestComplianceDoc, type ComplianceCanon } from '../../packages/diagrams/src/compliance/index.js';

// Workspace scanner for the compliance views (vkgeorgia/strategy#84). The
// compliance matrix (Phase 2), the single-law / single-product views (Phase 3)
// and the gap dashboard (Phase 4) all need the same repo-wide sweep of the
// canon artefacts. Classification lives in the shared `ingestComplianceDoc`
// (also used by the CLI's `export-compliance` scan), so the recognition rules
// are defined once.

/** The scanned canon plus an id → workspace file path map for click-to-open. */
export type ScannedCanon = ComplianceCanon & { pathById: Map<string, string> };

/**
 * Scans the workspace for compliance canon artefacts (products / requirements /
 * assertions by `notation`, codex by `zone: codex`). Unreadable/unparseable
 * files and non-artefacts are skipped. node_modules is excluded.
 */
export async function scanComplianceCanon(): Promise<ScannedCanon> {
  const canon = emptyCanon();
  const pathById = new Map<string, string>();

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
    if (id) pathById.set(id, uri.fsPath);
  }

  return { ...canon, pathById };
}

/** Opens a canon artefact file beside the active editor — the click-to-open
 *  target shared by every compliance view's command-URI cells/links. */
export async function openComplianceFile(fsPath: string): Promise<void> {
  if (!fsPath) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
}
