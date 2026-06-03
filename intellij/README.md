# Transitrix Studio — IntelliJ IDEA plugin (MVP)

Read-only previews of Transitrix notations inside IntelliJ IDEA, parallel to
the existing VS Code extension under [`../extension/`](../extension/).

The rendering and validation technology choice is recorded in
[`../docs/adr/0001-intellij-mvp-tech-choice.md`](../docs/adr/0001-intellij-mvp-tech-choice.md).

This subdirectory is the **first PR of the implementation plan from the ADR
(step 1)**: it scaffolds an empty Gradle plugin project with a placeholder
preview action that proves the plugin manifest loads in a running IDE.

The next PRs land the actual previews:

- Step 2 — make `@transitrix/diagrams` browser-safe and produce the
  esbuild-bundled webview JS.
- Step 3 — wire the JCEF preview (`JBCefBrowser`) and ship the first notation
  (goals) end-to-end.
- Step 4 — extend to the remaining ten notation suffixes and the validation
  error panel.
- Step 5 — Gradle `buildPlugin` packaging into a distributable `.zip`.

## Build path isolation

The Gradle build under `intellij/` is **fully isolated** from the repo's Node
toolchain. The root `package.json` does not reference Gradle and this build
does not invoke `npm` / `tsc` / the extension prep pipeline. Each ships its
own versioned artifact (`.vsix` from `extension/`, `.zip` from here).

## Bootstrapping the Gradle wrapper

The Gradle wrapper jar is intentionally not committed (binary artifact, easy
to regenerate). On first checkout, run once:

```sh
gradle wrapper
```

After that, `./gradlew runIde` opens a sandbox IDE with the plugin loaded.

## Versioning

The plugin version lives in `gradle.properties` (`pluginVersion`) and is
**independent** of the VS Code extension's `package.json` version, per the
ADR — the two artifacts ship on their own cadences.

## Status

Scaffolding only. The placeholder action shows an info dialog on right-click
of a Transitrix notation file; no JCEF, no rendering, no validation surface
yet. Follow the epic [`vkgeorgia/strategy#135`](https://github.com/vkgeorgia/strategy/issues/135)
for the next PRs.
