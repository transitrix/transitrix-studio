// File-scope validation for diagram notations (vkgeorgia/strategy#258).
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
import { coerceDatesToIsoStrings } from '../packages/diagrams/src/yaml-normalize.js';
import { parseCanonicalGoals } from '../packages/diagrams/src/goals/parse-canonical.js';
import {
  parseCanonicalFGCA,
  parseCanonicalFGA,
} from '../packages/diagrams/src/fgca/parse-canonical.js';
import { validateActivities } from '../packages/diagrams/src/activities/validate.js';
import { validateActivityCard } from '../packages/diagrams/src/activity-card/validate.js';
import { validateProcessBlueprint } from '../packages/diagrams/src/process-blueprint/validate.js';
import { validateNestedBlocks } from '../packages/diagrams/src/blocks/validate.js';
import { validateApplicationsCatalogue } from '../packages/diagrams/src/applications/validate.js';
import { validateCapabilityMap } from '../packages/diagrams/src/capability-map/validate.js';
import { validateProductsCatalogue } from '../packages/diagrams/src/products/validate.js';
import { validateScenario } from '../packages/diagrams/src/scenarios/validate.js';
import { validateProcessMap } from '../packages/diagrams/src/process-map/validate.js';

/** The shape every notation validator returns: code/message findings split into
 *  blocking errors and advisory warnings. The concrete result types carry extra
 *  fields (parsed model, etc.) — structurally assignable to this. */
interface NotationValidationResult {
  valid: boolean;
  errors: Array<{ code: string; message: string }>;
  warnings: Array<{ code: string; message: string }>;
}

type NotationValidator = (input: unknown) => NotationValidationResult;

// Keyed by the document's `notation:` field value — see the corpus under
// tests/fixtures/notation-corpus/<notation>/.
const VALIDATORS: Record<string, NotationValidator> = {
  // Group A — validator lives in the shared package and is the one the preview calls.
  goals: parseCanonicalGoals,
  fgca: parseCanonicalFGCA,
  fga: parseCanonicalFGA,
  activities: validateActivities,
  'activity-card': validateActivityCard,
  'process-blueprint': validateProcessBlueprint,
  blocks: validateNestedBlocks,
  // Group B — deduped from inline preview copies in Phase B; package is now canonical.
  applications: validateApplicationsCatalogue,
  'capability-map': validateCapabilityMap,
  products: validateProductsCatalogue,
  scenarios: validateScenario,
  'process-map': validateProcessMap,
};

/** Notation field values the CLI can validate per file. */
export const FILE_VALIDATABLE_NOTATIONS = Object.keys(VALIDATORS);

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

/** Parse + date-coerce a YAML string exactly as the previews do, so validator
 *  input — and therefore findings — match the preview. Throws on a YAML syntax
 *  error (the caller maps that to a parse-error report). */
export function loadNotationYaml(text: string): unknown {
  return coerceDatesToIsoStrings(yaml.load(text) as unknown);
}

/** Run the per-notation validator and shape its result as a ValidationReport, so
 *  the CLI prints/serialises notation findings through the same path as BPMN
 *  validation. `notation` must be one isFileValidatableNotation() accepts. */
export function validateNotationDoc(notation: string, data: unknown): ValidationReport {
  const result = VALIDATORS[notation](data);
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
