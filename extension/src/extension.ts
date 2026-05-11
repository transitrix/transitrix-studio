import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

import type { CompileFn } from './preview.js';
import { CervinPreview } from './preview.js';
import { GoalsPreview } from './goals-preview.js';
import { FGCAPreview, FGAPreview } from './fgca-preview.js';
import type { LayoutMetrics, ValidationReport } from './types.js';
import {
  documentMatchesCervinSource,
  formatExtensionHint,
  getConfiguredExtensions,
} from './source-files.js';

function isGoalsFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.goals.transitrix.yaml');
}

function isFGCAFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.fgca.transitrix.yaml');
}

function isFGAFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.fga.transitrix.yaml');
}

async function loadCompiler(ext: vscode.ExtensionContext): Promise<CompileFn> {
  const compilerPath = path.join(ext.extensionPath, 'compiler', 'compiler.js');
  const metricsPath = path.join(ext.extensionPath, 'compiler', 'metrics.js');
  const compilerHref = pathToFileURL(compilerPath).href;
  const metricsHref = pathToFileURL(metricsPath).href;

  const compilerMod = (await import(compilerHref)) as {
    compileCervinYamlWithLayout: (yaml: string, options?: unknown) => Promise<{ xml: string; layout: unknown; validation: ValidationReport }>;
  };
  const metricsMod = (await import(metricsHref)) as {
    computeLayoutMetrics: (layout: unknown) => LayoutMetrics;
  };

  return async (yaml: string): Promise<{ xml: string; metrics: LayoutMetrics; validation: ValidationReport }> => {
    const result = await compilerMod.compileCervinYamlWithLayout(yaml);
    const metrics = metricsMod.computeLayoutMetrics(result.layout);
    return { xml: result.xml, metrics, validation: result.validation };
  };
}

function notYet(label: string): void {
  void vscode.window.showInformationMessage(
    `${label}: not implemented yet — export phase on the Cervin roadmap.`,
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let compileFn: CompileFn | undefined;

  async function compiler(): Promise<CompileFn> {
    if (!compileFn) {
      try {
        compileFn = await loadCompiler(context);
      } catch {
        throw new Error(
          "Cervin: compiler bundle not found. Run the 'extension:prep' build step and reload the extension.",
        );
      }
    }
    return compileFn;
  }

  const preview = new CervinPreview(context.extensionUri, (yaml: string) =>
    compiler().then((c) => c(yaml)),
  );
  const goalsPreview = new GoalsPreview();
  const fgcaPreview = new FGCAPreview();
  const fgaPreview = new FGAPreview();

  context.subscriptions.push(
    vscode.commands.registerCommand('cervin.openPreview', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const exts = getConfiguredExtensions();
      if (!doc || !documentMatchesCervinSource(doc)) {
        vscode.window.showWarningMessage(
          `Open a file with one of these suffixes: ${formatExtensionHint(exts)} (configure with cervin.fileExtensions).`,
        );
        return;
      }
      await preview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('cervin.exportSvg', () => notYet('SVG')),
    vscode.commands.registerCommand('cervin.exportPng', () => notYet('PNG')),
    vscode.commands.registerCommand('cervin.exportBpmn', () => notYet('.bpmn export')),
    vscode.commands.registerCommand('transitrixStudio.previewGoals', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isGoalsFile(doc)) {
        vscode.window.showWarningMessage('Open a *.goals.transitrix.yaml file first.');
        return;
      }
      await goalsPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewFGCA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isFGCAFile(doc)) {
        vscode.window.showWarningMessage('Open a *.fgca.transitrix.yaml file first.');
        return;
      }
      await fgcaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewFGA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isFGAFile(doc)) {
        vscode.window.showWarningMessage('Open a *.fga.transitrix.yaml file first.');
        return;
      }
      await fgaPreview.showOrReveal(doc);
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isGoalsFile(doc)) { void goalsPreview.refreshSaved(doc); return; }
      if (isFGCAFile(doc)) { void fgcaPreview.refreshSaved(doc); return; }
      if (isFGAFile(doc)) { void fgaPreview.refreshSaved(doc); return; }
      if (!documentMatchesCervinSource(doc)) return;
      void preview.refreshSaved(doc);
    }),
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (isGoalsFile(doc)) { await goalsPreview.showOrReveal(doc); return; }
      if (isFGCAFile(doc)) { await fgcaPreview.showOrReveal(doc); return; }
      if (isFGAFile(doc)) { await fgaPreview.showOrReveal(doc); }
    }),
  );
}

export function deactivate(): void {}
