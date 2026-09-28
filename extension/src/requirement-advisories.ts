import * as vscode from 'vscode';
import { evaluateLocal, readRequest, recordLocalDecision, renderAdvisories } from '../../src/requirement-advisories/local.js';

/** Uses the same explicit external request, evaluator and audit store as the CLI. */
export async function reviewRequirementAdvisories(): Promise<void> {
  const files = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'Advisory request': ['json'] }, openLabel: 'Review requirement language' });
  if (!files?.length) return;
  try {
    const request = await readRequest(files[0].fsPath);
    let result = await evaluateLocal(request);
    const panel = vscode.window.createWebviewPanel('requirementLanguageAdvisories', 'Requirement language advisories', vscode.ViewColumn.Active, { enableScripts: false });
    panel.webview.html = renderAdvisories(result);
    const action = await vscode.window.showQuickPick(['Keep read-only', 'Dismiss a finding', 'Revoke a dismissal'], { placeHolder: 'Advisory decisions are explicit and apply only to this snapshot and context' });
    if (!action || action === 'Keep read-only') return;
    const findings = action === 'Dismiss a finding' ? result.findings : result.dismissed.map(d => d.finding);
    const choice = await vscode.window.showQuickPick(findings.map(f => ({ label: `${f.requirementId} · ${f.field} · ${f.matchedText}`, description: f.identity, finding: f })));
    if (!choice) return;
    const actor = await vscode.window.showInputBox({ prompt: 'Reviewer identity for the audit record', ignoreFocusOut: true });
    if (!actor?.trim()) return;
    const reason = await vscode.window.showInputBox({ prompt: 'Reason for this explicit decision', ignoreFocusOut: true });
    if (!reason?.trim()) return;
    await recordLocalDecision(request, result, choice.finding.identity, action === 'Dismiss a finding' ? 'dismiss' : 'revoke', actor, reason);
    result = await evaluateLocal(request); panel.webview.html = renderAdvisories(result);
  } catch {
    void vscode.window.showErrorMessage('Requirement advisories could not evaluate this request. Check its schema, explicit file access, Git snapshot and external audit storage.');
  }
}
