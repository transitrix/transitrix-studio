// Authoring a first element should require only its own content — the
// editor/extension creation path. Mirrors the CLI's `transitrix new
// <goal|driver|constraint|requirement>` (`src/scaffold.ts`): the author
// supplies id + name (+ the one per-type required field) only, the
// admission record and lifecycle envelope are computed, not hand-typed.
// Reuses the same scaffold functions the CLI calls so the two paths cannot
// drift apart on what "computed" means.

import * as vscode from 'vscode';
import * as path from 'node:path';
import {
  gitUserName,
  scaffoldConstraintElement,
  scaffoldDriverElement,
  scaffoldGoalElement,
  scaffoldRequirementElement,
  writeScaffoldedElement,
  type ScaffoldOutcome,
} from '../../src/scaffold.js';

export const NEW_GOAL_ELEMENT_COMMAND = 'transitrixStudio.newGoalElement';
export const NEW_DRIVER_ELEMENT_COMMAND = 'transitrixStudio.newDriverElement';
export const NEW_CONSTRAINT_ELEMENT_COMMAND = 'transitrixStudio.newConstraintElement';
export const NEW_REQUIREMENT_ELEMENT_COMMAND = 'transitrixStudio.newRequirementElement';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Resolves the adopter repo root, or reports the error and returns
 *  undefined — the shared precondition every `new <type>` command starts
 *  with. */
function resolveRoot(): string | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    vscode.window.showErrorMessage('Transitrix: open a repository folder to create a new element.');
    return undefined;
  }
  return folder.uri.fsPath;
}

/** Prompts for id, name, and admitted_by — the fields every element type
 *  requires, in the same order and with the same fallback-to-`git config
 *  user.name` behaviour. Returns undefined if the author cancelled or no
 *  admitted_by identity is available. */
async function promptCommonFields(
  root: string,
  label: string,
  idPrompt: string,
  idPlaceholder: string,
): Promise<{ id: string; name: string; admittedBy: string } | undefined> {
  const id = await vscode.window.showInputBox({
    title: `New ${label} — id`,
    prompt: idPrompt,
    placeHolder: idPlaceholder,
    ignoreFocusOut: true,
  });
  if (!id) return undefined;

  const name = await vscode.window.showInputBox({
    title: `New ${label} — name`,
    prompt: 'Human-readable name',
    ignoreFocusOut: true,
  });
  if (!name) return undefined;

  const admittedBy =
    gitUserName(root) ??
    (await vscode.window.showInputBox({
      title: `New ${label} — admitted_by`,
      prompt: '`git config user.name` is not set — enter the name to record as admitted_by',
      ignoreFocusOut: true,
    }));
  if (!admittedBy) {
    vscode.window.showErrorMessage(
      'Transitrix: no admitted_by identity available — set `git config user.name` or enter a name.',
    );
    return undefined;
  }

  return { id: id.trim(), name: name.trim(), admittedBy };
}

/** Writes a successful scaffold outcome and opens it, or reports the
 *  gate-check failures — the shared tail every `new <type>` command ends
 *  with. */
async function finishScaffold(root: string, outcome: ScaffoldOutcome): Promise<void> {
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

export async function newGoalElementCommand(): Promise<void> {
  const root = resolveRoot();
  if (!root) return;

  const common = await promptCommonFields(root, 'Goal', 'Canonical id (GOAL-[<middle>-]<INTEGER>)', 'GOAL-042');
  if (!common) return;

  const outcome = scaffoldGoalElement({ root, ...common, today: todayIso() });
  await finishScaffold(root, outcome);
}

export async function newDriverElementCommand(): Promise<void> {
  const root = resolveRoot();
  if (!root) return;

  const common = await promptCommonFields(root, 'Driver', 'Canonical id (DRIVER-[<middle>-]<INTEGER>)', 'DRIVER-042');
  if (!common) return;

  const outcome = scaffoldDriverElement({ root, ...common, today: todayIso() });
  await finishScaffold(root, outcome);
}

export async function newConstraintElementCommand(): Promise<void> {
  const root = resolveRoot();
  if (!root) return;

  const common = await promptCommonFields(
    root,
    'Constraint',
    'Canonical id (CONSTRAINT-[<middle>-]<INTEGER>)',
    'CONSTRAINT-042',
  );
  if (!common) return;

  const statement = await vscode.window.showInputBox({
    title: 'New Constraint — statement',
    prompt: 'The normative restriction sentence',
    ignoreFocusOut: true,
  });
  if (!statement) return;

  const outcome = scaffoldConstraintElement({ root, ...common, today: todayIso(), statement: statement.trim() });
  await finishScaffold(root, outcome);
}

export async function newRequirementElementCommand(): Promise<void> {
  const root = resolveRoot();
  if (!root) return;

  const common = await promptCommonFields(
    root,
    'Requirement',
    'Canonical id (REQUIREMENT-[<middle>-]<INTEGER>)',
    'REQUIREMENT-042',
  );
  if (!common) return;

  const description = await vscode.window.showInputBox({
    title: 'New Requirement — description',
    prompt: 'The obligation, its scope, and its conditions',
    ignoreFocusOut: true,
  });
  if (!description) return;

  const outcome = scaffoldRequirementElement({ root, ...common, today: todayIso(), description: description.trim() });
  await finishScaffold(root, outcome);
}
