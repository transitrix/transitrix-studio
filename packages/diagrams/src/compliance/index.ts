export { buildComplianceIndex } from './reverse-index.js';
export { buildLawTree, buildProductView } from './views.js';
export { buildGapReport } from './gap-report.js';
export type { GapReport, GapReportOptions } from './gap-report.js';
export { emptyCanon, ingestComplianceDoc } from './classify.js';
export type { ComplianceCanon, ComplianceProduct, ComplianceCodexDoc } from './classify.js';
export { renderComplianceMarkdown } from './markdown.js';
export type { ReportScope, MarkdownOptions } from './markdown.js';
export { renderComplianceHtml } from './html.js';
export type { HtmlOptions } from './html.js';
export { buildImpactMatrix, renderImpactMarkdown } from './impact.js';
export type {
  ImpactCell,
  ImpactEmptyCellLabels,
  ImpactMatrix,
  ImpactObligationFilter,
  ImpactStatusDisplay,
  ImpactSubjects,
  ImpactViewConfig,
} from './impact.js';
export {
  assertionToScoringElement,
  complianceConfidenceHeader,
  requirementToScoringElement,
  scoreComplianceView,
} from './confidence.js';
export type {
  ComplianceIndex,
  ComplianceIndexInput,
  IndexRequirement,
  IndexAssertion,
  LawTree,
  LawTreeRequirement,
  ProductView,
  ProductRequirementStatus,
} from './types.js';
