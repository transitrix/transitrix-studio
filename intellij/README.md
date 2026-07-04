# Transitrix Studio — IntelliJ IDEA plugin

Read-only previews of Transitrix notations inside IntelliJ IDEA, parallel to
the existing VS Code extension under [`../extension/`](../extension/).

The rendering and validation technology choice is recorded in ADR 0001
(IntelliJ MVP Technology Choice).

All five implementation steps from that ADR have landed:

1. Gradle plugin scaffold (this directory).
2. Browser-safe `@transitrix/diagrams` webview bundle
   (`scripts/build-webview-bundle.mjs`).
3. JCEF preview surface (`JBCefBrowser`) with the **goals** notation wired
   end-to-end.
4. Remaining ten notation suffixes + the validation error panel.
5. Distributable `.zip` packaging via Gradle `buildPlugin` (this README).

## Build path isolation

The Gradle build under `intellij/` is **fully isolated** from the repo's Node
toolchain. The root `package.json` does not reference Gradle and this build
does not invoke `npm` / `tsc` / the extension prep pipeline. Each ships its
own versioned artifact (`.vsix` from `extension/`, `.zip` from here).

The one seam between them is the bundled webview: `:syncWebviewBundle`
copies `packages/diagrams/dist/webview/transitrix-render.{js,css}` into the
plugin jar. Those files are produced by `node scripts/build-webview-bundle.mjs`
on the Node side. The packaging script below runs both steps in order so a
fresh checkout reaches a `.zip` with a single command.

## Bootstrapping the Gradle wrapper

The Gradle wrapper jar is intentionally not committed (binary artifact, easy
to regenerate). On first checkout, run once:

```sh
gradle wrapper
```

After that, `./gradlew runIde` opens a sandbox IDE with the plugin loaded.

## Packaging the distributable `.zip`

From the repo root:

```sh
node scripts/package-intellij-plugin.mjs
```

This:

1. Rebuilds the browser-safe `@transitrix/diagrams` bundle.
2. Invokes `:buildPlugin` (using `intellij/gradlew[.bat]` if present, else a
   system-installed `gradle`).
3. Prints the produced artifact path and install instructions.

The artifact lands at:

```
intellij/build/distributions/transitrix-intellij-<pluginVersion>.zip
```

Useful flags:

- `--skip-bundle` — reuse the existing `packages/diagrams/dist/webview/`
  outputs (faster iteration when only the Kotlin side changed).
- `--help` — full usage.

If you'd rather drive Gradle directly:

```sh
node scripts/build-webview-bundle.mjs
cd intellij
./gradlew buildPlugin --console=plain   # or `gradlew.bat` on Windows
```

## Installing in IntelliJ IDEA

Tested baseline: **IntelliJ IDEA Community 2024.2+** (JCEF-bearing IDE, per
`gradle.properties` `pluginSinceBuild = 242`). The `.zip` also installs into
Ultimate and the other JetBrains IDEs that satisfy the platform `sinceBuild`.

1. **Settings → Plugins**.
2. The ⚙ (gear) icon → **Install Plugin from Disk…**.
3. Pick the `transitrix-intellij-<version>.zip` produced above.
4. Restart the IDE when prompted.

Smoke-test:

1. Open any `*.goals.transitrix.yaml`, `*.dgca.transitrix.yaml`, etc.
   (the `examples/` directory at the repo root has one of every supported
   suffix).
2. Right-click in the editor → **Transitrix: Preview Notation**.
3. The JCEF preview should render the same SVG / catalogue the VS Code
   extension produces. Malformed input shows the validation error panel
   instead of crashing.

If the IDE lacks JCEF (rare on official 2024.2+ builds), the plugin surfaces
a clear error dialog rather than failing silently — see
`TransitrixPreviewDialog.kt`.

## Versioning

The plugin version lives in `gradle.properties` (`pluginVersion`) and is
**independent** of the VS Code extension's `package.json` version, per the
ADR — the two artifacts ship on their own cadences. Bump it by editing the
property; there's no shared bump script (the root `bump-extension-version.mjs`
deliberately touches only the VS Code side).

## Status

Available on the **JetBrains Marketplace** — install via **Settings → Plugins →
Marketplace** and search for *Transitrix Studio*. The from-disk `.zip` above
stays available for local builds and pre-release testing.

Still deferred (tracked under the epic):

- Editor-title parity with the VS Code extension.
- Auto-refresh on save outside the active preview.
- PNG export (resvg-js native binary path).

Follow epic [`vkgeorgia/strategy#135`](https://github.com/vkgeorgia/strategy/issues/135)
for any post-release work.
