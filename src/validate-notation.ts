// File-scope validation for diagram notations.
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
// The per-notation validators themselves — which package function to call, any
// options-forwarding glue, and whether the notation has a canonical view
// extension or a compliance-sweep directory — live one file per notation under
// `src/validators/`, discovered by `notation-registry.ts`. This module only
// holds the dispatch that's the same for every notation: parsing, key
// resolution, and shaping the result.

import yaml from 'js-yaml';
import type { ValidationReport, ValidationFinding } from './validator-types.js';
import { coerceDatesToIsoStrings } from '@transitrix/diagrams/yaml-normalize.js';
import { isCodexDoc } from '@transitrix/diagrams/codex/validate.js';
import { CODEX_ARTEFACT_TYPES } from '@transitrix/diagrams/codex/types.js';
import { typeOfId } from '@transitrix/diagrams/typed-id.js';
import {
  VALIDATOR_REGISTRATIONS,
  type NotationValidator,
  type ValidateNotationOptions,
} from './notation-registry.js';

export type { ValidateNotationOptions } from './notation-registry.js';

const VALIDATORS: Record<string, NotationValidator> = Object.fromEntries(
  VALIDATOR_REGISTRATIONS.map((r) => [r.notation, r.validator]),
);

/** Notation field values the CLI can validate per file. */
export const FILE_VALIDATABLE_NOTATIONS: readonly string[] = VALIDATOR_REGISTRATIONS.map(
  (r) => r.notation,
);

/** View notations whose on-disk suffix is `.<notation>.transitrix.yaml`.
 *  Element notations (requirement, constraint, assertion) use typed-id filenames instead. */
export const NOTATIONS_WITH_CANONICAL_VIEW_EXTENSION: readonly string[] = VALIDATOR_REGISTRATIONS
  .filter((r) => r.canonicalViewExtension)
  .map((r) => r.notation);

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
  if (base.startsWith('constraint-') && base.endsWith('.yaml')) return 'constraint';
  if (base.startsWith('assertion-') && base.endsWith('.yaml')) return 'assertion';
  if (base.startsWith('verification-') && base.endsWith('.yaml')) return 'verification';
  if (base.startsWith('risk-') && base.endsWith('.yaml')) return 'risk';
  if (base.startsWith('metric-') && base.endsWith('.yaml')) return 'metric';
  if (base.startsWith('need-') && base.endsWith('.yaml')) return 'need';
  if (base.startsWith('validation-') && base.endsWith('.yaml')) return 'validation';
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
  const result = VALIDATORS[notation](data, options);
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
