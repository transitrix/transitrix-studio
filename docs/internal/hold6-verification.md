# Hold 6 verification — per-notation surface pass, PNG comparison

Status: **complete.** Every preview/export surface passes against the packaged
universal VSIX (by hash, not a source rebuild), and the PNG old-vs-new engine
comparison has run and is recorded. This document records what was built, what
was run, and what it found — honestly, not as a green checklist asserted without
evidence.

**2026-08-14 update — clean per-notation pass exists, from CI.** CI's first real
run on `ubuntu-latest` under `xvfb-run` (a host with a real, if virtual, attached
display) produced **28/28 surfaces passing**, both suites
(`preview-surfaces.test.ts`, `png-export.test.ts`), merged via
transitrix-studio#535. Root cause of the earlier 0-panels failures was a loader
mismatch, not a display/session property (see "A refuted theory" below, kept as a
record — not current status).

**2026-08-14 update — packaged-VSIX wiring and PNG comparison tooling added.**
Hold 5a (transitrix-studio#538, part of the universal-VSIX epic) landed a reusable CI job
that builds, hashes, and attests the universal VSIX. This gives hold 6 something
to verify *by hash* instead of a source rebuild — the artefact that gets verified
now has to be the artefact that ships. `.github/workflows/extension-e2e.yml` was
restructured to build that artefact, verify the downloaded copy's SHA-256 against
the build job's recorded hash, unpack it, and run the e2e suite against the
unpacked `extension/` (not `extensionDevelopmentPath` pointed at source) — see
"Packaged-VSIX wiring" below. A new `scripts/compare-png-engines.mjs` (added this
session, CI-wired as the `png-comparison` job) supplies the old-engine side of the
PNG comparison. Both are new as of this update.

**2026-08-14 update — CI ran: 27/28 passing, one known failure, fix pending
merge.** See "What's still open" item 1 for detail: the failure was
`transitrix-studio#540` (unmerged, based on `main`), not a new bug. PNG
comparison stayed unrun as a result — item 2.

**2026-08-15 update — #540 merged, e2e green 28/28, PNG comparison run.**
transitrix-studio#540 (static `import` of `ajv`/`ajv-formats`) merged to `main`;
this PR's branch merged `main` and CI re-ran clean on
[run 31873022143](https://github.com/transitrix/transitrix-studio/actions/runs/31873022143):

- **Artifact:** `sha256:10180618656e7411888806c9527995e1242814b0ed704099d8d6359d5fc2c86a`
- **e2e (packaged VSIX):** 28/28 surfaces passing, including the `bpmn (custom
  process renderer, default)` case that failed on the prior run.
- **PNG comparison** (packaged VSIX vs. the tag-`v3.1.3` rasterizer rebuild —
  see "What's still open" item 2 for why this is the baseline, not a published
  binary): `goals` 1.332% pixels differ (21804/1636720, 1996×820), `blocks`
  0.844% (20678/2450720, 2312×1060), `plantuml` 0.072% (152/211464, 534×396).
  All three are within the range expected from the two engines' different SVG
  rasterizers (resvg/usvg vs. the webview Chromium canvas) — font hinting and
  anti-aliasing differ between them by construction; no divergence beyond that
  was found. Full diff images in the `png-engine-comparison` build artifact on
  that run.

transitrix-studio#539 merged with this state — hold 6's acceptance criteria are
met. transitrix-hq#143 closes on this.

## The harness

`extension/test-e2e/` (`npm run test:e2e-extension` locally against source, or
`npm run test:e2e-extension:packaged` against an unpacked `.vsix` — see below)
launches a real VS Code Extension Development Host via `@vscode/test-electron`
and drives it through mocha:

- `suite/preview-surfaces.test.ts` — opens the fixture for every notation/document
  surface the extension previews (goals, DGCA, DGA, action, blocks, applications,
  products, process-map, scenarios, capability-map, process-blueprint,
  coverage-metric, compliance-impact, single-law, single-product,
  requirement-trace, BPMN ×2 renderers, PlantUML, `.ttrs` ×2, compliance matrix,
  gap dashboard — 25 cases) through the same auto-open-on-active-editor path a
  human triggers by clicking a file, and asserts the webview actually rendered
  non-trivial content (`<svg>` present where expected, HTML past an empty-shell
  length floor, no unexpected error/warning notifications).
- `suite/png-export.test.ts` — exercises the real `Save .png` command for goals,
  blocks, and PlantUML through the same `showSaveDialog` → webview-canvas
  rasterizer → `workspace.fs.writeFile` path a human triggers from the toolbar,
  asserts a real non-empty PNG is written, and captures the exact SVG payload
  handed to the rasterizer (for the old-vs-new comparison below).

## Packaged-VSIX wiring

`runTest.ts` now reads `TX_E2E_EXTENSION_PATH`: if set, it points
`extensionDevelopmentPath` at that path instead of the source `extension/` tree.
`.github/workflows/extension-e2e.yml`'s `e2e` job:

1. Calls `build-vsix.yml` (`workflow_call`) to produce the attested universal VSIX
   and its recorded SHA-256.
2. Downloads that build artifact and independently re-hashes the downloaded file,
   failing the job if it doesn't match the build job's own recorded hash — the
   artifact consumed is verified to be the one produced, not assumed.
3. Unpacks the `.vsix` (a zip; the extension's own files live under its
   `extension/` entry) and sets `TX_E2E_EXTENSION_PATH` to the unpacked
   `extension/` directory.
4. Runs `npm run test:e2e-extension:packaged` — same mocha suites, same
   assertions, but exercising the shipped bundle rather than a source rebuild.

Local source-based runs (`npm run test:e2e-extension`) are unaffected — the env
var is unset by default, so `extensionDevelopmentPath` falls back to source.

## A real bug found and fixed

Running the harness surfaced a genuine race in ~15 preview classes
(`dgca-preview.ts` ×2, `single-law-preview.ts`, `single-product-preview.ts`,
`requirement-trace-preview.ts`, `action-preview.ts`, `actions-tree-preview.ts`,
`activity-card-preview.ts`, `applications-preview.ts`, `capability-map-preview.ts`,
`coverage-metric-preview.ts`, `gap-dashboard-preview.ts`, `goals-preview.ts`,
`plantuml-preview.ts` ×2, `preview.ts`, `process-blueprint-preview.ts`,
`process-preview.ts`, `ttrs-preview.ts`): each guards `if (!this.panel) return;`
once at entry, then awaits canon-scanning/parsing work, then writes
`this.panel.webview.html = …` (or `.postMessage(…)`) without re-checking that the
panel is still open. If the panel is disposed while that await is in flight — a
user closing the tab mid-render, or (as the harness's own `afterEach` does)
closing all editors — the write throws (`Cannot read properties of undefined
(reading 'webview')`, or `Webview is disposed` for the `this.panel.webview.html =
await …` single-statement form) instead of silently no-oping. Fixed by
re-checking `this.panel` immediately before every such write (transitrix-studio#529).
This is a production defect independent of the test harness — a real user closing
a preview mid-render hits the same throw.

## A refuted theory (kept as a record, not current status)

An earlier session diagnosed the harness's "0 panels" failures as a property of
this unattended host: the automation account's Windows session showed as
`Disc` (disconnected), with no attached input desktop, which looked consistent
with the Electron test window never gaining real focus/window state. That
diagnosis was **wrong** — CI's first real run on `ubuntu-latest`/`xvfb-run` hit the
identical 0-panels symptom, including for direct-command surfaces that bypass the
auto-open race entirely, which the disconnected-session theory could not explain.

The actual root cause: the extension bundle is ESM while the harness compiles to
CommonJS, and the two `require('vscode')` loader paths handed out **distinct**
`vscode.window` objects — the harness's monkey-patch on its own copy never saw the
panels the extension bundle's own `createWebviewPanel` calls actually created.
Fixed by having `activate()` hand back its own `vscode` binding under
`TX_E2E_TESTING=1` for the harness to patch instead (see `helpers.ts`'s own header
comment for the full mechanism). This is what unblocked the 28/28 pass recorded
above.

## Final state — nothing open

All three items below closed out as of the 2026-08-15 update:

1. **Runs against the packaged VSIX — green, 28/28.** Artifact
   `sha256:10180618656e7411888806c9527995e1242814b0ed704099d8d6359d5fc2c86a`
   (run [31873022143](https://github.com/transitrix/transitrix-studio/actions/runs/31873022143)).
   First run against this branch was 27/28: `bpmn (custom process renderer,
   default)` failed with `Transitrix Studio: loadCompiler failed: Error: Cannot
   find module 'ajv'`. Not a new regression: `compiler.js` was reached via a
   runtime `createRequire('ajv')` call that esbuild couldn't statically bundle,
   invisible while the packaged VSIX still shipped `node_modules` and only
   surfacing once transitrix-hq#141 (PR transitrix-studio#526) stopped bundling
   it. Fixed in transitrix-studio#540 (static `import` of `ajv`/`ajv-formats` so
   esbuild inlines them); merged to `main`, this branch merged `main`, re-ran
   green.
2. **PNG comparison (old engine vs. new engine) — run, recorded.**
   `scripts/compare-png-engines.mjs` rebuilds `extension/src/raster.ts`
   as it stood at tag v3.1.3 (`flattenCssVars` + `@resvg/resvg-js`, reproduced
   verbatim in the script) and rasterizes the exact SVG `png-export.test.ts`
   captures, then pixel-diffs against the new engine's own captured PNG. This is
   a **deviation from comparing against a previously-published binary**: no
   released `.vsix` asset for a pre-PR-#526 version is obtainable — the
   Marketplace listing is gone and no GitHub release ever attached a `.vsix`
   file. Results (see the 2026-08-15 update above): `goals` 1.332% pixels
   differ, `blocks` 0.844%, `plantuml` 0.072% — consistent with the two
   engines' different SVG rasterizers, no divergence beyond that found. Full
   diff images in the `png-engine-comparison` build artifact on that run.
3. **Old PNG-export path deletion — already done, in #526, not blocked on
   anything here.** `extension/src/raster.ts` and the `@resvg/resvg-js` runtime
   dependency were removed when the webview-canvas rasterizer landed
   (transitrix-studio#526); `BpmnJsPreview.saveAsPng` (the one
   caller not going through `StaticSvgPreview.pngTarget`) was updated in place
   rather than kept behind a flag. There is no old code path left to delete —
   this acceptance item is satisfied by #526, not by anything in this hold.

## Harness changes (this and prior sessions)

- `helpers.ts`: `ensureExtensionActivated()`, called from a `before()` hook in
  both suites — explicitly activates the extension rather than relying on its
  `workspaceContains:*` activation events to have completed before the first
  test's `openFixture()` runs.
- `suite/index.ts`: `TX_E2E_GREP` env var, passed to `mocha.grep()` — narrows a
  run to one surface for diagnosis without editing the fixed `SURFACES` list.
- `captureWebviewPanels` (`helpers.ts`): waits up to `settleMs` (default 15s) past
  the triggering call returning for a panel to appear, covering the extension's
  fire-and-forget auto-open path.
- `runTest.ts` (this session): `TX_E2E_EXTENSION_PATH` override — see
  "Packaged-VSIX wiring" above.
- `scripts/compare-png-engines.mjs` (this session, new) — old-vs-new PNG engine
  comparison tooling; not part of the extension bundle.

## Next steps

None — hold 6 (transitrix-hq#143) is complete. Hold 5b (transitrix-hq#144,
release attachment + Open VSX publish) is the epic's next gate.
