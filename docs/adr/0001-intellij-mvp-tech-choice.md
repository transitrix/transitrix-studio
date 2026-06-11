# ADR 0001 — IntelliJ IDEA extension MVP: rendering & validation technology

- **Status:** Proposed
- **Date:** 2026-06-02
- **Scope:** epic [vkgeorgia/strategy#135](https://github.com/vkgeorgia/strategy/issues/135) — IntelliJ IDEA extension MVP (read-only notation previews)
- **Supersedes / superseded by:** none

## Context

Transitrix notations currently ship in one IDE: the VS Code extension under `extension/`.
The methodology canon (notation semantics, validation rules, layout, theming) lives in
the shared `@transitrix/diagrams` TypeScript package under `packages/diagrams/`. The
VS Code extension imports that package and hosts each preview in a VS Code webview.

The new epic adds a second IDE — a standalone IntelliJ IDEA plugin — that must show
the *same diagrams* with the *same validation behaviour* on the *same example files*.
The strong prior in the epic is to reuse `@transitrix/diagrams` rather than
re-implement the notation semantics on the JVM, so methodology canon stays the single
source of truth across IDEs.

The remaining decision: **how does the JVM-hosted IntelliJ plugin run that JS/TS
library and present its output to the user?**

## Decision

The IntelliJ MVP plugin is built as follows.

1. **Plugin language / build system** — Kotlin sources, Gradle build, the
   **IntelliJ Platform Gradle Plugin v2** (`org.jetbrains.intellij.platform`). This
   is the JetBrains-recommended path as of 2024+ and the toolchain documented for
   plugin development against IntelliJ Platform 2023.x / 2024.x.

2. **Plugin lives in its own subdirectory** — a new top-level `intellij/` directory,
   sibling to `extension/` and `packages/diagrams/`. The Gradle build is isolated
   from the VS Code build path; the VS Code build never invokes Gradle and the
   Gradle build never invokes the VS Code tooling. Each ships its own versioned
   artifact (`.vsix` and `.zip`, respectively).

3. **Preview surface = JCEF webview.** IntelliJ ships with **JCEF** (JetBrains
   Chromium Embedded Framework) in 2020.2+ and exposes it via `JBCefBrowser`. JCEF
   is the JetBrains-supported way to render HTML/JS inside an IntelliJ tool window
   or editor panel. Each preview is a tool window or editor tab hosting a
   `JBCefBrowser`. On plugin startup the plugin calls `JBCefApp.isSupported()`; if
   the running IDE lacks JCEF the plugin surfaces a clear error and does not crash.

4. **Renderer = bundled `@transitrix/diagrams` JS, loaded into JCEF.** A new
   build step in `packages/diagrams/` (or a thin sibling package) produces a
   **browser-ready bundle** of `@transitrix/diagrams` plus a small entry script
   that exposes a `window.transitrix.render(notationKind, sourceText)` API. The
   bundle is built with `esbuild` (already implicitly available in the repo's
   Node toolchain) into a single self-contained JS file, plus a single CSS file
   for the theme. Both ship inside the IntelliJ plugin `.zip` under
   `resources/webview/`. JCEF loads a local `index.html` from the plugin jar via
   `JBCefBrowser.loadHTML(...)` or a custom `cef://` scheme; the bundle then
   parses and renders identically to the VS Code path. **No JVM-side
   re-implementation of notation semantics.**

5. **Plugin ↔ webview wire protocol.** When the user opens a `.transitrix.yaml`
   file and triggers the preview, the plugin reads the document text from the
   `Editor` / `Document` API, then invokes
   `jbCefBrowser.cefBrowser.executeJavaScript("window.transitrix.render(...)", ...)`
   with the notation kind (derived from the filename suffix) and the raw source.
   The bundle runs the existing validator first; on validation failure it
   renders the same red error panel the VS Code preview shows; on success it
   renders the SVG. The plugin does **not** post-process or interpret the
   rendered output — JCEF owns the visual side.

6. **MVP file activation.** The plugin registers `FileType`s (or relies on YAML
   detection) for the eleven supported suffixes that the VS Code extension lists
   in `extension/package.json` `activationEvents`. Triggering a preview is
   surfaced by a command palette action plus, optionally, a single editor-tab
   action — full editor-title button parity with VS Code is **deferred** per the
   epic's explicit out-of-scope list.

7. **Re-render on save.** The plugin subscribes to
   `FileDocumentManagerListener#beforeAllDocumentsSaving` (or
   `DocumentListener` on the active document) and reposts the new source to the
   open preview. Auto-preview-on-save **outside the active preview** is deferred.

8. **Versioning & packaging.** The IntelliJ plugin is versioned **independently**
   from the VS Code extension (it carries its own `version` in `plugin.xml`); a
   stub release script lives under `scripts/`. The MVP target is the published
   `.zip` artifact, not Marketplace publication.

## Why this, not the alternatives

| Alternative | Why we did not pick it |
|---|---|
| **Re-implement renderers in Kotlin/Java** (Swing or JavaFX paint code) | Forks the methodology canon. Every new notation, every BP-/REQ-/ASSERT- validation code, every theme update would need a second implementation. The shared library exists specifically to avoid this; the epic explicitly endorses reusing it. |
| **Compile `@transitrix/diagrams` to JVM via Kotlin Multiplatform / TeaVM / Kotlin/JS interop** | High risk for an MVP. The library uses Node-ish APIs (`fs.readFileSync` for schemas, ESM imports, `js-yaml`) — none of which translate cleanly. We get a worse renderer at much higher cost than running the same JS the VS Code extension runs. |
| **Native-side YAML parse on the JVM, only diagram SVG produced by JS** | Re-introduces a second YAML / validation path. Validation codes (REQ-001..003, ASSERT-001..008, FGCA codes, BP-001..011, ACT-001..008, etc.) would diverge over time. Single-source-of-canon is the whole point of the shared library. |
| **Mermaid / PlantUML / ArchiMate Exchange round-trip** | None of these renders Transitrix notations natively. We would still need our own renderer for goals/FGCA/FGA/activities/process-blueprint/etc. and would inherit a second formatting model. |
| **Embed a full Node runtime in the plugin** | Multi-OS native binaries, much larger plugin, no benefit over JCEF: the shared library is browser-safe pure JS once schema bundling is handled (one small refactor — moving `readFileSync(schema.json)` to a precomputed import). |

## Consequences

**Positive:**
- One renderer, one validator, one set of fixtures, one set of bug-fix surface
  area. A diagram change in `@transitrix/diagrams` lights up in both IDEs.
- Theme parity is free — same CSS, same SVG output.
- Hand-test corpus from the VS Code extension is reusable as-is.

**Costs / risks to acknowledge:**
- JCEF dependency: the plugin requires an IDE build with JCEF (IntelliJ IDEA
  2020.2+; Community + Ultimate both ship it). Users on the bare-bones IDE
  variants get a graceful error, not a preview. Documented in plugin
  description.
- The first build needs `@transitrix/diagrams` to be **browser-safe**: today the
  package reads JSON schemas via `fs.readFileSync`. A small refactor — replace
  with TS imports / `import schema from './x.json' assert { type: 'json' }`
  bundled in — is required before the JCEF bundle works. Tracked as a follow-up
  task on the epic, not done in this ADR PR.
- PNG export in the VS Code extension uses `@resvg/resvg-js`, a native module
  (see `docs/packaging.md`). The IntelliJ MVP is **read-only previews + SVG
  export only**; PNG export is deferred so the plugin stays platform-neutral
  (one `.zip` for all OSes).
- The JS bundle adds ~package size, but the alternative (native Chromium per OS)
  is worse: JCEF is shipped by the IDE, so the plugin only contributes the JS,
  not the browser.

## Build sequencing — depends on epic #28 M2

The **decision** above is unblocked and recorded now. The **build** is not: the
JCEF bundle consumes `@transitrix/diagrams`, so the plugin build is sequenced
**after epic [vkgeorgia/strategy#28](https://github.com/vkgeorgia/strategy/issues/28)
M2** — the milestone that makes `@transitrix/diagrams` a consumable, published
package. Until M2 lands:

- No build/consume work starts (only this ADR and, when ratified, the scaffold
  spike below).
- For an early spike, an **interim path / git dependency** on the in-repo
  `packages/diagrams/` is acceptable to prove the JCEF wire end-to-end; it is
  replaced by the published dependency once M2 ships. The interim path is a
  spike convenience, not the shipped MVP dependency.

## MVP scope — read-only previews, content-parity with the VS Code static previews

The IntelliJ MVP renders **read-only previews only** (no editing, no mutation).
Its content-parity target is the VS Code extension's **static previews** — the
ones hosted with `enableScripts: false` that render a diagram (and inline
validation badges / error panel) without interactive scripting. "Parity of
content" means the IDEA preview shows the *same rendered diagram and the same
validation outcome* for the same source file as the corresponding VS Code static
preview; it does **not** imply parity with the interactive (scripted) previews,
which are out of scope for the MVP. Because the renderer is the shared
`@transitrix/diagrams` bundle, this content parity is structural, not a
re-implementation to keep in sync.

## Implementation plan (out of scope for this ADR PR)

This ADR PR records the decision only. Subsequent PRs, each in its own
feature branch, against the same epic:

1. **Scaffold the Gradle plugin project** under `intellij/` (plugin.xml, build.gradle.kts, `IntelliJPlatform` setup, minimal "preview" action).
2. **Make `@transitrix/diagrams` browser-safe**: replace `readFileSync(schema)` with bundled imports; add an `esbuild`-driven `npm run build:webview-bundle` script producing `dist/webview/transitrix-render.js` + `transitrix-render.css`.
3. **Wire the JCEF preview**: load the bundle into a `JBCefBrowser`, call `window.transitrix.render(kind, source)`, ship the first notation (goals) end-to-end.
4. **Cover the remaining ten notation suffixes** and the validation-error panel.
5. **Package**: Gradle `buildPlugin` task producing a `.zip`; smoke-test installing into a clean IntelliJ IDEA Community Edition.

Each step is a separate PR per the repo's one-concern-per-PR convention. Valerii
gates every merge.

## Out of scope (deferred per epic)

- Full feature parity with the VS Code extension (editor-title buttons everywhere, auto-preview-on-save, per-extension activation events, command palette parity).
- Any editing / mutation features.
- Marketplace publication.
- PNG export (the resvg-js native-binary path).

## References

- Epic [vkgeorgia/strategy#135](https://github.com/vkgeorgia/strategy/issues/135).
- Rendering-approach ADR task [vkgeorgia/strategy#204](https://github.com/vkgeorgia/strategy/issues/204).
- `@transitrix/diagrams` publish milestone: epic [vkgeorgia/strategy#28](https://github.com/vkgeorgia/strategy/issues/28) M2.
- Shared rendering library: `packages/diagrams/`.
- VS Code preview infrastructure for cross-reference: `extension/src/` and `extension/package.json` `activationEvents`.
- Packaging trade-off precedent (native binaries vs. universal artifact): `docs/packaging.md`.
- IntelliJ Platform Gradle Plugin v2: <https://plugins.jetbrains.com/docs/intellij/tools-intellij-platform-gradle-plugin.html>.
- JCEF in IntelliJ: <https://plugins.jetbrains.com/docs/intellij/jcef.html>.
