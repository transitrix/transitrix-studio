# 2026-06-14 — Migrate CLI: recipe-source transport

- **Status:** accepted
- **Date:** 2026-06-14
- **Scope:** `transitrix migrate` CLI subcommand
- **Supersedes / superseded by:** none

## Context

The `transitrix migrate` CLI orchestrates migration recipes that live in the
methodology repo. Acceptance criterion 3 requires recipes to be "pinned to a
version (not floating `main`)." Three transport options were evaluated:

1. **`--recipes <dir>` flag**, defaulting to `../methodology/migrations` —
   decouples the CLI from transport; the caller supplies (or defaults to) a
   local checkout. Matches the `scripts/sync-examples-from-methodology.mjs`
   convention already used in this repo.
2. **Git submodule** pinned to a methodology tag — heavier; touches
   release-wiring that the issue gates to Valerii; requires a tag to exist.
3. **Vendored copy** — recipes bundled into the npm CLI package at a recorded
   methodology version, synced in by a separate step. Self-contained for
   npm-installed users; adds a vendor/sync mechanism to own.

The methodology side rejected submodule/subtree (methodology PR #216).

## Decision

Use **option 1**: a `--recipes <dir>` flag, defaulting to
`../methodology/migrations`.

- The CLI is reviewable and fully tested against the `0.5-to-0.6/fixtures`
  without any transport dependency.
- Version-pin is satisfied at the data level: the CLI reads `methodology_version`
  from the adopter's `transitrix.yaml`, cross-checks it against the recipe
  chain, and writes the new version back on success — migration is always
  traceable.
- The `--recipes` flag is the development/override escape hatch; it is not the
  production path for an npm-installed CLI.

## Consequences

**Short term (this PR):** development users with a sibling `../methodology`
checkout can run migrations. The integration test uses that path.

**Production transport (deferred, release-wiring gate):** an npm-installed CLI
has no sibling checkout. The correct production path is **vendored** — recipes
bundled into the CLI package at a recorded methodology version (option 3). That
step is a separate release-wiring task, gated by Valerii, and out of scope for
this PR.

A git submodule/subtree approach is explicitly ruled out by the methodology side.
