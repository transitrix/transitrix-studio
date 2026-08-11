# v3.2.0 reproducibility check — rebuild from tag `v3.2.0`

Task: transitrix-hq#136 · Epic: transitrix-hq#130. Depends on transitrix-hq#133 (path/binary
inventory), transitrix-hq#134 (dependency reconciliation), transitrix-hq#135 (scanner
verdicts) — all cited below, not re-derived. Per the epic amendment on transitrix-hq#130 (the
`v3.2.0` GitHub Release carries no VSIX assets, so **published Open VSX artefacts, not
Marketplace, are the primary comparison target** — see transitrix-hq#132's `README.md`).

## Method

Checked out tag `v3.2.0` (`c0713bb`) into an isolated git worktree, separate from this branch's
working tree, so nothing from the audit's own doc commits could contaminate the build inputs.
Ran the repository's normal, undocumented-shortcut-free build path:

1. `npm ci` at repo root (lockfile-pinned root install; matches the CI step).
2. `npm run extension:prep` (the same script `openvsx-publish.yml` runs — builds the webview,
   PlantUML assets, diagrams package, compiler bundle, and installs `extension/`'s runtime deps
   into a clean temp dir per transitrix-hq#134's finding that `extension/` has no committed
   lockfile).
3. `npm run verify-extension-packaging` — passed (`OK`).
4. `npx --no-install vsce package --target win32-x64 -o ../output/`, run from `extension/`,
   matching `openvsx-publish.yml`'s own `vsce package --target ${{ matrix.target }}` step
   exactly.

**Target chosen:** `win32-x64`, because this audit's build host is Windows — the same
constraint the CI matrix itself has (each of its four jobs runs on the OS/arch matching its
target; see `openvsx-publish.yml`'s comment on why native `@resvg/resvg-js-*` binaries require
a matching runner). `linux-x64`, `linux-arm64`, and `darwin-arm64` are **not directly
rebuildable in this environment** — no Linux or macOS build host was available. What that gap
does and does not cover is addressed below, using transitrix-hq#133's already-established
cross-platform comparison rather than re-asserting it.

**Environment note:** this rebuild used Node.js v26.3.1 (locally installed); `openvsx-publish.yml`
pins Node 20 via `actions/setup-node`. No version manager for Node was available on this host to
match it exactly. Recorded as a difference in build environment; see Result below for whether it
had any observable effect.

## Result: `win32-x64` — byte-for-byte content match

Compared the local rebuild's `output/transitrix-studio-win32-x64-3.2.0.vsix` against the
published `transitrix.transitrix-studio-3.2.0@win32-x64.vsix` (re-downloaded fresh from the
Open VSX URL in transitrix-hq#132's `README.md`; local SHA-256 of the re-download —
`62432521837f257d54ac5734955bd5609997448ee3a4a444113d1d01793ecef0` — matches
`SHA256SUMS.txt` exactly, confirming no drift since acquisition).

| Check | Result |
|---|---|
| File count | 519 / 519 (matches `vsce`'s own report; 517 `extension/`-prefixed paths per transitrix-hq#133's CSVs, plus the two VSIX-container-level entries `[Content_Types].xml` and `extension.vsixmanifest`, which the CSVs exclude by design) |
| Path set | **Identical.** `diff` of the sorted path lists (local rebuild vs. unpacked published artefact) — zero lines of output. |
| Per-file SHA-256 | **Identical for all 519 files.** Computed `sha256sum` for every unpacked file in both trees, joined on path, diffed — zero mismatches. |
| Zip entry order | Identical (`unzip -l` listings match entry-for-entry). |
| Outer `.vsix` file SHA-256 | **Differs** — local `82246a97…0aba8a2` vs. published `62432521…1793ecef0`. |

The outer-file hash difference is fully explained: `unzip -l` on both archives shows identical
sizes and identical entry order, differing only in the per-entry embedded timestamp — the
published artefact's entries carry `2026-08-10 10:18`–`10:19` (matching the
`vscode-marketplace-publish.yml`/`openvsx-publish.yml` run window recorded in
transitrix-hq#127's evidence pack), the local rebuild's carry this run's build time. A VSIX is
a zip/OPC package; per-entry mtimes are part of the zip local-file-header and are hashed as part
of the archive bytes even when every entry's *content* is identical. This is build
nondeterminism of the category the task anticipated (timestamps), not a content difference —
confirmed by the zero-mismatch per-file content hash above.

**No Node-version effect observed:** despite the Node 26 vs. Node 20 environment difference
noted above, every file's content hash matched. Recorded as an observation, not treated as
having produced any divergence.

## Result: `linux-x64`, `linux-arm64`, `darwin-arm64` — not directly rebuilt; reasoned from existing evidence

No build host for these OS/arch combinations was available in this run's environment, so no
independent rebuild-and-hash-compare was performed for these three targets. What is known
instead, and where it comes from:

- **Path set:** compared the local `win32-x64` rebuild's path list against each of the three
  platforms' recorded inventories (transitrix-hq#133's `inventory-<platform>.csv`). In every
  case the only difference is the platform-specific native binary package — e.g. against
  `linux-x64`: `extension/node_modules/@resvg/resvg-js-win32-x64-msvc/{package.json,resvgjs.win32-x64-msvc.node}`
  (local) in place of `extension/node_modules/@resvg/resvg-js-linux-x64-gnu/{package.json,resvgjs.linux-x64-gnu.node}`
  (published `linux-x64`) — two paths differ, all 515 others match exactly. Same shape for
  `linux-arm64` and `darwin-arm64`.
- **Content of the shared (non-`@resvg/resvg-js-<platform>`) files:** transitrix-hq#133 already
  established, by direct inspection of all four published artefacts, that `linux-x64`,
  `linux-arm64`, and `darwin-arm64` are byte-identical to each other file-for-file (their shared
  517-2=515 non-native-binary paths), and that `win32-x64` differs from those three only by
  line-ending (CRLF vs. LF) on 13 repository-source text files — explained there by the
  `win32-x64` publish job running on a Windows CI runner whose git checkout applies
  `core.autocrlf`. This rebuild's win32-x64 result (byte-for-byte match against published
  win32-x64, including those 13 files) is consistent with, and does not contradict, that
  explanation: the same source and generation steps that reproduce win32-x64 exactly are the
  steps `openvsx-publish.yml` runs identically for the other three targets, varying only by
  runner OS (which is what produces the CRLF/LF and native-binary differences, both already
  explained).
- **The per-platform `@resvg/resvg-js-<platform>` binary itself:** not independently rebuilt or
  hash-compared against the published copy for `linux-x64`/`linux-arm64`/`darwin-arm64` in this
  task. It is covered instead by transitrix-hq#134's dependency reconciliation — declared range
  `^2.6.2` on `@resvg/resvg-js`, every platform's own optional-dependency package resolving to
  `2.6.2`, npm registry-signed, zero OSV advisories — and by transitrix-hq#135's scan of the
  unpacked `.node` binaries themselves (clean on both engines, all four platforms). This is a
  genuine gap in *directly rebuilding* those three targets, stated plainly rather than
  papered over: this task rebuilt and bit-for-bit verified one of four targets. The other three
  are supported by path-diff, prior byte-identity inspection, dependency-declaration
  reconciliation, and clean scans — not by an independent local rebuild.

## Constraints observed

Read-only with respect to distribution: the rebuilt `.vsix` was produced locally, is
uncommitted (`.gitignore` excludes `*.vsix` repo-wide), and was never published, uploaded, or
compared by re-publishing. No packaging or publishing workflow was changed. Building via `vsce
package` for this reproducibility check only was explicitly authorised by Valerii on
transitrix-hq#136 (2026-08-11), per this repo's standing `CLAUDE.md` rule that otherwise
requires his go-ahead before any `vsce package` invocation.
