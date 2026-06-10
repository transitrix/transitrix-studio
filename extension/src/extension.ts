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
import { ActivityCardPreview } from './activity-card-preview.js';
import { ComplianceMatrixPreview } from './compliance-matrix-preview.js';
import { ComplianceImpactPreview } from './compliance-impact-preview.js';
import { SingleLawPreview } from './single-law-preview.js';
import { SingleProductPreview } from './single-product-preview.js';
import { GapDashboardPreview } from './gap-dashboard-preview.js';
import { CoverageMetricPreview } from './coverage-metric-preview.js';
import { openComplianceFile } from './compliance-scan.js';
import type { LayoutMetrics, ValidationReport } from './types.js';
import {
  checkCervinSettingsMigration,
  documentMatchesCervinSource,
  formatExtensionHint,
  getConfiguredExtensions,
} from './source-files.js';
import {
  OPEN_SPACING_SETTINGS_COMMAND,
  SPACING_CONFIG_SECTION,
  OPEN_CURVATURE_SETTINGS_COMMAND,
  CURVATURE_CONFIG_SECTION,
  OPEN_SCOPE_SETTINGS_COMMAND,
  SCOPE_CONFIG_SECTION,
  VIEW_CONFIG_SECTION,
} from './spacing-config.js';

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
  return doc.fileName.endsWith('.blocks.transitrix.yaml');
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

function isActivityCardFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.activity-card.transitrix.yaml');
}

function isCoverageMetricFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.coverage-metric.transitrix.yaml');
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
  // Cervin → Transitrix settings migration (P2): warn once if a user config
  // still relies on a legacy `cervin.*` key while its `transitrix.*` counterpart
  // is unset.
  checkCervinSettingsMigration();

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
  const goalsPreview = new GoalsPreview(context.extensionUri);
  const fgcaPreview = new FGCAPreview(context.extensionUri);
  const fgaPreview = new FGAPreview(context.extensionUri);
  const activitiesPreview = new ActivitiesPreview(context.extensionUri);
  const blocksPreview = new BlocksPreview();
  const applicationsPreview = new ApplicationsPreview();
  const productsPreview = new ProductsPreview();
  const processMapPreview = new ProcessMapPreview();
  const scenariosPreview = new ScenariosPreview();
  const capabilityMapPreview = new CapabilityMapPreview();
  const processBlueprintPreview = new ProcessBlueprintPreview();
  const activityCardPreview = new ActivityCardPreview();
  const complianceMatrixPreview = new ComplianceMatrixPreview(context.extensionUri);
  const complianceImpactPreview = new ComplianceImpactPreview(context.extensionUri);
  const singleLawPreview = new SingleLawPreview(context.extensionUri);
  const singleProductPreview = new SingleProductPreview(context.extensionUri);
  const gapDashboardPreview = new GapDashboardPreview(context.extensionUri);
  const coverageMetricPreview = new CoverageMetricPreview(context.extensionUri);

  context.subscriptions.push(
    vscode.commands.registerCommand('cervin.openPreview', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const exts = getConfiguredExtensions();
      if (!doc || !documentMatchesCervinSource(doc)) {
        vscode.window.showWarningMessage(
          `Open a file with one of these suffixes: ${formatExtensionHint(exts)} (configure with transitrix.fileExtensions).`,
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
        vscode.window.showWarningMessage('Open a *.blocks.transitrix.yaml file first.');
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
    // PNG export — save-to-file + copy-to-clipboard per vector notation
    // (vkgeorgia/strategy#32). Rasterized in the Node host via resvg.
    vscode.commands.registerCommand('transitrixStudio.saveBlocksAsPng', () => blocksPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyBlocksAsPng', () => blocksPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveGoalsAsPng', () => goalsPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyGoalsAsPng', () => goalsPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveFGCAAsPng', () => fgcaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyFGCAAsPng', () => fgcaPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveFGAAsPng', () => fgaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyFGAAsPng', () => fgaPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveActivitiesAsPng', () => activitiesPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyActivitiesAsPng', () => activitiesPreview.copyAsPng()),
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
    vscode.commands.registerCommand('transitrixStudio.saveProcessBlueprintAsPng', () => processBlueprintPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyProcessBlueprintAsPng', () => processBlueprintPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.previewActivityCard', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isActivityCardFile(doc)) {
        vscode.window.showWarningMessage('Open a *.activity-card.transitrix.yaml file first.');
        return;
      }
      await activityCardPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.saveActivityCardAsSvg', async () => {
      await activityCardPreview.saveAsSvg();
    }),
    vscode.commands.registerCommand('transitrixStudio.saveActivityCardAsPng', () => activityCardPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyActivityCardAsPng', () => activityCardPreview.copyAsPng()),
    // Compliance matrix (vkgeorgia/strategy#84 Phase 2) — a repo-wide view, not
    // bound to a file. `openComplianceFile` is invoked from cell command URIs.
    vscode.commands.registerCommand('transitrixStudio.previewComplianceMatrix', () => complianceMatrixPreview.showOrReveal()),
    vscode.commands.registerCommand('transitrixStudio.refreshComplianceMatrix', () => complianceMatrixPreview.refresh()),
    vscode.commands.registerCommand('transitrixStudio.openComplianceFile', (fsPath: string) => openComplianceFile(fsPath)),
    // Compliance-impact matrix (vkgeorgia/strategy#84 CV-2) — obligation × subject
    // view per §5 of 21-compliance-impact.md; uses ImpactViewConfig (CV-1).
    vscode.commands.registerCommand('transitrixStudio.previewComplianceImpact', () => complianceImpactPreview.showOrReveal()),
    vscode.commands.registerCommand('transitrixStudio.refreshComplianceImpact', () => complianceImpactPreview.refresh()),
    // Single-law tree + single-product view (vkgeorgia/strategy#84 Phase 3) —
    // triggered from a codex / product file's editor-title bar; repo-wide scan.
    vscode.commands.registerCommand('transitrixStudio.previewSingleLaw', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) { vscode.window.showWarningMessage('Open a codex file (LAW / REGULATION / POLICY / INTERNAL_STANDARD) first.'); return; }
      await singleLawPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.refreshSingleLaw', () => singleLawPreview.refresh()),
    vscode.commands.registerCommand('transitrixStudio.previewSingleProduct', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) { vscode.window.showWarningMessage('Open a product file (notation: product) first.'); return; }
      await singleProductPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.refreshSingleProduct', () => singleProductPreview.refresh()),
    // Gap dashboard (vkgeorgia/strategy#84 Phase 4) — repo-wide, palette-invoked.
    vscode.commands.registerCommand('transitrixStudio.previewGapDashboard', () => gapDashboardPreview.showOrReveal()),
    vscode.commands.registerCommand('transitrixStudio.refreshGapDashboard', () => gapDashboardPreview.refresh()),
    vscode.commands.registerCommand('transitrixStudio.exportGapDashboardCsv', () => gapDashboardPreview.exportCsv()),
    // Coverage-metric view (strategy#185) — file-driven, opens beside the YAML.
    vscode.commands.registerCommand('transitrixStudio.previewCoverageMetric', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isCoverageMetricFile(doc)) {
        vscode.window.showWarningMessage('Open a *.coverage-metric.transitrix.yaml file first.');
        return;
      }
      await coverageMetricPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.refreshCoverageMetric', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc && isCoverageMetricFile(doc)) await coverageMetricPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand(OPEN_SPACING_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', SPACING_CONFIG_SECTION),
    ),
    vscode.commands.registerCommand(OPEN_CURVATURE_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', CURVATURE_CONFIG_SECTION),
    ),
    vscode.commands.registerCommand(OPEN_SCOPE_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', SCOPE_CONFIG_SECTION),
    ),
    // Re-render the spacing/curvature/scope-aware previews when a gap, curvature
    // or scope setting changes — the settings-driven persistence mechanism
    // (vkgeorgia/strategy#75, #76, #77). Config is the single source of truth:
    // both the in-preview controls (PR2) and the "…" Settings links write here,
    // and this handler rebuilds the webview HTML from the tracked document.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        !e.affectsConfiguration(SPACING_CONFIG_SECTION) &&
        !e.affectsConfiguration(CURVATURE_CONFIG_SECTION) &&
        !e.affectsConfiguration(SCOPE_CONFIG_SECTION) &&
        !e.affectsConfiguration(VIEW_CONFIG_SECTION)
      ) return;
      void goalsPreview.refreshConfig();
      void fgcaPreview.refreshConfig();
      void fgaPreview.refreshConfig();
      void activitiesPreview.refreshConfig();
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // Multi-document: an open Activity Card re-resolves when one of its
      // sibling *.activities.* / *.fgca.* documents is saved. Runs before the
      // per-type routing below (which early-returns on a match).
      void activityCardPreview.refreshIfSiblingSaved(doc);
      // Compliance views are repo-wide: re-scan the open ones whenever a canon
      // artefact (by filename convention) is saved. No-op when no panel is open.
      if (/^(PRODUCT|REQUIREMENT|ASSERTION|LAW|REGULATION|POLICY|INTERNAL_STANDARD)-.*\.ya?ml$/.test(path.basename(doc.fileName))) {
        void complianceMatrixPreview.refresh();
        void complianceImpactPreview.refresh();
        void singleLawPreview.refresh();
        void singleProductPreview.refresh();
        void gapDashboardPreview.refresh();
      }
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
      if (isActivityCardFile(doc)) { void activityCardPreview.refreshSaved(doc); return; }
      if (isCoverageMetricFile(doc)) { void coverageMetricPreview.refreshSaved(doc); return; }
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
      if (isActivityCardFile(doc)) { await activityCardPreview.showOrReveal(doc); return; }
      if (isCoverageMetricFile(doc)) { await coverageMetricPreview.showOrReveal(doc); return; }
    }),
  );
}

export function deactivate(): void {}
