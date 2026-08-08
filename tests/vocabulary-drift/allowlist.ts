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

/** Shared review date for the divergences this check found on its first run —
 *  they were measured together and are re-measured together. */
const FIRST_RUN = '2026-11-08';

export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    key: 'methodology_version:mismatch',
    review_by: FIRST_RUN,
    reason:
      'The declared version is the methodology release this build targets, not the newest that exists. ' +
      'The artefact first ships in a release later than that target, so the vendored copy is necessarily ' +
      'ahead until the rule and vocabulary coverage of the intervening releases lands here.',
  },

  // --- element_types: TYPEs the artefact defines and this repo does not ------
  {
    key: 'element_types:missing:NEED',
    review_by: FIRST_RUN,
    reason: 'NEED is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:METRIC',
    review_by: FIRST_RUN,
    reason: 'METRIC is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:RISK',
    review_by: FIRST_RUN,
    reason: 'RISK is modelled and validated here but is not in the block-grid TYPE registry.',
  },
  {
    key: 'element_types:missing:RELEASE',
    review_by: FIRST_RUN,
    reason: 'RELEASE arrived with a methodology release later than the one this build targets.',
  },
  {
    key: 'element_types:missing:INFORMATION_ENTITY',
    review_by: FIRST_RUN,
    reason:
      'Retired name kept in the artefact for its alias window; this repo never registered it, so there is ' +
      'nothing here to warn on. Resolves when the alias window closes.',
  },

  // --- element_types: TYPEs this repo registers and the artefact does not ----
  {
    key: 'element_types:extra:HAZARD',
    review_by: FIRST_RUN,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:RISK_CONTROL',
    review_by: FIRST_RUN,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:REL',
    review_by: FIRST_RUN,
    reason: 'The relation-record id prefix, not an element TYPE — the registry conflates the two.',
  },
  {
    key: 'element_types:extra:MILESTONE',
    review_by: FIRST_RUN,
    reason: 'Registered for cross-reference resolution in block grids; not a registered TYPE in the artefact.',
  },
  {
    key: 'element_types:extra:VERIFICATION',
    review_by: FIRST_RUN,
    reason:
      'VERIFICATION is a modelled element here with its own notation, but the artefact does not register it ' +
      'as an element TYPE.',
  },

  // --- value vocabularies ----------------------------------------------------
  {
    key: 'value_vocabularies.ASSERTION.status:extra:pending_owner',
    review_by: FIRST_RUN,
    reason: 'A status this repo renders and admits that the artefact does not define.',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.origin:unbound',
    review_by: FIRST_RUN,
    reason: '`origin` is scaffolded but not modelled or validated; binding it means adding the field first.',
  },
  {
    key: 'value_vocabularies.REQUIREMENT.severity:unbound',
    review_by: FIRST_RUN,
    reason: 'Type-only union; binding it means promoting it to a runtime array at the same time.',
  },
  {
    key: 'value_vocabularies.rule.severity:unbound',
    review_by: FIRST_RUN,
    reason:
      'The severity ladder here stops at error/warning/info and is a type-only union; binding it means ' +
      'promoting it to a runtime array and deciding what `deprecation` means for this repo.',
  },
  {
    key: 'value_vocabularies.target_state_satisfies_goal.degree:unbound',
    review_by: FIRST_RUN,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.sign:unbound',
    review_by: FIRST_RUN,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.assessment_influences_goal.magnitude:unbound',
    review_by: FIRST_RUN,
    reason: 'Per-relation attributes are not modelled here; binding follows a relation model.',
  },
  {
    key: 'value_vocabularies.candidate.kind:unbound',
    review_by: FIRST_RUN,
    reason: 'The ingest candidate contract has no consumer here; it may never need one.',
  },
  {
    key: 'value_vocabularies.candidate.extraction_confidence:unbound',
    review_by: FIRST_RUN,
    reason: 'The ingest candidate contract has no consumer here; it may never need one.',
  },

  // --- whole sets with no expression here ------------------------------------
  {
    key: 'relation_types:unbound',
    review_by: FIRST_RUN,
    reason:
      'Relation kinds are handled by an inline branch in repo-scope validation rather than a registry, so ' +
      'no constant can be compared. Binding means introducing the registry.',
  },
  {
    key: 'rule_codes:unbound',
    review_by: FIRST_RUN,
    reason:
      'Rule codes are string literals at their emission sites with no registry to compare. Binding means ' +
      'introducing one, which is a change of a different size from this check.',
  },
];
