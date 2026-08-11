# v3.2.0 VSIX path-level + binary inventory

Task: transitrix-hq#133 · Epic: transitrix-hq#130. Builds on the artefacts acquired in
transitrix-hq#132 ([`README.md`](README.md), `SHA256SUMS.txt`) — same four VSIX files, same
SHA-256, nothing re-downloaded or re-derived.

**No stop-and-report was triggered.** Every one of the 517 paths in every one of the four
artefacts traced to a declared source (a git-tracked repo path, a named `extension:prep`
generating script, or a `package@version` resolved inside `node_modules`) — see Method below.

## Method

Each VSIX was unpacked (`unzip`) into a scratch directory (not committed — binaries stay out
of git per `.gitignore`'s `*.vsix`, and the unpacked tree is reproducible from the SHA-256-fixed
files in transitrix-hq#132 at any time). Every file's path and size was walked, then classified:

- **(a) repository source** — the path exists at the same relative location under
  `extension/` in `git ls-tree HEAD` (confirmed individually, see below). Three files are
  renamed by `vsce`'s own packaging step (not by anything in this repo's scripts):
  `extension/LICENSE` → `LICENSE.txt`, `extension/README.md` → `readme.md`,
  `extension/CHANGELOG.md` → `changelog.md`.
- **(b) generated build output** — the path falls under a directory `.gitignore` marks as
  build output (`extension/out/`, `extension/compiler/`, `extension/media/`,
  `extension/schemas/`) and is produced by a named step of `npm run extension:prep`
  (`package.json`'s own script chain: `build:webview` → `build:plantuml-assets` →
  `build:diagrams` → `build-compiler-bundle.mjs` → `extension:bundle`).
- **(c) dependency package at a resolved exact version** — the path is under
  `extension/node_modules/`; the package name and version were read from that package's own
  `package.json` inside the unpacked tree (not assumed from a lockfile or range).

Full per-file inventory (path, size in bytes, class, origin/script/package@version) for each
platform is in [`inventory-linux-x64.csv`](inventory-linux-x64.csv),
[`inventory-win32-x64.csv`](inventory-win32-x64.csv),
[`inventory-darwin-arm64.csv`](inventory-darwin-arm64.csv),
[`inventory-linux-arm64.csv`](inventory-linux-arm64.csv) — 517 rows each. This document
summarizes; the CSVs are the complete record the acceptance criteria call for.

## Cross-platform shape

All four artefacts carry the same **517 paths**. Three of the four
(`linux-x64`, `darwin-arm64`, `linux-arm64`) are **byte-identical file-for-file**, except each
one's own `@resvg/resvg-js-<platform>` native binary (below). `win32-x64` additionally differs
from the other three in **13 small text/JSON/SVG files** — `LICENSE.txt`, `changelog.md`,
`readme.md`, `package.json`, `language-configuration.json`, both `assets/*.svg` and their
`media/*.svg` copies, both `schemas/*.json`, `syntaxes/ttrs.tmLanguage.json`,
`webview/viewer.ts` — by **line ending only** (CRLF in `win32-x64`, LF in the other three);
diffed content is otherwise identical (`package.json`'s size delta is exactly 955 bytes for
955 lines — one extra `\r` per line, nothing else changed). All files produced by an
`esbuild` bundling step (`out/extension.js`, `compiler/*.js`, `media/viewer.js`,
`media/plantuml/*.js`) are **LF in all four platforms**, including `win32-x64` — esbuild
normalizes output regardless of host OS. Only files copied verbatim from the git working tree
(not run through a bundler) carry the checkout's native line ending, consistent with the
`win32-x64` publish job running on a Windows runner whose git checkout applies `core.autocrlf`.
Read-only observation, not a defect.

## Class (a) — repository source (11 paths, identical set on all 4 platforms)

Every path below was confirmed present in `git ls-tree HEAD` at the source path shown
(`extension/LICENSE`, `extension/README.md`, `extension/CHANGELOG.md` before `vsce`'s rename):

| VSIX path | Source (git-tracked) | Size (linux-x64) |
|---|---|---|
| `package.json` | `extension/package.json` | 32,470 B |
| `LICENSE.txt` | `extension/LICENSE` | 1,082 B |
| `readme.md` | `extension/README.md` | 8,942 B |
| `changelog.md` | `extension/CHANGELOG.md` | 38,599 B |
| `icon.png` | `extension/icon.png` | 34,333 B |
| `language-configuration.json` | `extension/language-configuration.json` | 99 B |
| `syntaxes/ttrs.tmLanguage.json` | `extension/syntaxes/ttrs.tmLanguage.json` | 7,960 B |
| `assets/transitrix-icon-mono.svg` | `extension/assets/transitrix-icon-mono.svg` | 1,115 B |
| `assets/ttrs-icon-mono.svg` | `extension/assets/ttrs-icon-mono.svg` | 537 B |
| `docs/preview.png` | `extension/docs/preview.png` | 84,111 B |
| `webview/viewer.ts` | `extension/webview/viewer.ts` | 8,878 B (raw TS source, not excluded by `.vscodeignore`) |

**Observation, not a defect:** `docs/preview.png` ships inside every VSIX (84 KB × 4), but
`extension/README.md` references it via an absolute
`https://raw.githubusercontent.com/...` URL, not a package-relative path — so nothing in the
installed extension appears to read the packaged copy. Flagging as an observation per the
epic's "observations only" constraint; no action taken.

## Class (b) — generated build output (22 paths, identical set on all 4 platforms)

| Directory | Generating step | Upstream copied package (where applicable) |
|---|---|---|
| `out/extension.js`, `out/extension.css` | `scripts/build-extension-bundle.mjs` (esbuild bundle of `extension/src/extension.ts`) | `extension.css` is an esbuild side-effect of a transitively-imported `node_modules/reactflow/dist/style.css` |
| `compiler/compiler.js`, `compiler/metrics.js` | `scripts/build-compiler-bundle.mjs` (esbuild bundle of `src/compiler.ts` + `src/metrics.ts`) | — |
| `schemas/bpmn-dsl.schema.json`, `schemas/transitrixrc.schema.json` | `scripts/build-compiler-bundle.mjs` (copies repo-root `schemas/*.json`) | — |
| `media/viewer.js` | `scripts/build-webview.mjs` (esbuild bundle of `extension/webview/viewer.ts`) | — |
| `media/diagram-js.css`, `media/bpmn-js.css`, `media/bpmn-font/**` | `scripts/build-webview.mjs` (copy) | `bpmn-js@18.22.1` (`node_modules/bpmn-js/dist/assets/**`, root workspace) |
| `media/transitrix-icon-mono.svg`, `media/ttrs-icon-mono.svg` | `scripts/build-webview.mjs` (copy) | `extension/assets/*.svg` (same tracked source as the class-(a) copies above) |
| `media/plantuml/plantuml.js`, `media/plantuml/viz-global.js` | `scripts/build-plantuml-assets.mjs` (copy) | `@plantuml/core@1.2026.6` (`node_modules/@plantuml/core/{plantuml.js,viz-global.js}`, root workspace) |
| `media/plantuml/plantuml-client.js` | `scripts/build-plantuml-assets.mjs` (generated inline by the script, not copied) | — |

## Class (c) — dependencies (node_modules, resolved exact versions)

23 distinct packages on `linux-x64` / `darwin-arm64` / `linux-arm64` (24 on `win32-x64`, which
additionally carries its own `@resvg/resvg-js-win32-x64-msvc` binary package in place of the
Linux/macOS equivalent). All versions were read from each package's own shipped
`package.json`, then cross-checked against `extension/package.json`'s **7 direct** runtime
dependencies — every resolved version satisfies its declared semver range, nothing
undeclared:

| Direct dependency | Declared range | Resolved |
|---|---|---|
| `@resvg/resvg-js` | `^2.6.2` | `2.6.2` |
| `ajv` | `^8.17.1` | `8.20.0` |
| `ajv-formats` | `^3.0.1` | `3.0.1` |
| `bpmn-moddle` | `^10.0.0` | `10.1.0` |
| `elkjs` | `^0.12.0` | `0.12.0` |
| `js-yaml` | `^4.1.0` | `4.3.1` |
| `xmlbuilder2` | `^3.1.1` | `3.1.1` |

The remaining 16 packages (`@oozcitak/dom`, `@oozcitak/infra`, `@oozcitak/url`,
`@oozcitak/util`, `@resvg/resvg-js-<platform>`, `argparse`, `esprima`, `fast-deep-equal`,
`fast-uri`, `json-schema-traverse`, `min-dash`, `moddle`, `moddle-xml`,
`require-from-string`, `saxen`, `sprintf-js`) are transitive dependencies of the 7 above
(e.g. `bpmn-moddle` → `moddle`, `moddle-xml`, `min-dash`, `saxen`; `xmlbuilder2` →
`@oozcitak/*`; `ajv` → `fast-deep-equal`, `fast-uri`, `json-schema-traverse`). Full
package/version/file-count/byte-size breakdown is in the per-platform CSVs.

## Binary / non-plaintext inventory

Two groups, both evidence-based rather than guessed: **(i) true binary** — detected by
scanning each file's leading bytes for null bytes / non-text byte sequences, not by file
extension; **(ii) machine-generated bundle** — the `class (b)` esbuild outputs the task's
`or minified bundles` wording explicitly covers, even though they are technically valid UTF-8
text.

| Path | Class | Size (linux-x64) | Originating package | Runtime-required |
|---|---|---|---|---|
| `node_modules/@resvg/resvg-js-<platform>/resvgjs.<platform>.node` | c, true binary | 3.5–4.5 MB (platform-dependent) | `@resvg/resvg-js-<platform>` (native rasterizer, PNG export) | Yes |
| `media/plantuml/viz-global.js` | b, machine-generated bundle; **embeds a base64-encoded WASM module** (`AGFzbQ` magic-byte match confirmed) | 1,445,436 B | `@plantuml/core@1.2026.6` | Yes (PlantUML preview) |
| `media/plantuml/plantuml.js` | b, machine-generated bundle | 7,152,247 B | `@plantuml/core@1.2026.6` | Yes (PlantUML preview) |
| `out/extension.js` | b, machine-generated bundle | 1,291,679 B | esbuild output of `extension/src/extension.ts` | Yes (extension host entry point) |
| `media/viewer.js` | b, machine-generated bundle | 432,292 B | esbuild output of `extension/webview/viewer.ts` | Yes (preview webview) |
| `compiler/compiler.js` | b, machine-generated bundle | 85,021 B | esbuild output of `src/compiler.ts`; loaded dynamically by `extension.ts` at `compiler/compiler.js` | Yes |
| `compiler/metrics.js` | b, machine-generated bundle | 12,049 B | esbuild output of `src/metrics.ts`; loaded dynamically by `extension.ts` at `compiler/metrics.js` | Yes |
| `docs/preview.png` | a, true binary (image) | 84,111 B | repo source | No — see observation above (README links the raw GitHub copy, not the packaged one) |
| `icon.png` | a, true binary (image) | 34,333 B | repo source | Yes (`package.json`'s `"icon"` field; VS Code UI) |
| `media/bpmn-font/font/bpmn.eot` | b, true binary (font) | 47,832 B | `bpmn-js@18.22.1` | Yes (BPMN preview icon font) |
| `media/bpmn-font/font/bpmn.ttf` | b, true binary (font) | 47,680 B | `bpmn-js@18.22.1` | Yes |
| `media/bpmn-font/font/bpmn.woff` | b, true binary (font) | 16,004 B | `bpmn-js@18.22.1` | Yes |
| `media/bpmn-font/font/bpmn.woff2` | b, true binary (font) | 13,028 B | `bpmn-js@18.22.1` | Yes |

No `.wasm` file ships as its own path in any of the four artefacts (searched by extension in
every unpacked tree); the one WASM module present travels base64-embedded inside
`viz-global.js`, as noted above. No native binary other than the platform-matched
`@resvg/resvg-js-<platform>` `.node` file exists in any artefact.

## Constraints observed

Read-only with respect to distribution: unpacking is a local, non-mutating inspection of the
artefacts already acquired in transitrix-hq#132. Nothing was published, re-published,
unpublished, deleted, or modified on any registry. No packaging or publishing workflow was
changed.
