# Contributing

Pull requests welcome. Aim for minimal, reviewable chunks.

Before you open a PR:

- Restate the goal and constraints; keep unrelated refactors out of the diff.
- If something is ambiguous, resolve it with maintainers rather than guessing.
- If you must assume undocumented behaviour, spell out those assumptions in the PR description.

After changes that touch compilation or layout, run **`npm test`**.

Skim **[`docs/repo-layout.md`](docs/repo-layout.md)** for a directory-level map of the repository (core vs editors vs polyglot backends, specs, examples).

See [`roadmap.md`](roadmap.md) for planned work IDs (`roadmap: RD-XXX`).

## Web UI vs "mandatory chrome" (`roadmap`: RD-043)

The file-prep web app under **`ui/`** (served by `cervin serve`) is intentionally minimal: a header with actions, an optional layout drawer, a YAML pane, a BPMN preview, and a single **status** line in the footer. It does not implement a full status bar with user/DB/AI blocks, LED-style indicators, or dedicated system log. The footer is the only system feedback channel for compile/export state.

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
node scripts/debug/analyze-metrics.mjs examples/bpmn/feature-release.cervin.yaml
node scripts/debug/debug-ports.mjs examples/bpmn/feature-release.cervin.yaml
```

These are intended for development only. Not for end-user consumption.

## Licensing

By submitting a pull request, you agree that your contribution is licensed under the project's MIT License (see [LICENSE](LICENSE)) on the same terms as the project itself (inbound = outbound), and that you have the right to submit it (no employer or third-party rights conflict).
