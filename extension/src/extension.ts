import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

import type { CompileFn } from './preview.js';
import { CervinPreview } from './preview.js';
import { GoalsPreview } from './goals-preview.js';
import { FGCAPreview, FGAPreview } from './fgca-preview.js';
import { ActivitiesPreview } from './activities-preview.js';
import { BlocksPreview } from './blocks-preview.js';
import { ApplicationsPreview } from './applications-preview.js';
import { ProductsPreview } from './products-preview.js';
import { ProcessMapPreview } from './process-map-preview.js';
import { ScenariosPreview } from './scenarios-preview.js';
import { CapabilityMapPreview } from './capability-map-preview.js';
import { ProcessBlueprintPreview } from './process-blueprint-preview.js';
import { IssuesPreview } from './issues-preview.js';
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

function isActivitiesFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.activities.transitrix.yaml');
}

function isBlocksFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.blocks.transitrix.txt');
}

function isApplicationsFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.applications.transitrix.yaml');
}

function isProductsFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.products.transitrix.yaml');
}

function isProcessMapFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.process-map.transitrix.yaml');
}

function isScenariosFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.scenarios.transitrix.yaml');
}

function isCapabilityMapFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.capability-map.transitrix.yaml');
}

function isProcessBlueprintFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.process-blueprint.transitrix.yaml');
}

function isIssuesFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.issues.transitrix.yaml');
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
  // TX-R003: cache the in-flight Promise, not the resolved result. Two
  // concurrent calls during the brief window before `loadCompiler` resolves
  // would otherwise both pass the `if (!compileFn)` guard and run the loader
  // twice. A failed load clears the cached Promise so a retry can attempt to
  // re-load (transient errors).
  let compilerPromise: Promise<CompileFn> | undefined;

  function compiler(): Promise<CompileFn> {
    if (!compilerPromise) {
      compilerPromise = (async () => {
        try {
          return await loadCompiler(context);
        } catch (err) {
          compilerPromise = undefined;
          const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          console.error('Transitrix Studio: loadCompiler failed:', err);
          throw new Error(
            `Transitrix Studio: compiler bundle failed to load — ${detail}. Run the 'extension:prep' build step and reload the extension.`,
          );
        }
      })();
    }
    return compilerPromise;
  }

  const preview = new CervinPreview(context.extensionUri, (yaml: string) =>
    compiler().then((c) => c(yaml)),
  );
  const goalsPreview = new GoalsPreview();
  const fgcaPreview = new FGCAPreview();
  const fgaPreview = new FGAPreview();
  const activitiesPreview = new ActivitiesPreview();
  const blocksPreview = new BlocksPreview(context.extensionPath);
  const applicationsPreview = new ApplicationsPreview();
  const productsPreview = new ProductsPreview();
  const processMapPreview = new ProcessMapPreview();
  const scenariosPreview = new ScenariosPreview();
  const capabilityMapPreview = new CapabilityMapPreview();
  const processBlueprintPreview = new ProcessBlueprintPreview();
  const issuesPreview = new IssuesPreview();

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
    vscode.commands.registerCommand('transitrixStudio.previewActivities', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isActivitiesFile(doc)) {
        vscode.window.showWarningMessage('Open a *.activities.transitrix.yaml file first.');
        return;
      }
      await activitiesPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewBlocks', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isBlocksFile(doc)) {
        vscode.window.showWarningMessage('Open a *.blocks.transitrix.txt file first.');
        return;
      }
      await blocksPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.saveBlocksAsSvg', () =>
      blocksPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveGoalsAsSvg', () =>
      goalsPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveFGCAAsSvg', () =>
      fgcaPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveFGAAsSvg', () =>
      fgaPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveActivitiesAsSvg', () =>
      activitiesPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.previewApplications', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isApplicationsFile(doc)) {
        vscode.window.showWarningMessage('Open a *.applications.transitrix.yaml file first.');
        return;
      }
      await applicationsPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewProducts', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isProductsFile(doc)) {
        vscode.window.showWarningMessage('Open a *.products.transitrix.yaml file first.');
        return;
      }
      await productsPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewProcessMap', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isProcessMapFile(doc)) {
        vscode.window.showWarningMessage('Open a *.process-map.transitrix.yaml file first.');
        return;
      }
      await processMapPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewScenarios', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isScenariosFile(doc)) {
        vscode.window.showWarningMessage('Open a *.scenarios.transitrix.yaml file first.');
        return;
      }
      await scenariosPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewCapabilityMap', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isCapabilityMapFile(doc)) {
        vscode.window.showWarningMessage('Open a *.capability-map.transitrix.yaml file first.');
        return;
      }
      await capabilityMapPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewProcessBlueprint', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isProcessBlueprintFile(doc)) {
        vscode.window.showWarningMessage('Open a *.process-blueprint.transitrix.yaml file first.');
        return;
      }
      await processBlueprintPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.saveProcessBlueprintAsSvg', async () => {
      await processBlueprintPreview.saveAsSvg();
    }),
    vscode.commands.registerCommand('transitrixStudio.previewIssues', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isIssuesFile(doc)) {
        vscode.window.showWarningMessage('Open a *.issues.transitrix.yaml file first.');
        return;
      }
      await issuesPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.saveIssuesAsSvg', async () => {
      await issuesPreview.saveAsSvg();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (isGoalsFile(doc)) { void goalsPreview.refreshSaved(doc); return; }
      if (isFGCAFile(doc)) { void fgcaPreview.refreshSaved(doc); return; }
      if (isFGAFile(doc)) { void fgaPreview.refreshSaved(doc); return; }
      if (isActivitiesFile(doc)) { void activitiesPreview.refreshSaved(doc); return; }
      if (isBlocksFile(doc)) { void blocksPreview.refreshSaved(doc); return; }
      if (isApplicationsFile(doc)) { void applicationsPreview.refreshSaved(doc); return; }
      if (isProductsFile(doc)) { void productsPreview.refreshSaved(doc); return; }
      if (isProcessMapFile(doc)) { void processMapPreview.refreshSaved(doc); return; }
      if (isScenariosFile(doc)) { void scenariosPreview.refreshSaved(doc); return; }
      if (isCapabilityMapFile(doc)) { void capabilityMapPreview.refreshSaved(doc); return; }
      if (isProcessBlueprintFile(doc)) { void processBlueprintPreview.refreshSaved(doc); return; }
      if (isIssuesFile(doc)) { void issuesPreview.refreshSaved(doc); return; }
      if (!documentMatchesCervinSource(doc)) return;
      void preview.refreshSaved(doc);
    }),
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (isGoalsFile(doc)) { await goalsPreview.showOrReveal(doc); return; }
      if (isFGCAFile(doc)) { await fgcaPreview.showOrReveal(doc); return; }
      if (isFGAFile(doc)) { await fgaPreview.showOrReveal(doc); return; }
      if (isActivitiesFile(doc)) { await activitiesPreview.showOrReveal(doc); return; }
      if (isBlocksFile(doc)) { await blocksPreview.showOrReveal(doc); return; }
      if (isApplicationsFile(doc)) { await applicationsPreview.showOrReveal(doc); return; }
      if (isProductsFile(doc)) { await productsPreview.showOrReveal(doc); return; }
      if (isProcessMapFile(doc)) { await processMapPreview.showOrReveal(doc); return; }
      if (isScenariosFile(doc)) { await scenariosPreview.showOrReveal(doc); return; }
      if (isCapabilityMapFile(doc)) { await capabilityMapPreview.showOrReveal(doc); return; }
      if (isProcessBlueprintFile(doc)) { await processBlueprintPreview.showOrReveal(doc); return; }
      if (isIssuesFile(doc)) { await issuesPreview.showOrReveal(doc); }
    }),
  );
}

export function deactivate(): void {}
