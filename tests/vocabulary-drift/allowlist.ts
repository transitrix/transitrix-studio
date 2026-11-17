// Time-boxed allowlist for vocabulary drift.
//
// Every entry names a date by which it is resolved or renewed, and the check
// fails once that date passes — an undated allowlist is the silent gap this
// check exists to remove, reintroduced one entry at a time. An entry narrows the
// check to exactly one divergence key; there is no way to exempt a whole
// vocabulary or the whole check.
//
// A stale entry (one whose divergence no longer occurs) also fails, so the file
// cannot accumulate resolved exemptions that read as outstanding work.
//
// Adding an entry is not the way to land a vocabulary change. It is the way to
// land the *check* over a gap that already exists, so the gap stops widening
// while each module migrates on contact.

export interface AllowlistEntry {
  /** Divergence key, exactly as `divergenceKey()` produces it. */
  key: string;
  /** ISO date; the check fails from this date on. */
  review_by: string;
  reason: string;
}

/** Next review of the unchanged 22 divergence keys, audited on 2026-11-16.
 *  Evidence and resolution conditions: docs/internal/vocabulary-review-2026-11-16.md.
 *  New or stale divergences still fail; no runtime vocabulary is changed. */
const NEXT_REVIEW = '2026-11-30';

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    key: 'methodology_version:mismatch',
    review_by: NEXT_REVIEW,
    reason:
      'The declared version is the methodology release this build targets, not the newest that exists. ' +
      'The artefact first ships in a release later than that target, so the vendored copy is necessarily ' +
      'ahead until the rule and vocabulary coverage of the intervening releases lands here.',
  },

  // --- element_types: TYPEs the artefact defines and this repo does not ------
  {
    key: 'element_types:missing:NEED',
    review_by: NEXT_REVIEW,
    reason: 'NEED is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:METRIC',
    review_by: NEXT_REVIEW,
    reason: 'METRIC is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:RISK',
    review_by: NEXT_REVIEW,
    reason: 'RISK is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:RELEASE',
    review_by: NEXT_REVIEW,
    reason: 'RELEASE remains absent from REGISTERED_ELEMENT_TYPES; its generic repo projection does not provide block-grid registration or complete release validation.',
  },
  {
    key: 'element_types:missing:INFORMATION_ENTITY',
    review_by: NEXT_REVIEW,
    reason:
      'The pinned artefact retains this deprecated alias, but the block-grid registry does not recognise it. ' +
      'Resolve by an explicit alias-support decision or a reviewed vendor refresh; the pinned bytes do not age out automatically.',
  },

  // --- element_types: TYPEs this repo registers and the artefact does not ----
  {
    key: 'element_types:extra:HAZARD',
    review_by: NEXT_REVIEW,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:RISK_CONTROL',
    review_by: NEXT_REVIEW,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:REL',
    review_by: NEXT_REVIEW,
    reason: 'The relation-record id prefix, not an element TYPE — the registry conflates the two.',
  },
  {
    key: 'element_types:extra:MILESTONE',
    review_by: NEXT_REVIEW,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:VERIFICATION',
    review_by: NEXT_REVIEW,
    reason:
      'VERIFICATION is a modelled element here with its own notation, but the artefact does not register it ' +
      'as an element TYPE.',
  },

  // --- value vocabularies ----------------------------------------------------
  {
    key: 'value_vocabularies.ASSERTION.status:extra:pending_owner',
    review_by: NEXT_REVIEW,
    reason: 'ASSERTION_STATUSES, validation and compliance rendering support pending_owner; the pinned 3.3.0 artefact does not. Removing it would change existing input and coverage behaviour.',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.origin:unbound',
    review_by: NEXT_REVIEW,
    reason: 'Compliance IndexRequirement and classify.ts model/filter the three origin values, but expose no shared runtime constant; standalone Requirement and validateRequirement still do not model/check origin.',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.severity:unbound',
    review_by: NEXT_REVIEW,
    reason: 'Type-only union; binding it means promoting it to a runtime array at the same time.',
  },
  {
    key: 'value_vocabularies.rule.severity:unbound',
    review_by: NEXT_REVIEW,
    reason:
      'The severity ladder here stops at error/warning/info and is a type-only union; binding it means ' +
      'promoting it to a runtime array and deciding what `deprecation` means for this repo.',
  },
  {
    key: 'value_vocabularies.target_state_satisfies_goal.degree:unbound',
    review_by: NEXT_REVIEW,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.sign:unbound',
    review_by: NEXT_REVIEW,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.magnitude:unbound',
    review_by: NEXT_REVIEW,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.candidate.kind:unbound',
    review_by: NEXT_REVIEW,
    reason: 'No ingest-candidate enum consumer or shared candidate-kind constant exists; admitting candidate kinds needs a separately scoped consumer contract.',
  },
  {
    key: 'value_vocabularies.candidate.extraction_confidence:unbound',
    review_by: NEXT_REVIEW,
    reason: 'ADMIT-009 rejects extraction_confidence on admitted canon elements, irrespective of its value; it does not implement the candidate confidence enum or provide a shared constant.',
  },

  // --- whole sets with no expression here ------------------------------------
  {
    key: 'relation_types:unbound',
    review_by: NEXT_REVIEW,
    reason:
      'src/validators/relation.ts has a private KINDS set, while repo graph checks cover selected kinds. ' +
      'There is no shared cross-consumer registry: binding the local set requires a separate review of its later-version extra kinds, not silently claiming vocabulary parity.',
  },
  {
    key: 'rule_codes:unbound',
    review_by: NEXT_REVIEW,
    reason:
      'BPMN ValidatorRegistry and requirement-advisory RULES expose local inventories, but no complete cross-notation methodology-code registry exists. ' +
      'A local subset must not stand for the whole supported rule surface.',
  },
];
