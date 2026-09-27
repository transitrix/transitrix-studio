import * as vscode from 'vscode';
import { fileEvidenceAdapter, type EvidenceFiles } from '../../src/document-provenance.js';
import { documentProvenanceView } from './document-provenance-render.js';

export const CHECK_DOCUMENT_COMMAND = 'transitrix.checkDocumentProvenance';

export async function checkDocumentProvenanceCommand(): Promise<void> {
  const files: EvidenceFiles = {};
  // Dialog selections are the authorization boundary. No evidence is loaded
  // until the user has selected the complete bundle; cancellation reads nothing.
  for (const [key, title] of [
    ['run', 'Select retained run record'],
    ['recipe', 'Select retained document recipe'],
    ['output', 'Select issued output artifact'],
  ] as const) {
    const selected = await vscode.window.showOpenDialog({ title, canSelectMany: false, canSelectFolders: false });
    if (!selected?.[0]) return;
    if (selected[0].scheme !== 'file') {
      vscode.window.showWarningMessage('Document evidence is unavailable. Select local evidence files.');
      return;
    }
    files[key] = selected[0].fsPath;
  }
  const claims = await vscode.window.showQuickPick(['Check selected evidence', 'Add recorded claims JSON'], {
    title: 'Document provenance', placeHolder: 'Claims are assertions, not independently observed facts',
  });
  if (!claims) return;
  if (claims === 'Add recorded claims JSON') {
    const selected = await vscode.window.showOpenDialog({ title: 'Select recorded claims', canSelectMany: false, canSelectFolders: false });
    if (!selected?.[0]) return;
    if (selected[0].scheme !== 'file') return;
    files.claims = selected[0].fsPath;
  }
  const { bodyContent } = await documentProvenanceView(fileEvidenceAdapter(files, () => vscode.workspace.isTrusted));
  const panel = vscode.window.createWebviewPanel('documentProvenance', 'Document provenance', vscode.ViewColumn.Beside, {
    enableScripts: false, localResourceRoots: [],
  });
  panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); padding: 1rem; }
    article { border-top: 1px solid var(--vscode-panel-border); margin-top: 1rem; }
    dt { font-weight: bold; } dd { margin: .25rem 0 1rem; white-space: pre-wrap; overflow-wrap: anywhere; }
  </style></head><body>${bodyContent}</body></html>`;
}
