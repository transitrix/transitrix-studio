// This repo's vocabulary surface — one binding per closed set the artefact
// defines, naming the runtime constant that carries it here.
//
// This file is the *only* hand-maintained mirror in the check, and it deliberately
// holds no vocabulary values of its own: every binding points at the constant the
// product code already uses, so a value added or removed there moves the check
// with it. A binding that copied the values would be a fourth place for the same
// list to drift.
//
// `values: null` declares that no runtime constant expresses the set. That is a
// divergence like any other, reported and allowlisted with a date — not a way to
// exclude a set from the check.
//
// Adding a binding is not a migration. The scattered per-module literals move to
// reading the artefact when each module is next touched for other reasons; until
// then this file is how the gap stays visible.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { AGREEMENT_VALUES } from '../../packages/diagrams/src/agreement.js';
import { ASSERTION_STATUSES, ASSERTION_SUBJECT_TYPES } from '../../packages/diagrams/src/assertion/types.js';
import { REGISTERED_ELEMENT_TYPES } from '../../packages/diagrams/src/blocks/validate.js';
import { REQUIREMENT_KINDS, REQUIREMENT_LEVELS } from '../../packages/diagrams/src/requirement/types.js';
import { VALIDATION_METHODS, VALIDATION_OUTCOMES } from '../../packages/diagrams/src/validation/types.js';
import { VERIFICATION_METHODS, VERIFICATION_OUTCOMES } from '../../packages/diagrams/src/verification/types.js';

import type { RepoSurface, SurfaceBinding } from './compare.js';

const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url));

/** `transitrix.methodologyVersion` — the methodology release this build targets.
 *  Read, never defaulted: an absent declaration is a failure, not a pass. */
export function declaredMethodologyVersion(path: string = PACKAGE_JSON): string {
  const pkg = JSON.parse(readFileSync(path, 'utf8')) as { transitrix?: { methodologyVersion?: unknown } };
  const declared = pkg.transitrix?.methodologyVersion;
  if (typeof declared !== 'string' || !/^\d+\.\d+\.\d+$/.test(declared)) {
    throw new Error(`package.json declares no semver \`transitrix.methodologyVersion\`: ${path}`);
  }
  return declared;
}

export const BINDINGS: readonly SurfaceBinding[] = [
  {
    key: 'element_types',
    values: [...REGISTERED_ELEMENT_TYPES],
    origin: 'REGISTERED_ELEMENT_TYPES (packages/diagrams/src/blocks/validate.ts)',
  },
  {
    key: 'relation_types',
    values: null,
    origin: 'no relation-type registry exists; repo-scope validation branches on the kind inline',
  },
  {
    key: 'rule_codes',
    values: null,
    origin: 'no rule-code registry exists; every code is a string literal at its emission site',
  },

  // --- REQUIREMENT ---------------------------------------------------------
  {
    key: 'value_vocabularies.REQUIREMENT.origin',
    values: null,
    origin: '`origin` is not on the Requirement model and is not validated',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.level',
    values: REQUIREMENT_LEVELS,
    origin: 'REQUIREMENT_LEVELS (packages/diagrams/src/requirement/types.ts)',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.kind',
    values: REQUIREMENT_KINDS,
    origin: 'REQUIREMENT_KINDS (packages/diagrams/src/requirement/types.ts)',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.severity',
    values: null,
    origin: 'RequirementSeverity is a type-only union with no runtime array to validate against',
  },

  // --- ASSERTION -----------------------------------------------------------
  {
    key: 'value_vocabularies.ASSERTION.status',
    values: ASSERTION_STATUSES,
    origin: 'ASSERTION_STATUSES (packages/diagrams/src/assertion/types.ts)',
  },
  {
    key: 'value_vocabularies.ASSERTION.subject_type',
    values: ASSERTION_SUBJECT_TYPES,
    origin: 'ASSERTION_SUBJECT_TYPES (packages/diagrams/src/assertion/types.ts)',
  },

  // --- VERIFICATION / VALIDATION -------------------------------------------
  {
    key: 'value_vocabularies.VERIFICATION.method',
    values: VERIFICATION_METHODS,
    origin: 'VERIFICATION_METHODS (packages/diagrams/src/verification/types.ts)',
  },
  {
    key: 'value_vocabularies.VERIFICATION.outcome',
    values: VERIFICATION_OUTCOMES,
    origin: 'VERIFICATION_OUTCOMES (packages/diagrams/src/verification/types.ts)',
  },
  {
    key: 'value_vocabularies.VALIDATION.method',
    values: VALIDATION_METHODS,
    origin: 'VALIDATION_METHODS (packages/diagrams/src/validation/types.ts)',
  },
  {
    key: 'value_vocabularies.VALIDATION.outcome',
    values: VALIDATION_OUTCOMES,
    origin: 'VALIDATION_OUTCOMES (packages/diagrams/src/validation/types.ts)',
  },

  // --- Agreement axis ------------------------------------------------------
  {
    key: 'value_vocabularies.agreement',
    values: AGREEMENT_VALUES,
    origin: 'AGREEMENT_VALUES (packages/diagrams/src/agreement.ts)',
  },

  // --- Per-relation attributes ---------------------------------------------
  {
    key: 'value_vocabularies.target_state_satisfies_goal.degree',
    values: null,
    origin: 'relation attributes are not modelled here',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.sign',
    values: null,
    origin: 'relation attributes are not modelled here',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.magnitude',
    values: null,
    origin: 'relation attributes are not modelled here',
  },

  // --- Ingest candidate contract -------------------------------------------
  {
    key: 'value_vocabularies.candidate.kind',
    values: null,
    origin: 'the ingest candidate contract has no consumer in this repo',
  },
  {
    key: 'value_vocabularies.candidate.extraction_confidence',
    values: null,
    origin: 'the ingest candidate contract has no consumer in this repo',
  },

  // --- Rule severities -----------------------------------------------------
  {
    key: 'value_vocabularies.rule.severity',
    values: null,
    origin: 'ValidationSeverity is a type-only union with no runtime array to validate against',
  },
];

export function repoSurface(): RepoSurface {
  return { declaredMethodologyVersion: declaredMethodologyVersion(), bindings: BINDINGS };
}
