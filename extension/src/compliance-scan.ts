import * as vscode from 'vscode';
import yaml from 'js-yaml';
import type { AssertionStatus } from '../../packages/diagrams/src/assertion/types.js';

// Shared workspace scanner for the compliance views (vkgeorgia/strategy#84).
// The compliance matrix (Phase 2), the single-law / single-product views
// (Phase 3) and the gap dashboard (Phase 4) all need the same repo-wide sweep
// of the canon artefacts, so it lives here once.

export interface ScannedProduct { id: string; name: string; }
export interface ScannedRequirement { id: string; name: string; severity?: string; derived_from?: string[]; }
export interface ScannedAssertion {
  id: string;
  about: string;
  subject: string;
  status: AssertionStatus;
  assessed_at?: string;
  next_review_at?: string;
  evidenceCount: number;
}
export interface ScannedCodex { id: string; name: string; type?: string; jurisdiction?: string; }

export interface ScannedCanon {
  products: ScannedProduct[];
  requirements: ScannedRequirement[];
  assertions: ScannedAssertion[];
  /** Codex source documents (zone: codex) — laws, regulations, policies, standards. */
  codex: ScannedCodex[];
  /** Any artefact id → its workspace file path, for click-to-open. */
  pathById: Map<string, string>;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/**
 * Scans the workspace for the compliance canon artefacts: products,
 * requirements and assertions (identified by their `notation` tag) and codex
 * source documents (identified by `zone: codex`). Unreadable/unparseable files
 * and entries without an `id` are skipped. node_modules is excluded.
 */
export async function scanComplianceCanon(): Promise<ScannedCanon> {
  const products: ScannedProduct[] = [];
  const requirements: ScannedRequirement[] = [];
  const assertions: ScannedAssertion[] = [];
  const codex: ScannedCodex[] = [];
  const pathById = new Map<string, string>();

  const uris = await vscode.workspace.findFiles('**/*.{yaml,yml}', '**/node_modules/**', 5000);
  for (const uri of uris) {
    let doc: Record<string, unknown> | undefined;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const parsed = yaml.load(Buffer.from(bytes).toString('utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) doc = parsed as Record<string, unknown>;
    } catch {
      continue;
    }
    const id = str(doc?.id);
    if (!doc || !id) continue;

    if (doc.notation === 'product') {
      products.push({ id, name: str(doc.name) ?? id });
      pathById.set(id, uri.fsPath);
    } else if (doc.notation === 'requirement') {
      requirements.push({
        id,
        name: str(doc.name) ?? id,
        severity: str(doc.severity),
        derived_from: Array.isArray(doc.derived_from) ? (doc.derived_from as unknown[]).filter((d): d is string => typeof d === 'string') : undefined,
      });
      pathById.set(id, uri.fsPath);
    } else if (doc.notation === 'assertion') {
      const about = str(doc.about);
      const subject = str(doc.subject);
      const status = str(doc.status) as AssertionStatus | undefined;
      if (about && subject && status) {
        assertions.push({
          id, about, subject, status,
          assessed_at: str(doc.assessed_at),
          next_review_at: str(doc.next_review_at),
          evidenceCount: Array.isArray(doc.evidence) ? doc.evidence.length : 0,
        });
        pathById.set(id, uri.fsPath);
      }
    } else if (doc.zone === 'codex') {
      codex.push({ id, name: str(doc.name) ?? id, type: str(doc.type), jurisdiction: str(doc.jurisdiction) });
      pathById.set(id, uri.fsPath);
    }
  }

  return { products, requirements, assertions, codex, pathById };
}

/** Opens a canon artefact file beside the active editor — the click-to-open
 *  target shared by every compliance view's command-URI cells/links. */
export async function openComplianceFile(fsPath: string): Promise<void> {
  if (!fsPath) return;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fsPath));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
}
