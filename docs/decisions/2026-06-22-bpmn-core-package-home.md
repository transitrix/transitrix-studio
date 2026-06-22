---
status: proposed
date: 2026-06-22
scope: transitrix-studio
supersedes: none
superseded_by: none
tags: [bpmn, compiler, packaging, monorepo, extension, cli, refactor, review-E]
---

# A package home for the BPMN core

## Context

The BPMN compile/layout/emit/validate core lives in the repo-root `src/` tree
(~25 modules: `compiler.ts`, `emitter.ts`, `layout.ts`, `parser.ts`,
`validator.ts`, `validator-types.ts`, `ir.ts`, `metrics.ts`,
`metrics-geometry.ts`, `layout-options.ts`, `schema-path.ts`,
`validate-notation.ts`, `transitrixrc.ts`, …). Unlike the custom-notation
rendering and validation — which already has a clean package home in
`@transitrix/diagrams` (`packages/diagrams/`) and, after the review-D work, is
consumed by every host via package-entry imports (`@transitrix/diagrams/…`) —
the BPMN core has **no package** and is reached three different ways:

- **CLI** (`@transitrix/cli`, `src/cli.ts`) — imports the core directly as
  same-program TypeScript.
- **VS Code extension** — does **not** import the core. `extension/src/extension.ts`
  `loadCompiler()` does a runtime `import()` of `<extensionPath>/compiler/compiler.js`,
  an ESM bundle produced by `scripts/build-compiler-bundle.mjs` (esbuild over
  `src/compiler.ts` + `src/metrics.ts`, with the runtime npm deps marked
  *external* and installed separately into `extension/node_modules/`). The
  preview class only ever sees an injected `CompileFn`.
- **`ui/`** (the `serve-ui` dev surface) — imports the core via relative
  `../src/…` paths.

This is the last unresolved item from the 2026-06-21 architecture review
(review-E; review-D removed the analogous deep-import / dynamic-import workarounds
for `@transitrix/diagrams`). The standing Studio rule is that shared logic lives
in a library consumed by the CLI and the extension (see
[`2026-06-11-validation-runtime-convergence.md`](2026-06-11-validation-runtime-convergence.md)),
and the BPMN core is the one shared surface that does not yet follow it.

### Why this is worth fixing

- **Three consumption paths, one of them indirect.** The extension reaches the
  core only through a bespoke bundle + dynamic `import()` by filesystem path —
  there is no type-checked import edge from the extension to the compiler, so a
  breaking change in the core surfaces at runtime in the packaged VSIX, not at
  `tsc` time.
- **`rootDir: src` friction.** `export-compliance.ts` already documents that the
  root emit build (`tsconfig.build.json`, `rootDir: src`) cannot emit files that
  import `@transitrix/diagrams` *source*, which is why that one handler is loaded
  by a runtime dynamic import too. A proper package boundary removes the
  `rootDir` gymnastics.
- **Inconsistent with review-D.** Every other shared surface is now imported by
  package entry. The BPMN core is the exception.

### What a package home would *not* fix

The extension bundles the compiler and ships the runtime deps in
`extension/node_modules/` partly because some deps (notably `ajv`,
`bpmn-moddle`) use dynamic `require` patterns esbuild cannot inline. A package
boundary does not remove that constraint — the installed VSIX would still need
those packages resolvable at runtime. So the migration is about **a clean,
type-checked import edge and a single source of truth**, not about deleting the
bundling step wholesale. This is called out so the eventual implementation PR
does not over-promise.

## Decision

**This ADR records direction only — no code moves here. Status is `proposed`;
Valerii gates the move and its release timing.**

Adopt a **dedicated workspace package `@transitrix/bpmn-core`** (under
`packages/bpmn-core/`) as the home for the BPMN compile/layout/emit/validate
core, mirroring the structure and packaging conventions of
`@transitrix/diagrams`.

Rationale for a *separate* package rather than folding into
`@transitrix/diagrams`:

- The two are different domains. `@transitrix/diagrams` is rendering +
  validation for the Transitrix custom notations (goals, blocks, FGCA, …);
  the BPMN core is YAML→BPMN-2.0 compilation, layout, and conformance. Their
  dependency footprints differ (BPMN pulls `bpmn-moddle` and the layout engine).
- Keeping them separate preserves the clean boundary review-D established and
  avoids bloating the published `@transitrix/diagrams` with compiler-only deps.

### Migration plan (phased, non-breaking)

| Phase | Work | Breaking? |
|-------|------|-----------|
| **P0 — this ADR** | Record the target home + plan. No code change. | no |
| **P1 — scaffold package** | Create `packages/bpmn-core/` (package.json with the same `exports` map style as `@transitrix/diagrams`, tsconfig, vitest). No moves yet. | no |
| **P2 — move modules** | Move the core `src/` modules into `packages/bpmn-core/src/`, keeping module names. Update the CLI and `ui/` to import `@transitrix/bpmn-core/…`. Keep thin re-export shims at the old `src/` paths for one minor so nothing breaks mid-flight. | no |
| **P3 — extension import edge** | Point `build-compiler-bundle.mjs` at the package entry, and (where the dynamic-require constraint allows) replace the path-based `import()` in `loadCompiler()` with a package-entry import so the extension→core edge is type-checked. Runtime-dep externalization stays as needed. | no |
| **P4 — retire shims** | Remove the `src/` re-export shims and the `rootDir`-driven dynamic import in `export-compliance.ts`. | internal only |

Acceptance for the overall move: the CLI, the extension, and `ui/` all reach the
BPMN core through `@transitrix/bpmn-core`; no consumer imports `../src/…` or a
filesystem-path bundle for *type-checked* code; `tsc` sees the extension→core
edge; the VSIX still builds and runs (PNG export, preview compile, validation
findings) unchanged.

## Consequences

- A new published-shape package joins the workspace; its version tracks the
  methodology release like `@transitrix/diagrams` (the `SCHEMA_VERSION` contract
  in [`../adr/0003-diagrams-schema-version-contract.md`](../adr/0003-diagrams-schema-version-contract.md)
  may be extended to cover it).
- The extension gains a type-checked dependency on the core: breaking changes
  fail at build time instead of in the installed VSIX.
- The packaging script still installs runtime deps into `extension/node_modules/`;
  the dynamic-import-of-bundle step is simplified, not necessarily removed.
- Until P4, both the package path and the legacy `src/` shims resolve, so the
  move is reversible at each phase and never lands as one big-bang PR.
