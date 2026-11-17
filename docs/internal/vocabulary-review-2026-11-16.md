# Vocabulary exception review — 2026-11-16

This review retains the **22 existing divergence keys**, with a next review date
of **2026-11-30** (the check fails from that date). It corrects stale explanations;
it does not add an exemption, change accepted model input, or assert full
Methodology 3.3.0 conformance. Migration remains per module when that module is
touched, as described in `tests/vocabulary-drift/surface.ts`.

## Comparison contract

The checked-in `vendor/methodology/VENDORED.json` pins `transitrix/methodology`
`v3.3.0`, `notations/vocabulary.yaml`, SHA-256
`48498d79106b22d95229862e628aef083a51842c3475d01f0cb06e686eb48d87`.
The declared Studio target in `package.json` remains `3.1.0`. This is a comparison
against that pinned artefact, not a live comparison against the latest release.
Changing either pin or declared support requires its own compatibility review.

## Disposition of every key

Keys below omit only their common `element_types:` or `value_vocabularies:`
prefix where indicated. Every row is retained until its resolution condition
is met; none is resolved merely by this renewal.

| Keys | Current evidence and resolution condition |
| --- | --- |
| `methodology_version:mismatch` | `package.json` declares 3.1.0; the pinned artefact declares 3.3.0. Keep the real support declaration; resolve only after version-coverage review. |
| `element_types:missing:NEED`, `element_types:missing:METRIC`, `element_types:missing:RISK` | Standalone validators exist in `src/validators/{need,metric,risk}.ts`, but `REGISTERED_ELEMENT_TYPES` in `packages/diagrams/src/blocks/validate.ts` omits all three. Adding them changes block-reference validation and needs compatibility tests. |
| `element_types:missing:RELEASE` | Absent from the block registry; generic repository projection is not a dedicated release validator. Resolve with explicitly tested block/validation support. |
| `element_types:missing:INFORMATION_ENTITY` | The pinned artefact retains this deprecated alias, but the block registry does not recognise it. An alias-support decision or reviewed vendor refresh is needed; time passing cannot change the pinned bytes. |
| `element_types:extra:HAZARD`, `element_types:extra:RISK_CONTROL`, `element_types:extra:REL`, `element_types:extra:MILESTONE`, `element_types:extra:VERIFICATION` | All five are accepted by the block registry and absent from the pinned TYPE inventory. `REL` is a relation record prefix; VERIFICATION has standalone support; MILESTONE has activity-card consumers. Removing any changes accepted references. Review registry responsibilities and supported consumers before removal. |
| `value_vocabularies.ASSERTION.status:extra:pending_owner` | `assertion/types.ts`, compliance classification, impact aggregation and coverage metrics consume this status. The pin does not define it. Preserve existing models; resolve by reviewed vocabulary adoption or an explicit compatible migration. |
| `value_vocabularies.REQUIREMENT.origin:unbound` | `compliance/types.ts` models the three values and `compliance/classify.ts` filters them inline. The standalone `requirement/types.ts` and validator do not implement origin, and no shared runtime constant exists. The old claim that the field was wholly unmodelled was incorrect. Resolve by binding an actual shared consumer constant and reviewing standalone coverage. |
| `value_vocabularies.REQUIREMENT.severity:unbound` | `requirement/types.ts` has a type-only high/medium/low union; the compliance classifier retains a string. A copied test-only array would hide drift. Resolve by a runtime constant used by the product, preserving existing input behaviour. |
| `value_vocabularies.rule.severity:unbound` | `src/validator-types.ts` defines error/warning/info, while the artefact also has deprecation; repository findings use error/warning. Resolve with an explicit severity policy and runtime bindings across those consumers. |
| `value_vocabularies.target_state_satisfies_goal.degree:unbound`, `value_vocabularies.assessment_influences_goal.sign:unbound`, `value_vocabularies.assessment_influences_goal.magnitude:unbound` | No shared enum consumer validates these attributes in `src/validators/relation.ts`; generic relation projection is not enum support. Resolve by a scoped relation-attribute contract with compatibility tests. |
| `value_vocabularies.candidate.kind:unbound` | No shared ingest-candidate kind consumer or runtime constant exists. Resolve if a concrete candidate consumer is introduced, not by adding unused constants. |
| `value_vocabularies.candidate.extraction_confidence:unbound` | `repo-validate/check-candidate-fields.ts` rejects the field on admitted canon elements via ADMIT-009, regardless of value. That is not validation of the candidate high/medium/low enum. Resolve with an actual candidate-schema consumer; preserve the existing canon prohibition. |
| `relation_types:unbound` | `src/validators/relation.ts` has a private KINDS set of 31 values; repo graph checks cover selected kinds. The former explanation that no registry exists was inaccurate. Binding this local set is possible, but replaces one unbound gap with 11 explicit extras against the pin. Review those keys and registry scope separately rather than declaring parity. |
| `rule_codes:unbound` | BPMN `ValidatorRegistry` in `src/validator.ts` and `requirement-advisories` RULES expose local inventories. There is no complete cross-notation methodology-code inventory. Resolve with a comprehensive binding; a local subset cannot stand for the whole surface. |

## Verification and next review

Run `npx --no-install vitest run tests/vocabulary-drift.test.ts`. It verifies the
vendor hash and metadata, complete vocabulary accounting, the exact live key
inventory, absence of stale exemptions, reasons, unique keys and expiry. New
or resolved divergence keys still fail; the expiry assertion is unchanged.
Run the normal core suite as well before merging.

At the next review, remeasure all keys and check the listed consumer paths;
delete resolved entries and reject unexplained new drift. Renew unresolved
entries only with fresh evidence. This document records a compatibility debt
review, not a commitment that the full migration will finish by the review date.
