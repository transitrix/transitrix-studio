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
import { PlantUMLPreview, isPumlFile } from './plantuml-preview.js';
import { openComplianceFile } from './compliance-scan.js';
import type { LayoutMetrics, ValidationReport } from './types.js';
import { documentMatchesTransitrixSource } from './source-files.js';
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
  const plantumlPreview = new PlantUMLPreview(context.extensionUri);

  async function openBpmnPreviewForDocument(doc: vscode.TextDocument): Promise<void> {
    const renderer = vscode.workspace.getConfiguration('transitrix').get<string>('bpmnRenderer', 'custom');
    if (renderer === 'custom') {
      await processPreview.showOrReveal(doc);
    } else {
      await preview.showOrReveal(doc);
    }
  }

  interface ResolvedPreview {
    id: string;
    open(): Promise<void>;
    refresh(): Promise<void>;
  }

  // Single source of truth for "given this document, which preview handles
  // it" — shared by the unified `transitrix.openPreview` command, the
  // auto-open-on-focus behaviour, and the refresh-on-save cascade. Repo-wide
  // dashboards (Compliance Matrix, Gap Dashboard) are intentionally absent:
  // they aren't bound to a specific open file, so they keep their own
  // palette-only commands outside this dispatch.
  function resolveNotationPreview(doc: vscode.TextDocument): ResolvedPreview | undefined {
    if (isPumlFile(doc)) {
      return { id: 'puml', open: () => plantumlPreview.showOrReveal(doc), refresh: () => plantumlPreview.refreshSaved(doc) };
    }
    if (isGoalsFile(doc)) {
      return { id: 'goals', open: () => goalsPreview.showOrReveal(doc), refresh: () => goalsPreview.refreshSaved(doc) };
    }
    if (isDGCAFile(doc)) {
      const notation = probeDocNotation(doc);
      if (notation === 'goals') {
        return { id: 'goals', open: () => goalsPreview.showOrReveal(doc), refresh: () => goalsPreview.refreshSaved(doc) };
      }
      if (notation === 'action') {
        return { id: 'action', open: () => actionPreview.showOrReveal(doc), refresh: () => actionPreview.refreshSaved(doc) };
      }
      return { id: 'dgca', open: () => dgcaPreview.showOrReveal(doc), refresh: () => dgcaPreview.refreshSaved(doc) };
    }
    if (isDGAFile(doc)) {
      return { id: 'dga', open: () => dgaPreview.showOrReveal(doc), refresh: () => dgaPreview.refreshSaved(doc) };
    }
    if (isActivitiesFile(doc)) {
      return { id: 'action', open: () => actionPreview.showOrReveal(doc), refresh: () => actionPreview.refreshSaved(doc) };
    }
    if (isActionsTreeFileName(doc.fileName)) {
      return { id: 'actions-tree', open: () => actionsTreePreview.showOrReveal(doc), refresh: () => actionsTreePreview.refreshSaved(doc) };
    }
    if (isBlocksFile(doc)) {
      return { id: 'blocks', open: () => blocksPreview.showOrReveal(doc), refresh: () => blocksPreview.refreshSaved(doc) };
    }
    if (isApplicationsFile(doc)) {
      return { id: 'applications', open: () => applicationsPreview.showOrReveal(doc), refresh: () => applicationsPreview.refreshSaved(doc) };
    }
    if (isProductsFile(doc)) {
      return { id: 'products', open: () => productsPreview.showOrReveal(doc), refresh: () => productsPreview.refreshSaved(doc) };
    }
    if (isProcessMapFile(doc)) {
      return { id: 'process-map', open: () => processMapPreview.showOrReveal(doc), refresh: () => processMapPreview.refreshSaved(doc) };
    }
    if (isScenariosFile(doc)) {
      return { id: 'scenarios', open: () => scenariosPreview.showOrReveal(doc), refresh: () => scenariosPreview.refreshSaved(doc) };
    }
    if (isCapabilityMapFile(doc)) {
      return { id: 'capability-map', open: () => capabilityMapPreview.showOrReveal(doc), refresh: () => capabilityMapPreview.refreshSaved(doc) };
    }
    if (isProcessBlueprintFile(doc)) {
      return { id: 'process-blueprint', open: () => processBlueprintPreview.showOrReveal(doc), refresh: () => processBlueprintPreview.refreshSaved(doc) };
    }
    if (isActivityCardFile(doc)) {
      return { id: 'activity-card', open: () => activityCardPreview.showOrReveal(doc), refresh: () => activityCardPreview.refreshSaved(doc) };
    }
    if (isCoverageMetricFile(doc)) {
      return { id: 'coverage-metric', open: () => coverageMetricPreview.showOrReveal(doc), refresh: () => coverageMetricPreview.refreshSaved(doc) };
    }
    if (isComplianceImpactFile(doc)) {
      return { id: 'compliance-impact', open: () => complianceImpactPreview.showOrReveal(), refresh: () => complianceImpactPreview.refresh() };
    }
    if (isSingleLawFile(doc)) {
      return { id: 'single-law', open: () => singleLawPreview.showOrReveal(doc), refresh: () => singleLawPreview.refresh() };
    }
    if (isSingleProductFile(doc)) {
      return { id: 'single-product', open: () => singleProductPreview.showOrReveal(doc), refresh: () => singleProductPreview.refresh() };
    }
    if (isRequirementTraceFile(doc)) {
      return { id: 'requirement-trace', open: () => requirementTracePreview.showOrReveal(doc), refresh: () => requirementTracePreview.refresh() };
    }
    if (documentMatchesTransitrixSource(doc)) {
      return {
        id: 'bpmn',
        open: () => openBpmnPreviewForDocument(doc),
        refresh: async () => { await preview.refreshSaved(doc); await processPreview.refreshSaved(doc); },
      };
    }
    return undefined;
  }

  const openPreviewHandler = async (editor: vscode.TextEditor): Promise<void> => {
    const resolved = resolveNotationPreview(editor.document);
    if (!resolved) {
      vscode.window.showWarningMessage('This file type doesn’t have a Transitrix preview.');
      return;
    }
    await resolved.open();
  };

  // Command namespaces (intentional split, kept for compatibility):
  //   • `transitrix.*` — `openPreview` is now the single unified Preview command
  //     for every notation (BPMN included), routed through
  //     `resolveNotationPreview`; plus the export entry points gated by
  //     `config.transitrix.exportEnabled`. `exportPng` is wired to the working
  //     BPMN PNG export; `exportSvg`/`exportBpmn` are still placeholders.
  //   • `transitrixStudio.*` — the broader Studio surface (per-notation
  //     Save/Copy-as-PNG/SVG/refresh commands, plus the repo-wide Compliance
  //     Matrix and Gap Dashboard, which stay outside the unified Preview
  //     command since they aren't bound to a specific open file).
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand('transitrix.openPreview', openPreviewHandler),
    vscode.commands.registerCommand('transitrix.exportSvg', () => notYet('SVG')),
    vscode.commands.registerCommand('transitrix.exportPng', () => preview.saveAsPng()),
    vscode.commands.registerCommand('transitrix.exportBpmn', () => notYet('.bpmn')),
    vscode.commands.registerCommand('transitrixStudio.saveBpmnAsPng', () => preview.saveAsPng()),
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
    vscode.commands.registerCommand('transitrixStudio.saveProcessBlueprintAsSvg', async () => {
      await processBlueprintPreview.saveAsSvg();
    }),
    vscode.commands.registerCommand('transitrixStudio.saveProcessBlueprintAsPng', () => processBlueprintPreview.saveAsPng()),
    vscode.commands.registerCommand('transitrixStudio.copyProcessBlueprintAsPng', () => processBlueprintPreview.copyAsPng()),
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
    vscode.commands.registerCommand('transitrixStudio.refreshComplianceImpact', () => complianceImpactPreview.refresh()),
    // Single-law tree + single-product view (vkgeorgia/strategy#84 Phase 3) —
    // triggered from a codex / product file's editor-title bar; repo-wide scan.
    vscode.commands.registerCommand('transitrixStudio.refreshSingleLaw', () => singleLawPreview.refresh()),
    vscode.commands.registerCommand('transitrixStudio.refreshSingleProduct', () => singleProductPreview.refresh()),
    // Requirement traceability + hierarchy view —
    // triggered from a REQUIREMENT-*.yaml or CONSTRAINT-*.yaml file's
    // editor-title bar. Shows the trace chain (derived_from → element →
    // ASSERTION → subject + realised_via) and the hierarchy (parent chain +
    // direct children); origin-agnostic per 15-requirement.md §2.1.
    vscode.commands.registerCommand('transitrixStudio.refreshRequirementTrace', () => requirementTracePreview.refresh()),
    // Gap dashboard (vkgeorgia/strategy#84 Phase 4) — repo-wide, palette-invoked.
    vscode.commands.registerCommand('transitrixStudio.previewGapDashboard', () => gapDashboardPreview.showOrReveal()),
    vscode.commands.registerCommand('transitrixStudio.refreshGapDashboard', () => gapDashboardPreview.refresh()),
    vscode.commands.registerCommand('transitrixStudio.exportGapDashboardCsv', () => gapDashboardPreview.exportCsv()),
    // Coverage-metric view (strategy#185) — file-driven, opens beside the YAML.
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
      void resolveNotationPreview(doc)?.refresh();
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
    await resolveNotationPreview(doc)?.open();
  }
}

export function deactivate(): void {}
