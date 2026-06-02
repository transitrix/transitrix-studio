export { buildComplianceIndex } from './reverse-index.js';
export { buildLawTree, buildProductView } from './views.js';
export { buildGapReport } from './gap-report.js';
export type { GapReport, GapReportOptions } from './gap-report.js';
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
