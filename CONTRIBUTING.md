# Contributing

Pull requests welcome. Aim for minimal, reviewable chunks.

Before you open a PR:

- Restate the goal and constraints; keep unrelated refactors out of the diff.
- If something is ambiguous, resolve it with maintainers rather than guessing.
- If you must assume undocumented behaviour, spell out those assumptions in the PR description.

After changes that touch compilation or layout, run **`npm test`**.

Skim **[`docs/repo-layout.md`](docs/repo-layout.md)** for a directory-level map of the repository. Adopter-facing docs: [`docs/README.md`](docs/README.md). Maintainer runbooks: [`docs/internal/README.md`](docs/internal/README.md).

## Web UI vs "mandatory chrome" (`roadmap`: RD-043)

The file-prep web app under **`ui/`** (served by `transitrix serve`) is intentionally minimal: a header with actions, an optional layout drawer, a YAML pane, a BPMN preview, and a single **status** line in the footer. It does not implement a full status bar with user/DB/AI blocks, LED-style indicators, or dedicated system log. The footer is the only system feedback channel for compile/export state.

## File naming (`roadmap`: RD-039)

- Prefer **lowercase kebab-case** for new documentation assets, YAML examples, and helper shell scripts.
- **Exceptions:** customary root names **`README.md`**, **`CONTRIBUTING.md`**, **`LICENSE`**; Python modules use **`snake_case`** because they are import paths; **`package.json`** and similar ecosystem defaults stay as upstream expects.

## Developer tools — debug scripts

Debug and analysis utilities are located in **`scripts/debug/`**:

- **`analyze-metrics.mjs`** — Compute and display all layout quality metrics for a YAML diagram file.
- **`debug-elements.mjs`** — Dump element positions and boundaries after layout computation.
- **`debug-ports.mjs`** — Analyze port detection (exit/entry port classification) for each flow.
- **`debug-spine.mjs`** — Visualize spine deviation calculations and swimlane axis alignment.

**Usage:**
```bash
node scripts/debug/analyze-metrics.mjs tests/fixtures/notation-corpus/bpmn/feature-release.bpmn.transitrix.yaml
node scripts/debug/debug-ports.mjs tests/fixtures/notation-corpus/bpmn/feature-release.bpmn.transitrix.yaml
```

These are intended for development only. Not for end-user consumption.

## Notation file suffixes — use the canonical `*.transitrix.yaml`

New examples, fixtures, and corpus files **must** use the canonical Transitrix
suffixes — BPMN sources are `*.bpmn.transitrix.yaml`, other notations follow the
`*.<notation>.transitrix.yaml` pattern.

The legacy **`.cervin.yaml`** suffix is still *accepted* by the compiler and editor
for backward compatibility (see CLAUDE.md §Cervin naming), but is **deprecated** —
do not add new `.cervin.yaml` files. A CI guard (`npm run check:no-cervin-yaml`,
also run by the test workflow) fails the build if a new `*.cervin.yaml` file is
committed. Existing `.cervin.yaml` fixtures, where any remain, are kept only for
regression coverage and are not mass-renamed.

## Project config — use the canonical `.transitrixrc`

Project-level rule overrides (enabling/disabling validation rules) are read from a
**`.transitrixrc`** file at the project root. Its shape is the published JSON schema
[`schemas/transitrixrc.schema.json`](schemas/transitrixrc.schema.json); the rule-override
format is documented in [`docs/validation.md`](docs/validation.md).

The only override values are `"off"` (disable a rule; rejected for error-severity
conformance gates) and `"warn"` (enable a rule, e.g. an off-by-default one). An
override **only toggles whether a rule runs** — it does not change the rule's
built-in severity, so `"<RULE>": "warn"` does not demote an error to a warning.

The legacy **`.cervinrc`** filename is still read as a *fallback* when `.transitrixrc`
is absent (see CLAUDE.md §Cervin naming, P4), but is **deprecated** — `loadTransitrixrc()`
prints a one-time deprecation notice when it falls back, and `.cervinrc` support is slated
for removal in 2.0.0. Use `.transitrixrc` in new repos and **rename** any existing
`.cervinrc`; do not add new `.cervinrc` files. The legacy `schemas/cervinrc.schema.json`
is kept only for backward compatibility.

## Per-user display preferences

The `.transitrix/display-preferences/` folder is the designated home for **per-user,
local** display preferences (lane toggles, decoration preferences for diagram previews
such as the Process Blueprint compliance lane).

The folder is tracked by `.transitrix/display-preferences/.gitkeep` so its location
is defined in the repo and every contributor has it; its *contents* are `.gitignore`d
and **never committed**. Each contributor keeps their own preference files locally
without affecting others.

Naming convention for preference files (all `.json`): one file per notation, e.g.
`process-blueprint.json`. The exact schema is determined by the tooling layer; there
is no enforced schema in v0.1. See ADR 0002 for the compliance-lane toggle.

## Licensing

By submitting a pull request, you agree that your contribution is licensed under the project's MIT License (see [LICENSE](LICENSE)) on the same terms as the project itself (inbound = outbound), and that you have the right to submit it (no employer or third-party rights conflict).
