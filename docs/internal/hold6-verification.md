# Hold 6 verification — per-notation surface pass, PNG comparison

Status: **in progress, not a completed verification.** transitrix-hq#143 asks for a
written record of exercising every preview/export surface against the packaged
universal VSIX, plus a PNG old-vs-new engine comparison before the old export path
is deleted. This document records what has been built and run so far, what it
found, and what is still open — honestly, not as a green checklist.

**2026-08-14 update — clean per-notation pass now exists, from CI.** The
"disconnected session" theory below (point 2) was correct as far as it went, but
CI's first real run on `ubuntu-latest` under `xvfb-run` (a host with a real,
if virtual, attached display) disproved the *reason* given for the 0-panels
symptom: even direct-command surfaces that bypass the auto-open race entirely
reported 0 panels there too. Root cause was a loader mismatch, not a focus/session
property: the extension bundle is ESM, the harness compiles to CommonJS, and the
two `require('vscode')` paths handed out distinct `vscode.window` objects, so the
harness's monkey-patch on its own copy never saw the panels the extension bundle's
own `createWebviewPanel` calls actually created (RPC-backed surfaces were fine;
per-call-site function references were not). Fixed by having `activate()` hand
back its own `vscode` binding under `TX_E2E_TESTING=1` for the harness to patch
instead. Result: **28/28 surfaces passing**, both suites, in CI
(`Extension E2E (headless)` on transitrix-studio#535) and locally in ~29s. Items
2 and 3 below are superseded by this — kept as a record of the ruled-out theory,
not current status. Items 1, 4, and 5 are still open.

## The harness

`extension/test-e2e/` (`npm run test:e2e-extension`) launches a real VS Code
Extension Development Host via `@vscode/test-electron` and drives it through mocha:

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

Both suites currently run against `extensionDevelopmentPath` (the built
`extension/` tree), **not an installed packaged `.vsix`** — see "What's still
open" below.

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
re-checking `this.panel` immediately before every such write. This is a
production defect independent of the test harness — a real user closing a
preview mid-render hits the same throw.

## What's still open

1. **Runs against source, not the packaged VSIX.** The issue title is
   "per-notation verification of packaged universal VSIX". Pointing
   `extensionDevelopmentPath` at the unpacked contents of a built `.vsix` (rather
   than `extension/` source) instead of, or in addition to, the current setup
   would close this gap; not yet done.
2. **The suite does not run reliably in this unattended host — now confirmed as
   an environment property, not a flaky symptom.** Multiple runs this session
   (before and after the panel-race fix, and with `--disable-gpu` added and
   removed) showed the same failure shape: `captureWebviewPanels` reports 0
   panels for surfaces that should render. Diagnostic instrumentation (since
   reverted) traced this to VS Code's own active-editor tracking, not the
   extension: `onDidChangeActiveTextEditor` fires once for the opened fixture,
   then fires again moments later with `undefined` — i.e. the test-host window
   loses its active editor on its own, before the extension's auto-open listener
   has necessarily finished. This reproduced even for the very first fixture
   opened in an otherwise-empty run, with the extension explicitly activated
   ahead of time (`ensureExtensionActivated()`, added this session — kept, since
   it removes one real race even though it wasn't the one at fault here). The
   pattern is consistent with the Electron test window never holding real
   window/focus state in this unattended session — plausible without an
   interactive desktop session — rather than with anything the extension or the
   harness controls.

   **Confirmed 2026-08-14, not just plausible.** `query session` on this host
   shows the automation account's session (`Transitrix`, ID 1) in state `Disc`
   (disconnected) while a separate console session (`Valerii`, ID 2) is the one
   in state `Active`; `[System.Environment]::UserInteractive` from a process in
   the automation account's session returns `False`. A disconnected Windows
   session has no attached input desktop, so a Win32/Electron top-level window
   created there cannot become the foreground/focused window in the way
   `onDidChangeActiveTextEditor` depends on — this is the documented behaviour
   of disconnected sessions, not a bug to chase further in this codebase. A
   single-surface rerun this session (`TX_E2E_GREP=goals`) reproduced the exact
   "0 panels" failure on the very first and only fixture opened, consistent
   with every prior run. This closes the open question from the prior session:
   the theory is confirmed, and the fix is a different execution environment,
   not different code.
3. **Per-notation results are therefore not a clean pass/fail matrix yet.** An
   early exploratory run (pre-fix) showed roughly a dozen of the 25 preview cases
   render successfully in a single pass before hitting the disposed-panel bug on
   the rest; later full runs, post-fix, showed anywhere from 0 to all 25 fail
   with the "0 panels" symptom above, depending on the run. That variance is the
   evidence for (2) above, not a notation-by-notation result — no surface can yet
   be marked verified-green from this session's runs.
4. **PNG comparison (old engine vs. currently-published build) not started.**
   `png-export.test.ts` captures the new (webview-canvas) engine's output and the
   exact SVG fed to it, which is half of what's needed; the "current published
   build" side requires installing a previously-published VSIX (e.g. 3.1.x, which
   still carried `@resvg/resvg-js`) and running the equivalent export, which
   hasn't been attempted this session.
5. **Old PNG-export path deletion:** blocked on (4), unchanged from the issue's
   own acceptance criteria — not attempted.

## Harness changes this session (beyond the panel-race fix)

- `helpers.ts`: added `ensureExtensionActivated()`, called from a `before()` hook
  in both suites — explicitly activates the extension rather than relying on its
  `workspaceContains:*` activation events to have completed before the first
  test's `openFixture()` runs. Kept as a real hardening even though it did not
  turn out to be the cause of (2) above.
- `suite/index.ts`: `TX_E2E_GREP` env var, passed to `mocha.grep()` — narrows a
  run to one surface for diagnosis without editing the fixed `SURFACES` list.
- `captureWebviewPanels` (`helpers.ts`, from an earlier run this session, kept
  as-is): waits up to `settleMs` (default 15s) past the triggering call
  returning for a panel to appear, covering the extension's fire-and-forget
  auto-open path.

## Next steps

- **Rerun this suite from a session with an attached input desktop** — an
  interactive console session, or a CI runner (e.g. `windows-latest` GitHub
  Actions, which runs with a real desktop session unlike this disconnected
  automation session) — to produce the actual per-notation pass/fail matrix.
  No further unattended run against this host will produce a different result;
  this is now a confirmed environment property (see above), not something to
  keep re-diagnosing.
- Point the harness at an unpacked packaged `.vsix` instead of source. Wiring
  this does not itself require a working display, but verifying it works does
  — worth doing together with the rerun above rather than separately, so the
  one working run also closes acceptance-criterion (1).
- Run the old-build side of the PNG comparison — also needs a working display
  for the same reason.
