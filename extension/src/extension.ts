import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

import type { CompileFn } from './preview.js';
import { CervinPreview } from './preview.js';
import { ProcessPreview, type ProcessLayoutFn, type BpmnDisplayOpts, SAVE_BPMN_PROCESS_SVG_COMMAND, OPEN_BPMN_SETTINGS_COMMAND } from './process-preview.js';
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
  ENTRY_CURVATURE_CONFIG_SECTION,
  OPEN_SCOPE_SETTINGS_COMMAND,
  SCOPE_CONFIG_SECTION,
  VIEW_CONFIG_SECTION,
} from './spacing-config.js';
import { OPEN_THEME_COMMAND } from './diagram-frame.js';

function isGoalsFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.goals.transitrix.yaml');
}

function isDGCAFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.dgca.transitrix.yaml');
}

function isDGAFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.dga.transitrix.yaml');
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

function isComplianceImpactFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.compliance-impact.transitrix.yaml')
    || doc.fileName.endsWith('.compliance-impact.view.yaml');
}

function isSingleLawFile(doc: vscode.TextDocument): boolean {
  return /^(LAW|REGULATION|POLICY|INTERNAL_STANDARD)-.*\.ya?ml$/i.test(path.basename(doc.fileName));
}

function isSingleProductFile(doc: vscode.TextDocument): boolean {
  return /^PRODUCT-.*\.ya?ml$/i.test(path.basename(doc.fileName));
}

function probeDocNotation(doc: vscode.TextDocument): string | undefined {
  const lines = Math.min(doc.lineCount, 20);
  const header = doc.getText(new vscode.Range(0, 0, lines, 0));
  const m = /^notation:\s+([^\s#]+)/m.exec(header);
  return m?.[1];
}

async function loadCompiler(ext: vscode.ExtensionContext): Promise<CompileFn> {
  const compilerPath = path.join(ext.extensionPath, 'compiler', 'compiler.js');
  const metricsPath = path.join(ext.extensionPath, 'compiler', 'metrics.js');
  const compilerHref = pathToFileURL(compilerPath).href;
  const metricsHref = pathToFileURL(metricsPath).href;

  const compilerMod = (await import(compilerHref)) as {
    compileTransitrixYamlWithLayout: (yaml: string, options?: unknown) => Promise<{ xml: string; layout: unknown; validation: ValidationReport }>;
  };
  const metricsMod = (await import(metricsHref)) as {
    computeLayoutMetrics: (layout: unknown) => LayoutMetrics;
  };

  return async (yaml: string): Promise<{ xml: string; metrics: LayoutMetrics; validation: ValidationReport }> => {
    const result = await compilerMod.compileTransitrixYamlWithLayout(yaml);
    const metrics = metricsMod.computeLayoutMetrics(result.layout);
    return { xml: result.xml, metrics, validation: result.validation };
  };
}

async function loadProcessLayoutFn(ext: vscode.ExtensionContext): Promise<ProcessLayoutFn> {
  const compilerPath = path.join(ext.extensionPath, 'compiler', 'compiler.js');
  const compilerHref = pathToFileURL(compilerPath).href;
  // Node.js module cache means this import() re-uses the already-loaded module
  // when loadCompiler() has run first — no double-load overhead.
  const mod = (await import(compilerHref)) as {
    compileTransitrixYamlWithLayout: (
      yaml: string,
      options?: { layout?: { laneVerticalGap?: number; uniformLaneHeight?: boolean } },
    ) => Promise<{ layout: unknown; validation: ValidationReport }>;
  };
  return async (yaml: string, opts?: BpmnDisplayOpts) => {
    const laneGap = vscode.workspace.getConfiguration('transitrix').get<number>('bpmn.laneGap');
    const layout: { laneVerticalGap?: number; uniformLaneHeight?: boolean } = {};
    if (laneGap !== undefined && Number.isFinite(laneGap)) layout.laneVerticalGap = laneGap;
    if (opts?.uniformLaneHeight) layout.uniformLaneHeight = true;
    const result = await mod.compileTransitrixYamlWithLayout(yaml, Object.keys(layout).length ? { layout } : undefined);
    // LayoutIr is structurally compatible with ProcessDiagramLayout — safe cast.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { layout: result.layout as any, validation: result.validation };
  };
}

function notYet(label: string): void {
  void vscode.window.showInformationMessage(
    `${label} export isn't available for the BPMN preview yet. ` +
      `PNG export works via "Transitrix: Export as PNG"; the other diagram ` +
      `types have their own "Save as PNG/SVG" commands.`,
  );
}

// Cervin → Transitrix command migration (CLAUDE.md §Cervin naming, P3). The
// `cervin.*` commands are kept as deprecated aliases for one release so existing
// keybindings and macros survive; invoking one warns once and delegates to the
// canonical `transitrix.*` handler.
const cervinCommandNoticeShown = new Set<string>();

function noteCervinCommandDeprecation(legacyId: string, canonicalId: string): void {
  if (cervinCommandNoticeShown.has(legacyId)) return;
  cervinCommandNoticeShown.add(legacyId);
  const msg = `Transitrix Studio: the '${legacyId}' command is deprecated and will be removed in 2.0.0 — use '${canonicalId}' instead.`;
  console.warn(msg);
  void vscode.window.showWarningMessage(msg);
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

  let processLayoutPromise: Promise<ProcessLayoutFn> | undefined;
  function processLayoutFn(): Promise<ProcessLayoutFn> {
    if (!processLayoutPromise) {
      processLayoutPromise = loadProcessLayoutFn(context).catch((err) => {
        processLayoutPromise = undefined;
        throw err;
      });
    }
    return processLayoutPromise;
  }
  const processPreview = new ProcessPreview((yaml: string) =>
    processLayoutFn().then((fn) => fn(yaml)),
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

  async function openBpmnPreviewForDocument(doc: vscode.TextDocument): Promise<void> {
    const renderer = vscode.workspace.getConfiguration('transitrix').get<string>('bpmnRenderer', 'custom');
    if (renderer === 'custom') {
      await processPreview.showOrReveal(doc);
    } else {
      await preview.showOrReveal(doc);
    }
  }

  const openPreviewHandler = async (editor: vscode.TextEditor): Promise<void> => {
    const doc = editor.document;
    if (!documentMatchesCervinSource(doc)) {
      const exts = getConfiguredExtensions();
      vscode.window.showWarningMessage(
        `Open a file with one of these suffixes: ${formatExtensionHint(exts)} (configure with transitrix.fileExtensions).`,
      );
      return;
    }
    await openBpmnPreviewForDocument(doc);
  };

  // Command namespaces (intentional split, kept for compatibility):
  //   • `transitrix.*` — the small, stable public surface inherited from the
  //     original BPMN MVP: `openPreview` plus the export entry points gated by
  //     `config.transitrix.exportEnabled`. `exportPng` is wired to the working
  //     BPMN PNG export; `exportSvg`/`exportBpmn` are still placeholders.
  //   • `transitrixStudio.*` — the broader Studio surface (all the per-notation
  //     previews and their Save/Copy-as-PNG/SVG commands).
  //   • `cervin.*` — deprecated aliases, removed in 2.0.0 (CLAUDE.md §Cervin P3/P7).
  const aliasOf = (legacyId: string, canonicalId: string, run: () => void | Promise<void>) =>
    vscode.commands.registerCommand(legacyId, () => {
      noteCervinCommandDeprecation(legacyId, canonicalId);
      return run();
    });

  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('transitrix.openPreview', openPreviewHandler),
    vscode.commands.registerCommand('transitrix.exportSvg', () => notYet('SVG')),
    vscode.commands.registerCommand('transitrix.exportPng', () => preview.saveAsPng()),
    vscode.commands.registerCommand('transitrix.exportBpmn', () => notYet('.bpmn')),
    vscode.commands.registerCommand('transitrixStudio.saveBpmnAsPng', () => preview.saveAsPng()),
    vscode.commands.registerTextEditorCommand('cervin.openPreview', (editor) => {
      noteCervinCommandDeprecation('cervin.openPreview', 'transitrix.openPreview');
      return openPreviewHandler(editor);
    }),
    aliasOf('cervin.exportSvg', 'transitrix.exportSvg', () => notYet('SVG')),
    aliasOf('cervin.exportPng', 'transitrix.exportPng', () => preview.saveAsPng()),
    aliasOf('cervin.exportBpmn', 'transitrix.exportBpmn', () => notYet('.bpmn')),
    vscode.commands.registerCommand('transitrixStudio.previewGoals', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const isGoals = doc && (isGoalsFile(doc) || (isDGCAFile(doc) && probeDocNotation(doc) === 'goals'));
      if (!isGoals) {
        vscode.window.showWarningMessage('Open a *.goals.transitrix.yaml or *.dgca.transitrix.yaml (with notation: goals) file first.');
        return;
      }
      await goalsPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewDGCA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || (!isDGCAFile(doc) && !isFGCAFile(doc))) {
        vscode.window.showWarningMessage('Open a *.dgca.transitrix.yaml file first.');
        return;
      }
      await fgcaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewDGA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || (!isDGAFile(doc) && !isFGAFile(doc))) {
        vscode.window.showWarningMessage('Open a *.dga.transitrix.yaml file first.');
        return;
      }
      await fgaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewFGCA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || (!isFGCAFile(doc) && !isDGCAFile(doc))) {
        vscode.window.showWarningMessage('Open a *.fgca.transitrix.yaml (or *.dgca.transitrix.yaml) file first.');
        return;
      }
      await fgcaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewFGA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || (!isFGAFile(doc) && !isDGAFile(doc))) {
        vscode.window.showWarningMessage('Open a *.fga.transitrix.yaml (or *.dga.transitrix.yaml) file first.');
        return;
      }
      await fgaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewActivities', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const isActivities = doc && (isActivitiesFile(doc) || (isDGCAFile(doc) && probeDocNotation(doc) === 'activities'));
      if (!isActivities) {
        vscode.window.showWarningMessage('Open a *.activities.transitrix.yaml or *.dgca.transitrix.yaml (with notation: activities) file first.');
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
    vscode.commands.registerCommand(SAVE_BPMN_PROCESS_SVG_COMMAND, () =>
      processPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveBlocksAsSvg', () =>
      blocksPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveGoalsAsSvg', () =>
      goalsPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveDGCAAsSvg', () =>
      fgcaPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveDGAAsSvg', () =>
      fgaPreview.saveAsSvg(),
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
    vscode.commands.registerCommand('transitrixStudio.saveDGCAAsPng', () => fgcaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyDGCAAsPng', () => fgcaPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveDGAAsPng', () => fgaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyDGAAsPng', () => fgaPreview.copyAsPng()),
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
    vscode.commands.registerCommand(OPEN_BPMN_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', 'transitrix.bpmn'),
    ),
    vscode.commands.registerCommand(OPEN_SPACING_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', SPACING_CONFIG_SECTION),
    ),
    vscode.commands.registerCommand(OPEN_CURVATURE_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', CURVATURE_CONFIG_SECTION),
    ),
    vscode.commands.registerCommand(OPEN_SCOPE_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand('workbench.action.openSettings', SCOPE_CONFIG_SECTION),
    ),
    vscode.commands.registerCommand(OPEN_THEME_COMMAND, async () => {
      const cfg = vscode.workspace.getConfiguration('transitrix');
      const current = cfg.get<string>('theme', 'transitrix');
      const items = [
        { label: 'Transitrix Light', description: 'Default light theme', value: 'transitrix' },
        { label: 'Transitrix Dark', description: 'Dark theme', value: 'transitrix-dark' },
        { label: 'VS Code Adaptive', description: 'Follow the active VS Code color theme', value: 'vscode-adaptive' },
      ].map(i => ({ ...i, label: (i.value === current ? '$(check) ' : '          ') + i.label }));
      const picked = await vscode.window.showQuickPick(items, {
        title: 'Transitrix Diagram Theme',
        placeHolder: 'Select color scheme for all diagram previews',
      });
      if (!picked) return;
      await cfg.update('theme', picked.value, vscode.ConfigurationTarget.Workspace);
    }),
    // Re-render the spacing/curvature/scope-aware previews when a gap, curvature,
    // scope, or theme setting changes. Config is the single source of truth:
    // both the in-preview controls (PR2) and the "…" Settings links write here,
    // and this handler rebuilds the webview HTML from the tracked document.
    vscode.workspace.onDidChangeConfiguration((e) => {
      const isThemeChange = e.affectsConfiguration('transitrix.theme');
      const isBpmnChange = e.affectsConfiguration('transitrix.bpmn');
      if (isBpmnChange) void processPreview.refreshConfig();
      if (
        !isThemeChange &&
        !isBpmnChange &&
        !e.affectsConfiguration(SPACING_CONFIG_SECTION) &&
        !e.affectsConfiguration(CURVATURE_CONFIG_SECTION) &&
        !e.affectsConfiguration(ENTRY_CURVATURE_CONFIG_SECTION) &&
        !e.affectsConfiguration(SCOPE_CONFIG_SECTION) &&
        !e.affectsConfiguration(VIEW_CONFIG_SECTION)
      ) return;
      void goalsPreview.refreshConfig();
      void fgcaPreview.refreshConfig();
      void fgaPreview.refreshConfig();
      void activitiesPreview.refreshConfig();
      if (isThemeChange) {
        void blocksPreview.refreshConfig();
        void processBlueprintPreview.refreshConfig();
        void activityCardPreview.refreshConfig();
        void applicationsPreview.refreshConfig();
        void productsPreview.refreshConfig();
        void processMapPreview.refreshConfig();
        void scenariosPreview.refreshConfig();
        void capabilityMapPreview.refreshConfig();
        void complianceMatrixPreview.refresh();
        void complianceImpactPreview.refresh();
        void singleLawPreview.refresh();
        void singleProductPreview.refresh();
        void gapDashboardPreview.refresh();
        void coverageMetricPreview.refreshConfig();
      }
    }),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      // Multi-document: an open Activity Card re-resolves when any canon
      // element/relation document under its canon/ root is saved (the card is
      // a projection over canon/elements + canon/relations). Runs before the
      // per-type routing below (which early-returns on a match).
      void activityCardPreview.refreshIfSiblingSaved(doc);
      void fgcaPreview.refreshIfSiblingSaved(doc);
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
      if (isDGCAFile(doc) || isFGCAFile(doc)) {
        const notation = isDGCAFile(doc) ? probeDocNotation(doc) : undefined;
        if (notation === 'goals') { void goalsPreview.refreshSaved(doc); return; }
        if (notation === 'activities') { void activitiesPreview.refreshSaved(doc); return; }
        void fgcaPreview.refreshSaved(doc); return;
      }
      if (isDGAFile(doc) || isFGAFile(doc)) { void fgaPreview.refreshSaved(doc); return; }
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
      void processPreview.refreshSaved(doc);
    }),
    vscode.workspace.onDidOpenTextDocument(async (doc) => {
      if (isGoalsFile(doc)) { await goalsPreview.showOrReveal(doc); return; }
      if (isDGCAFile(doc) || isFGCAFile(doc)) {
        const notation = isDGCAFile(doc) ? probeDocNotation(doc) : undefined;
        if (notation === 'goals') { await goalsPreview.showOrReveal(doc); return; }
        if (notation === 'activities') { await activitiesPreview.showOrReveal(doc); return; }
        await fgcaPreview.showOrReveal(doc); return;
      }
      if (isDGAFile(doc) || isFGAFile(doc)) { await fgaPreview.showOrReveal(doc); return; }
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
      if (isComplianceImpactFile(doc)) { await complianceImpactPreview.showOrReveal(); return; }
      if (isSingleLawFile(doc)) { await singleLawPreview.showOrReveal(doc); return; }
      if (isSingleProductFile(doc)) { await singleProductPreview.showOrReveal(doc); return; }
      if (documentMatchesCervinSource(doc)) { await openBpmnPreviewForDocument(doc); return; }
    }),
  );
}

export function deactivate(): void {}
