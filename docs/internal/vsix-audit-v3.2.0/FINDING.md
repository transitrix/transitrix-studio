# Epic finding — provenance and binary-content audit of the published Studio v3.2.0 artefacts

Epic: transitrix-hq#130, opened after the VS Marketplace listing was removed as Malware
(transitrix-hq#127). Tasks: transitrix-hq#132 (acquisition), transitrix-hq#133 (path/binary
inventory), transitrix-hq#134 (dependency reconciliation), transitrix-hq#135 (third-party
scans), transitrix-hq#136 (reproducibility — this task, which writes this finding per its
acceptance criteria).

## Conclusion: (a)

**Every file in every published artefact traces to a declared, pinned, published dependency
version or to repository source, with hashes.** No file was found in any of the four published
Open VSX `v3.2.0` artefacts that does not trace to one of:

- **Repository source** (`extension/` at git tag `v3.2.0`, confirmed against `git ls-tree`) —
  11 paths, identical set on all four platforms.
- **Generated build output** of a named, repository-committed script (`extension:prep`'s own
  chain: `build:webview`, `build:plantuml-assets`, `build:diagrams`,
  `build-compiler-bundle.mjs`, `extension:bundle`) — 22 paths, identical set on all four
  platforms.
- **A resolved npm dependency at an exact version**, every one satisfying its declared semver
  range in `extension/package.json` (7 direct, 19 transitive, one platform-specific
  `@resvg/resvg-js-<platform>` native package per artefact) — 23 packages shared across
  `linux-x64`/`linux-arm64`/`darwin-arm64`, 24 on `win32-x64`.

## Evidence chain

| Task | What it established | Where |
|---|---|---|
| transitrix-hq#132 | SHA-256 of all four published artefacts, fetched from Open VSX (the primary, since the `v3.2.0` GitHub Release carries no VSIX assets — see that task's amendment) | [`README.md`](README.md), [`SHA256SUMS.txt`](SHA256SUMS.txt) |
| transitrix-hq#133 | Path-for-path + binary inventory, every one of 517 paths × 4 platforms classified to repo source / generated output / dependency, with origin | [`inventory.md`](inventory.md), `inventory-<platform>.csv` |
| transitrix-hq#134 | Dependency tree reconstruction (7 direct + 19 transitive + per-platform native binary), semver reconciliation against `extension/package.json`, zero OSV advisories across all 26 packages, registry signature/provenance check, Dependabot cross-check (4 unrelated root-workspace alerts, none in the shipped tree) | [`dependencies.md`](dependencies.md) |
| transitrix-hq#135 | Two independent scan engines (Microsoft Defender local scan; VirusTotal 60–64 engines) on all four `.vsix` and their unpacked binary components — zero malicious, zero suspicious, on every artefact | [`scans.md`](scans.md) |
| transitrix-hq#136 | Rebuild from tag `v3.2.0`, `win32-x64` target: byte-for-byte content match (519/519 files, 0 hash mismatches) against the published `win32-x64` artefact, run through the repository's own build path. `linux-x64`/`linux-arm64`/`darwin-arm64` not independently rebuilt (no matching build host in this environment) — path-diffed against the win32-x64 rebuild instead, showing the only delta is each platform's own declared, version-pinned native dependency, consistent with transitrix-hq#133's finding that those three platforms are byte-identical to each other and differ from `win32-x64` only by CRLF/LF (explained by CI runner OS) | [`reproducibility.md`](reproducibility.md) |

## Marketplace artefacts — could not be examined

Per transitrix-hq#132's amendment: the bytes VS Marketplace served under `v3.2.0` before the
listing's removal are **not retrievable** — no release asset, no retained CI artifact. Every
finding above is over the **Open VSX** artefacts (a parallel build of the same tag, built and
published by a separate workflow, `openvsx-publish.yml`, on its own runners) — the closest
available substitute, not the artefact the Malware classification was applied to. This gap is
recorded here rather than silently substituted, per transitrix-hq#132's own instruction.
Whether the Marketplace-specific build differed from the Open VSX build in some way that
explains the takedown remains open and is transitrix-hq#127's line of investigation, not this
epic's — this audit's conclusion (a) is scoped to the artefacts it could actually examine.

## Stop-and-report

Not triggered. No file in any examined artefact was found without a traced origin.

## Constraints observed (epic-wide, across all five tasks)

Read-only with respect to distribution throughout: nothing was published, re-published,
unpublished, deleted, or modified on any registry across transitrix-hq#132–136. No packaging or
publishing workflow was changed. The one non-read-only step — building a local `.vsix` via
`vsce package` for transitrix-hq#136's reproducibility check — was explicitly authorised by
Valerii for that single purpose (2026-08-11) and produced only an uncommitted, unpublished local
file.
