import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';

import type { CompileFn } from './preview.js';
import { CervinPreview } from './preview.js';
import { ProcessPreview, type ProcessLayoutFn, type BpmnDisplayOpts, SAVE_BPMN_PROCESS_SVG_COMMAND, OPEN_BPMN_SETTINGS_COMMAND } from './process-preview.js';
import { GoalsPreview } from './goals-preview.js';
import { DGCAPreview, DGAPreview } from './dgca-preview.js';
import { ActionPreview } from './action-preview.js';
import { BlocksPreview } from './blocks-preview.js';
import { ApplicationsPreview } from './applications-preview.js';
import { ProductsPreview } from './products-preview.js';
import { ProcessMapPreview } from './process-map-preview.js';
import { ScenariosPreview } from './scenarios-preview.js';
import { CapabilityMapPreview } from './capability-map-preview.js';
import { ProcessBlueprintPreview } from './process-blueprint-preview.js';
import { ActivityCardPreview } from './activity-card-preview.js';
import { ActionsTreePreview, isActionsTreeFileName } from './actions-tree-preview.js';
import { ComplianceMatrixPreview } from './compliance-matrix-preview.js';
import { ComplianceImpactPreview } from './compliance-impact-preview.js';
import { SingleLawPreview } from './single-law-preview.js';
import { SingleProductPreview } from './single-product-preview.js';
import { RequirementTracePreview } from './requirement-trace-preview.js';
import { GapDashboardPreview } from './gap-dashboard-preview.js';
import { CoverageMetricPreview } from './coverage-metric-preview.js';
import { openComplianceFile } from './compliance-scan.js';
import type { LayoutMetrics, ValidationReport } from './types.js';
import {
  documentMatchesTransitrixSource,
  formatExtensionHint,
  getConfiguredExtensions,
} from './source-files.js';
import {
  OPEN_SPACING_SETTINGS_COMMAND,
  SPACING_CONFIG_SECTION,
  NODE_SIZE_CONFIG_SECTION,
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

function isActivitiesFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.action.transitrix.yaml');
}

function isActionCardFile(doc: vscode.TextDocument): boolean {
  return doc.fileName.endsWith('.action-card.transitrix.yaml');
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
  return isActionCardFile(doc);
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

function isRequirementTraceFile(doc: vscode.TextDocument): boolean {
  return /^(REQUIREMENT|CONSTRAINT)-.*\.ya?ml$/i.test(path.basename(doc.fileName));
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
  const processPreview = new ProcessPreview((yaml: string, opts?: BpmnDisplayOpts) =>
    processLayoutFn().then((fn) => fn(yaml, opts)),
  );

  const goalsPreview = new GoalsPreview(context.extensionUri);
  const dgcaPreview = new DGCAPreview(context.extensionUri);
  const dgaPreview = new DGAPreview(context.extensionUri);
  const actionPreview = new ActionPreview(context.extensionUri);
  const blocksPreview = new BlocksPreview();
  const applicationsPreview = new ApplicationsPreview();
  const productsPreview = new ProductsPreview();
  const processMapPreview = new ProcessMapPreview();
  const scenariosPreview = new ScenariosPreview();
  const capabilityMapPreview = new CapabilityMapPreview();
  const processBlueprintPreview = new ProcessBlueprintPreview();
  const activityCardPreview = new ActivityCardPreview();
  const actionsTreePreview = new ActionsTreePreview();
  const complianceMatrixPreview = new ComplianceMatrixPreview(context.extensionUri);
  const complianceImpactPreview = new ComplianceImpactPreview(context.extensionUri);
  const singleLawPreview = new SingleLawPreview(context.extensionUri);
  const singleProductPreview = new SingleProductPreview(context.extensionUri);
  const requirementTracePreview = new RequirementTracePreview(context.extensionUri);
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
    if (!documentMatchesTransitrixSource(doc)) {
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
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('transitrix.openPreview', openPreviewHandler),
    vscode.commands.registerCommand('transitrix.exportSvg', () => notYet('SVG')),
    vscode.commands.registerCommand('transitrix.exportPng', () => preview.saveAsPng()),
    vscode.commands.registerCommand('transitrix.exportBpmn', () => notYet('.bpmn')),
    vscode.commands.registerCommand('transitrixStudio.saveBpmnAsPng', () => preview.saveAsPng()),
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
      if (!doc || !isDGCAFile(doc)) {
        vscode.window.showWarningMessage('Open a *.dgca.transitrix.yaml file first.');
        return;
      }
      await dgcaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewDGA', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isDGAFile(doc)) {
        vscode.window.showWarningMessage('Open a *.dga.transitrix.yaml file first.');
        return;
      }
      await dgaPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewActivities', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      const notation = doc && isDGCAFile(doc) ? probeDocNotation(doc) : undefined;
      const isActivities = doc && (isActivitiesFile(doc) || notation === 'action');
      if (!isActivities) {
        vscode.window.showWarningMessage('Open a *.action.transitrix.yaml file first.');
        return;
      }
      await actionPreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.previewActionsTree', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || !isActionsTreeFileName(doc.fileName)) {
        vscode.window.showWarningMessage('Open a *.actions-tree.transitrix.yaml file first.');
        return;
      }
      await actionsTreePreview.showOrReveal(doc);
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
      dgcaPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveDGAAsSvg', () =>
      dgaPreview.saveAsSvg(),
    ),
    vscode.commands.registerCommand('transitrixStudio.saveActivitiesAsSvg', () =>
      actionPreview.saveAsSvg(),
    ),
    // PNG export — save-to-file + copy-to-clipboard per vector notation
    // (vkgeorgia/strategy#32). Rasterized in the Node host via resvg.
    vscode.commands.registerCommand('transitrixStudio.saveBlocksAsPng', () => blocksPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyBlocksAsPng', () => blocksPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveGoalsAsPng', () => goalsPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyGoalsAsPng', () => goalsPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveDGCAAsPng', () => dgcaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyDGCAAsPng', () => dgcaPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveDGAAsPng', () => dgaPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyDGAAsPng', () => dgaPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.saveActivitiesAsPng', () => actionPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyActivitiesAsPng', () => actionPreview.copyAsPng()),
    vscode.commands.registerCommand('transitrixStudio.exportActionTreeAsMarkdown', () => actionPreview.exportTreeAsMarkdown()),
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
        vscode.window.showWarningMessage('Open a *.action-card.transitrix.yaml file first.');
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
    // Requirement traceability + hierarchy view —
    // triggered from a REQUIREMENT-*.yaml or CONSTRAINT-*.yaml file's
    // editor-title bar. Shows the trace chain (derived_from → element →
    // ASSERTION → subject + realised_via) and the hierarchy (parent chain +
    // direct children); origin-agnostic per 15-requirement.md §2.1.
    vscode.commands.registerCommand('transitrixStudio.previewRequirementTrace', async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc) { vscode.window.showWarningMessage('Open a REQUIREMENT or CONSTRAINT file first.'); return; }
      await requirementTracePreview.showOrReveal(doc);
    }),
    vscode.commands.registerCommand('transitrixStudio.refreshRequirementTrace', () => requirementTracePreview.refresh()),
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
        !e.affectsConfiguration(VIEW_CONFIG_SECTION) &&
        !e.affectsConfiguration(NODE_SIZE_CONFIG_SECTION)
      ) return;
      void goalsPreview.refreshConfig();
      void dgcaPreview.refreshConfig();
      void dgaPreview.refreshConfig();
      void actionPreview.refreshConfig();
      // Blocks, Process Blueprint, and Capability Map also carry a
      // `transitrix.nodeSize.*` setting (see NodeSizeNotation), so — like the
      // four previews above — they must refresh on a node-size change, not
      // just a theme change. Previously gated behind `isThemeChange` only, so
      // an already-open panel kept showing the old box size/spacing until an
      // unrelated theme toggle or file save forced a rebuild.
      void blocksPreview.refreshConfig();
      void processBlueprintPreview.refreshConfig();
      void capabilityMapPreview.refreshConfig();
      if (isThemeChange) {
        void activityCardPreview.refreshConfig();
        void applicationsPreview.refreshConfig();
        void productsPreview.refreshConfig();
        void processMapPreview.refreshConfig();
        void scenariosPreview.refreshConfig();
        void complianceMatrixPreview.refresh();
        void complianceImpactPreview.refresh();
        void singleLawPreview.refresh();
        void singleProductPreview.refresh();
        void requirementTracePreview.refresh();
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
      void actionsTreePreview.refreshIfSiblingSaved(doc);
      void dgcaPreview.refreshIfSiblingSaved(doc);
      // Compliance views are repo-wide: re-scan the open ones whenever a canon
      // artefact (by filename convention) is saved. No-op when no panel is open.
      if (/^(PRODUCT|REQUIREMENT|CONSTRAINT|ASSERTION|LAW|REGULATION|POLICY|INTERNAL_STANDARD)-.*\.ya?ml$/.test(path.basename(doc.fileName))) {
        void complianceMatrixPreview.refresh();
        void complianceImpactPreview.refresh();
        void singleLawPreview.refresh();
        void singleProductPreview.refresh();
        void requirementTracePreview.refresh();
        void gapDashboardPreview.refresh();
      }
      if (isGoalsFile(doc)) { void goalsPreview.refreshSaved(doc); return; }
      if (isDGCAFile(doc)) {
        const notation = probeDocNotation(doc);
        if (notation === 'goals') { void goalsPreview.refreshSaved(doc); return; }
        if (notation === 'action') { void actionPreview.refreshSaved(doc); return; }
        void dgcaPreview.refreshSaved(doc); return;
      }
      if (isDGAFile(doc)) { void dgaPreview.refreshSaved(doc); return; }
      if (isActivitiesFile(doc)) { void actionPreview.refreshSaved(doc); return; }
      if (isActionsTreeFileName(doc.fileName)) { void actionsTreePreview.refreshSaved(doc); return; }
      if (isBlocksFile(doc)) { void blocksPreview.refreshSaved(doc); return; }
      if (isApplicationsFile(doc)) { void applicationsPreview.refreshSaved(doc); return; }
      if (isProductsFile(doc)) { void productsPreview.refreshSaved(doc); return; }
      if (isProcessMapFile(doc)) { void processMapPreview.refreshSaved(doc); return; }
      if (isScenariosFile(doc)) { void scenariosPreview.refreshSaved(doc); return; }
      if (isCapabilityMapFile(doc)) { void capabilityMapPreview.refreshSaved(doc); return; }
      if (isProcessBlueprintFile(doc)) { void processBlueprintPreview.refreshSaved(doc); return; }
      if (isActivityCardFile(doc)) { void activityCardPreview.refreshSaved(doc); return; }
      if (isCoverageMetricFile(doc)) { void coverageMetricPreview.refreshSaved(doc); return; }
      if (!documentMatchesTransitrixSource(doc)) return;
      void preview.refreshSaved(doc);
      void processPreview.refreshSaved(doc);
    }),
    // Auto-preview follows the active editor rather than every `openTextDocument`
    // call — the latter also fires for documents opened silently in the
    // background (e.g. SCM diff/decoration providers reading changed files),
    // which used to pop a preview panel per notation type touched by anything
    // that reads file content, not just the user actually looking at a file.
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void autoOpenPreviewForDocument(editor.document);
    }),
  );

  // The document that triggered activation is typically already the active
  // editor by the time `activate()` runs, and it won't fire another
  // `onDidChangeActiveTextEditor` event on its own — so check it once here.
  if (vscode.window.activeTextEditor) {
    void autoOpenPreviewForDocument(vscode.window.activeTextEditor.document);
  }

  async function autoOpenPreviewForDocument(doc: vscode.TextDocument): Promise<void> {
    if (doc.uri.scheme !== 'file') return;
    if (!vscode.workspace.getConfiguration('transitrix').get<boolean>('preview.autoOpenOnFileOpen', true)) return;
    if (isGoalsFile(doc)) { await goalsPreview.showOrReveal(doc); return; }
    if (isDGCAFile(doc)) {
      const notation = probeDocNotation(doc);
      if (notation === 'goals') { await goalsPreview.showOrReveal(doc); return; }
      if (notation === 'action') { await actionPreview.showOrReveal(doc); return; }
      await dgcaPreview.showOrReveal(doc); return;
    }
    if (isDGAFile(doc)) { await dgaPreview.showOrReveal(doc); return; }
    if (isActivitiesFile(doc)) { await actionPreview.showOrReveal(doc); return; }
    if (isActionsTreeFileName(doc.fileName)) { await actionsTreePreview.showOrReveal(doc); return; }
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
    if (isRequirementTraceFile(doc)) { await requirementTracePreview.showOrReveal(doc); return; }
    if (documentMatchesTransitrixSource(doc)) { await openBpmnPreviewForDocument(doc); return; }
  }
}

export function deactivate(): void {}
