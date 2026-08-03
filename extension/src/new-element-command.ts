// "Authoring a first element requires only its own content" (epic
// vkgeorgia/strategy#919) — the editor/extension creation path. Mirrors the
// CLI's `transitrix new goal` (`src/scaffold.ts`): the author supplies id +
// name only, the admission record and lifecycle envelope are computed, not
// hand-typed. Reuses the same scaffold functions the CLI calls so the two
// paths cannot drift apart on what "computed" means.
//
// GOAL only for this first cut, matching what `transitrix new` supports on
// `main` today — DRIVER/CONSTRAINT/REQUIREMENT scaffolding exists only on an
// unmerged CLI branch as of this writing.

import * as vscode from 'vscode';
import * as path from 'node:path';
import { scaffoldGoalElement, writeScaffoldedElement, gitUserName } from '../../src/scaffold.js';

export const NEW_GOAL_ELEMENT_COMMAND = 'transitrixStudio.newGoalElement';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function newGoalElementCommand(): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Transitrix: open a repository folder to create a new element.');
    return;
  }
  const root = folder.uri.fsPath;

  const id = await vscode.window.showInputBox({
    title: 'New Goal — id',
    prompt: 'Canonical id (GOAL-[<middle>-]<INTEGER>)',
    placeHolder: 'GOAL-042',
    ignoreFocusOut: true,
  });
  if (!id) return;

  const name = await vscode.window.showInputBox({
    title: 'New Goal — name',
    prompt: 'Human-readable name',
    ignoreFocusOut: true,
  });
  if (!name) return;

  const admittedBy =
    gitUserName(root) ??
    (await vscode.window.showInputBox({
      title: 'New Goal — admitted_by',
      prompt: '`git config user.name` is not set — enter the name to record as admitted_by',
      ignoreFocusOut: true,
    }));
  if (!admittedBy) {
    vscode.window.showErrorMessage(
      'Transitrix: no admitted_by identity available — set `git config user.name` or enter a name.',
    );
    return;
  }

  const outcome = scaffoldGoalElement({
    root,
    id: id.trim(),
    name: name.trim(),
    admittedBy,
    today: todayIso(),
  });

  if (!outcome.ok) {
    vscode.window.showErrorMessage(`Transitrix: cannot scaffold this element:\n${outcome.errors.join('\n')}`);
    return;
  }

  const absPath = writeScaffoldedElement(root, outcome);
  const doc = await vscode.workspace.openTextDocument(absPath);
  await vscode.window.showTextDocument(doc);
  vscode.window.showInformationMessage(
    `Transitrix: wrote ${path.relative(root, absPath).replace(/\\/g, '/')} — filled envelope fields: ${outcome.filled.join(', ')}`,
  );
}
