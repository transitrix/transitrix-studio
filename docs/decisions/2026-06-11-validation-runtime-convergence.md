---
status: accepted
date: 2026-06-11
scope: transitrix-studio
methodology_adr: docs/decisions/2026-06-11-validation-two-axis-model.md
supersedes: none
superseded_by: none
tags: [validation, validator, cli, lint, referential-integrity, archimate, tooling]
---

# Validation runtime convergence (Studio side)

## Context

The decision to converge the methodology's two validation runtimes onto a single
TypeScript stack is recorded — authoritatively — in the methodology repo:

> `methodology/docs/decisions/2026-06-11-validation-two-axis-model.md`
> ("Validation: converge on one runtime; `scope` as the one execution axis",
> accepted 2026-06-11, merged via transitrix/methodology#201).

That decision is **cross-repo but in-family**: it spans `methodology`
(`.validators/lint.py`) and `transitrix-studio` (`@transitrix/cli`,
`@transitrix/diagrams`). Per the family ADR rule, an in-family cross-repo
decision is recorded in **one** repo's `docs/decisions/` and the other repo
carries a short **referencing** ADR. This is that reference; it does not restate
the decision — read the methodology ADR for the rationale, the `scope` axis
definition, the deferred finding-reporting taxonomy, and the alternatives
considered.

## Decision

We adopt the methodology ADR as authoritative and record its Studio-side
consequence:

- **`@transitrix/cli` grows `validate --scope=repo`**, built on the shared
  `@transitrix/diagrams` model — referential integrity, ArchiMate
  layer-semantics, policy, and ID-uniqueness over the loaded repository model.
  The existing `validate <file>` (file scope) stays back-compatible.
- **`@transitrix/cli` becomes the single validation runtime.** Once the
  TypeScript `repo`-scope path reaches parity with the Python checks, the
  methodology's `.validators/lint.py` is **retired at parity** — one parser, one
  source of truth for ID grammar / TYPE registry, one dependency for the
  onboarding Skill to scaffold.
- **Findings remain shaped `{scope, id, message}`.** The richer
  `target` / `category` taxonomy is deferred per the methodology ADR; this Studio
  work does not introduce it.

No adopter breakage in the interim: `lint.py` remains the whole-repo gate until
the TS path reaches parity.

## Consequences

- Implementation lands as the `--scope=repo` task tracked in
  [transitrix-studio#141](https://github.com/transitrix/transitrix-studio/issues/141),
  with parity measured against `lint.py` on the `acme_corp` reference fixture.
- `@transitrix/diagrams` is the home for the new repo-scope rule logic (per the
  Studio standing rule that validation logic lives in the library, consumed by
  the CLI and the extension).
- When parity is confirmed, retiring `lint.py` is a methodology-repo follow-up,
  not a Studio change.
