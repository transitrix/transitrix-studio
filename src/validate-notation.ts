// File-scope validation for diagram notations (vkgeorgia/strategy#258).
// Group C (compliance suite): #518 Phase C1–C2.
//
// The VS Code preview renders its red error block from per-notation validators
// in @transitrix/diagrams. This module exposes those same validators to the CLI
// so `transitrix validate <file> --json` emits the SAME findings an adopter
// currently copies out of the preview by hand — letting an agent run a closed
// validate → fix → validate loop with no human relaying errors.
//
// Separate module — like repo-validate.ts / export-compliance.ts — because it
// imports @transitrix/diagrams *source*, which the rootDir-restricted emit build
// (tsconfig.build.json) cannot emit. It is type-checked by `npm run compile`,
// loaded by cli.ts via a runtime dynamic import (tsx in dev), and bundled into
// the slim CLI package by scripts/build-cli-package.mjs.
//
// Group A: notations whose validator already lived in the shared package AND was
// the one the preview called — parity by construction from Phase A.
// Group B (applications, capability-map, products, scenarios, process-map):
// previously kept inline copies in the extension preview files. Phase B deduped
// them — the extension now imports the package validator — so CLI parity is
// guaranteed for all notations listed here.
// activity-card runs only its single-file structural stage here — cross-document
// resolution (resolveActivityCard) needs the whole canon and belongs to repo scope.

import yaml from 'js-yaml';
import type { ValidationReport, ValidationFinding } from './validator-types.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { parseCanonicalGoals } from '@transitrix/diagrams/goals/parse-canonical.js';
import {
  parseCanonicalFGCA,
  parseCanonicalFGA,
} from '@transitrix/diagrams/fgca/parse-canonical.js';
import { validateActivities } from '@transitrix/diagrams/activities/validate.js';
import { validateActivityCard } from '@transitrix/diagrams/activity-card/validate.js';
import { validateProcessBlueprint } from '@transitrix/diagrams/process-blueprint/validate.js';
import { validateNestedBlocks } from '@transitrix/diagrams/blocks/validate.js';
import { validateApplicationsCatalogue } from '@transitrix/diagrams/applications/validate.js';
import { validateCapabilityMap } from '@transitrix/diagrams/capability-map/validate.js';
import { validateProductsCatalogue } from '@transitrix/diagrams/products/validate.js';
import { validateScenario } from '@transitrix/diagrams/scenarios/validate.js';
import { validateProcessMap } from '@transitrix/diagrams/process-map/validate.js';
import { validateRequirement } from '@transitrix/diagrams/requirement/validate.js';
import { validateAssertion } from '@transitrix/diagrams/assertion/validate.js';
import { parseImpactViewConfig } from '@transitrix/diagrams/compliance/impact.js';
import { parseCoverageMetricConfig } from '@transitrix/diagrams/compliance/coverage-metric.js';
import {
  validateCodex,
  isCodexDoc,
  folderJurisdictionFromPath,
} from '@transitrix/diagrams/codex/validate.js';
import { CODEX_ARTEFACT_TYPES } from '@transitrix/diagrams/codex/types.js';
import { typeOfId, type CanonCatalog } from '@transitrix/diagrams/typed-id.js';

/** The shape every notation validator returns: code/message findings split into
 *  blocking errors and advisory warnings. The concrete result types carry extra
 *  fields (parsed model, etc.) — structurally assignable to this. */
interface NotationValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

type NotationValidator = (input: unknown, options?: ValidateNotationOptions) => NotationValidationResult;

function wrapValidator(fn: (input: unknown) => NotationValidationResult): NotationValidator {
  return (input, _options = {}) => fn(input);
}

function mapPackageResult(result: {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}): NotationValidationResult {
  return {
    valid: result.valid,
    errors: result.errors.map((e) => ({ code: e.code, message: e.message })),
    warnings: result.warnings.map((w) => ({ code: w.code, message: w.message })),
  };
}

function validateRequirementDoc(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateRequirement(input, { catalog: options.catalog }));
}

function validateAssertionDoc(input: unknown, options: ValidateNotationOptions = {}): NotationValidationResult {
  const today = new Date().toISOString().slice(0, 10);
  return mapPackageResult(validateAssertion(input, { catalog: options.catalog, today }));
}

function validateComplianceImpactDoc(input: unknown): NotationValidationResult {
  const r = parseImpactViewConfig(input);
  if (r.ok) return { valid: true, errors: [], warnings: [] };
  return {
    valid: false,
    errors: r.errors.map((message) => ({ code: 'COMPIMP-001', message })),
    warnings: [],
  };
}

function splitComplianceCode(message: string, fallback: string): { code: string; message: string } {
  const m = message.match(/^([A-Z][A-Z0-9_-]+):\s*(.*)$/s);
  if (m) return { code: m[1], message: m[2].length > 0 ? m[2] : message };
  return { code: fallback, message };
}

function validateCoverageMetricDoc(input: unknown): NotationValidationResult {
  const r = parseCoverageMetricConfig(input);
  if (!r.ok) {
    return {
      valid: false,
      errors: r.errors.map((message) => splitComplianceCode(message, 'COVMET-001')),
      warnings: [],
    };
  }
  const warnings = (r.config.warnings ?? []).map((message) =>
    splitComplianceCode(message, 'COVMET-WARN'),
  );
  return { valid: true, errors: [], warnings };
}

function validateCodexDoc(input: unknown, _options: ValidateNotationOptions = {}): NotationValidationResult {
  return mapPackageResult(validateCodex(input));
}

// Keyed by the document's `notation:` field value — see the corpus under
// tests/fixtures/notation-corpus/<notation>/.
const VALIDATORS: Record<string, NotationValidator> = {
  // Group A — validator lives in the shared package and is the one the preview calls.
  goals: wrapValidator(parseCanonicalGoals),
  dgca: wrapValidator(parseCanonicalFGCA),
  dga: wrapValidator(parseCanonicalFGA),
  action: wrapValidator(validateActivities),
  'action-card': wrapValidator(validateActivityCard),
  'process-blueprint': wrapValidator(validateProcessBlueprint),
  blocks: wrapValidator(validateNestedBlocks),
  // Group B — deduped from inline preview copies in Phase B; package is now canonical.
  applications: wrapValidator(validateApplicationsCatalogue),
  'capability-map': wrapValidator(validateCapabilityMap),
  products: wrapValidator(validateProductsCatalogue),
  scenarios: wrapValidator(validateScenario),
  'process-map': wrapValidator(validateProcessMap),
  // Group C — compliance suite (#518 Phase C1–C3).
  requirement: validateRequirementDoc,
  assertion: validateAssertionDoc,
  'compliance-impact': wrapValidator(validateComplianceImpactDoc),
  'coverage-metric': wrapValidator(validateCoverageMetricDoc),
  // Group C — codex zone (#518 Phase C2); `zone: codex`, not a notation: tag.
  codex: validateCodexDoc,
};

/** Notation field values the CLI can validate per file. */
export const FILE_VALIDATABLE_NOTATIONS = Object.keys(VALIDATORS);

/** View notations whose on-disk suffix is `.<notation>.transitrix.yaml`.
 *  Element notations (requirement, assertion) use typed-id filenames instead. */
export const NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION: readonly string[] = [
  'goals',
  'dgca',
  'dga',
  'action',
  'action-card',
  'process-blueprint',
  'blocks',
  'applications',
  'capability-map',
  'products',
  'scenarios',
  'process-map',
  'compliance-impact',
  'coverage-metric',
];

/** Canonical file extensions the validate command accepts without `--ext`. */
export const CANONICAL_NOTATION_FILE_EXTENSIONS: readonly string[] =
  NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION.map((n) => `.${n}.transitrix.yaml`);

/** Return the notation inferred from the file's canonical extension (e.g.
 *  `foo.dgca.transitrix.yaml` → `"dgca"`), or `undefined` for non-canonical
 *  names. Used by the validate command to give a helpful error when a canonical
 *  extension file is missing its `notation:` field. */
export function inferNotationFromFilename(filePath: string): string | undefined {
  const lower = filePath.replace(/\\/g, '/').toLowerCase();
  for (const notation of NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION) {
    if (lower.endsWith(`.${notation}.transitrix.yaml`)) return notation;
  }
  const base = lower.split('/').pop() ?? lower;
  if (base.startsWith('requirement-') && base.endsWith('.yaml')) return 'requirement';
  if (base.startsWith('assertion-') && base.endsWith('.yaml')) return 'assertion';
  const rawBase = (filePath.replace(/\\/g, '/').split('/').pop() ?? '').replace(/\.ya?ml$/i, '');
  const idType = typeOfId(rawBase);
  if (idType && (CODEX_ARTEFACT_TYPES as readonly string[]).includes(idType)) return 'codex';
  return undefined;
}

/** True when `transitrix validate <file>` has a per-notation validator for this
 *  notation — i.e. it can reproduce the preview's error block. */
export function isFileValidatableNotation(notation: string): boolean {
  return Object.prototype.hasOwnProperty.call(VALIDATORS, notation);
}

/** Read the `notation:` field from parsed YAML data, if present. */
export function notationOf(data: unknown): string | undefined {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const n = (data as Record<string, unknown>).notation;
    if (typeof n === 'string') return n;
  }
  return undefined;
}

/** Resolve the validator dispatch key: explicit `notation:` wins; codex artefacts
 *  are keyed as `codex` when `zone: codex`. */
export function resolveValidatorKey(data: unknown): string | undefined {
  const notation = notationOf(data);
  if (notation && isFileValidatableNotation(notation)) return notation;
  if (isCodexDoc(data)) return 'codex';
  return notation;
}

export interface ValidateNotationOptions {
  /** Repo-relative or absolute path — used for codex folder-jurisdiction checks. */
  filePath?: string;
  /** Admitted canon catalogue — enables REQ-002 and ASSERT-002..005 (#518 C3). */
  catalog?: CanonCatalog;
}

/** Parse + date-coerce a YAML string exactly as the previews do, so validator
 *  input — and therefore findings — match the preview. Throws on a YAML syntax
 *  error (the caller maps that to a parse-error report). */
export function loadNotationYaml(text: string): unknown {
  return coerceDatesToIsoStrings(yaml.load(text) as unknown);
}

/** Run the per-notation validator and shape its result as a ValidationReport, so
 *  the CLI prints/serialises notation findings through the same path as BPMN
 *  validation. `notation` must be one isFileValidatableNotation() accepts. */
export function validateNotationDoc(
  notation: string,
  data: unknown,
  options: ValidateNotationOptions = {},
): ValidationReport {
  const result =
    notation === 'codex'
      ? mapPackageResult(
          validateCodex(data, {
            folderJurisdiction: options.filePath
              ? folderJurisdictionFromPath(options.filePath)
              : undefined,
          }),
        )
      : VALIDATORS[notation](data, options);
  const findings: ValidationFinding[] = [
    ...result.errors.map(
      (e): ValidationFinding => ({ ruleId: e.code, severity: 'error', message: e.message }),
    ),
    ...result.warnings.map(
      (w): ValidationFinding => ({ ruleId: w.code, severity: 'warning', message: w.message }),
    ),
  ];
  return {
    isValid: result.valid,
    findings,
    summary: {
      errorCount: findings.filter((f) => f.severity === 'error').length,
      warningCount: findings.filter((f) => f.severity === 'warning').length,
      infoCount: 0,
    },
  };
}
