export { buildComplianceIndex } from './reverse-index.js';
export { buildLawTree, buildProductView } from './views.js';
export { buildRequirementTrace, buildTraceElementCatalog } from './trace.js';
export { buildGapReport } from './gap-report.js';
export type { GapReport, GapReportOptions } from './gap-report.js';
export { emptyCanon, ingestComplianceDoc } from './classify.js';
export type { ComplianceCanon, ComplianceProduct, ComplianceCodexDoc } from './classify.js';
export {
  admitDocumentToCatalog,
  buildComplianceScan,
  catalogFromMap,
} from './canon-catalog.js';
export type { ComplianceScanResult, ScannedYamlDoc } from './canon-catalog.js';
export { renderComplianceMarkdown } from './markdown.js';
export type { ReportScope, MarkdownOptions } from './markdown.js';
export { renderComplianceHtml, renderImpactMatrixHtml } from './html.js';
export type { HtmlOptions, ImpactMatrixHtmlOptions } from './html.js';
export { buildImpactMatrix, renderImpactMarkdown, parseImpactViewConfig, collectImpactViewResolutionFindings, COMPLIANCE_IMPACT_DEFAULTS, extractObjectDetails, extractProcessFlowTasks, mergeStageTaskDetails, computeDeadlineStatus } from './impact.js';
export type {
  ImpactCell,
  ImpactColumn,
  ImpactEmptyCellLabels,
  ImpactFinding,
  ImpactGrouping,
  ImpactMatrix,
  ImpactObligationFilter,
  ImpactStatusDisplay,
  ImpactSubjects,
  ImpactViewConfig,
  ParseImpactViewConfigResult,
} from './impact.js';
export {
  assertionToScoringElement,
  complianceConfidenceHeader,
  requirementToScoringElement,
  scoreComplianceView,
} from './confidence.js';
export {
  parseCoverageMetricConfig,
  buildCoverageMatrix,
  collectCoverageViewResolutionFindings,
} from './coverage-metric.js';
export type {
  CoverageMetricConfig,
  CoverageMetricRegimes,
  CoverageMetricRegimesFilter,
  CoverageMetricSubjects,
  CoverageMetricThresholds,
  CoverageMatrix,
  CoverageRow,
  CoverageViewFinding,
  ParseCoverageMetricResult,
  RagStatus,
} from './coverage-metric.js';
export type {
  ComplianceIndex,
  ComplianceIndexInput,
  DeadlineStatus,
  IndexRequirement,
  IndexAssertion,
  LawTree,
  LawTreeRequirement,
  ProductView,
  ProductRequirementStatus,
  ObjectDetailDef,
  ObjectDetailInput,
  RequirementTrace,
  TraceAssertionRow,
  TraceElementCatalog,
  TraceElementRef,
  TraceSourceRef,
} from './types.js';
