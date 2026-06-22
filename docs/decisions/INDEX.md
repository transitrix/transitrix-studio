# Transitrix Studio Decision Records — index

Repo-scoped Architecture Decision Records for Transitrix Studio, in the family
dated form `YYYY-MM-DD-<slug>.md` with `status` / `date` / `scope` front-matter.
Some decisions **reference** an authoritative ADR in another in-family repo
(e.g. `methodology`) rather than restating it — see the `methodology_adr`
front-matter key on those records.

Earlier numbered records live alongside in [`../adr/`](../adr/) and remain valid;
new ADRs are dated and land here.

`status` values: **proposed** (direction not yet gated) · **accepted** (decided;
implementation PRs follow) · **superseded** (replaced by a later ADR).

| Date | Decision | Status | Scope |
|---|---|---|---|
| 2026-06-11 | [Validation runtime convergence (Studio side)](2026-06-11-validation-runtime-convergence.md) | accepted | transitrix-studio |
| 2026-06-14 | [Migrate CLI: recipe-source transport](2026-06-14-migrate-recipe-source.md) | accepted | hub #201 |
| 2026-06-22 | [A package home for the BPMN core](2026-06-22-bpmn-core-package-home.md) | accepted | transitrix-studio |
| 2026-06-22 | [A custom cross-functional process-diagram renderer](2026-06-22-custom-process-renderer.md) | proposed | transitrix-studio |
