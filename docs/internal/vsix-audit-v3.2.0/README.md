# v3.2.0 VSIX provenance — artefact acquisition

Task: transitrix-hq#132 · Epic: transitrix-hq#130 (provenance and binary-content audit of the
published Studio v3.2.0 artefacts, opened after the VS Marketplace listing was removed as
Malware — transitrix-hq#127).

## What this record is

The four **published** v3.2.0 VSIX files (one per platform target), fetched as distributed
bytes, with their SHA-256 recorded in [`SHA256SUMS.txt`](SHA256SUMS.txt). None of the four
was produced by a local rebuild for this step.

## Source

The GitHub Release [`v3.2.0`](https://github.com/transitrix/transitrix-studio/releases/tag/v3.2.0)
carries no attached VSIX assets. The VS Code Marketplace publish run
([actions/runs/31378518820](https://github.com/transitrix/transitrix-studio/actions/runs/31378518820))
uploaded no build artefacts either — `gh api repos/transitrix/transitrix-studio/actions/runs/31378518820/artifacts`
returns zero results, so the first preference in the task (unexpired Actions artefacts) is
unavailable.

Fell back to the second preference — **Open VSX platform downloads** — since `3.2.0` is live
there and built from the same source tag / packaging pipeline minus the Marketplace-specific
publish step (per transitrix-hq#127's evidence pack). Per-platform download URLs, from
`GET https://open-vsx.org/api/transitrix/transitrix-studio/3.2.0`:

| Platform | Source URL |
|---|---|
| `linux-x64` | `https://open-vsx.org/api/transitrix/transitrix-studio/linux-x64/3.2.0/file/transitrix.transitrix-studio-3.2.0@linux-x64.vsix` |
| `linux-arm64` | `https://open-vsx.org/api/transitrix/transitrix-studio/linux-arm64/3.2.0/file/transitrix.transitrix-studio-3.2.0@linux-arm64.vsix` |
| `win32-x64` | `https://open-vsx.org/api/transitrix/transitrix-studio/win32-x64/3.2.0/file/transitrix.transitrix-studio-3.2.0@win32-x64.vsix` |
| `darwin-arm64` | `https://open-vsx.org/api/transitrix/transitrix-studio/darwin-arm64/3.2.0/file/transitrix.transitrix-studio-3.2.0@darwin-arm64.vsix` |

## Integrity check

Open VSX also publishes its own SHA-256 for each file (`<file>.sha256`, e.g.
`.../linux-x64/3.2.0/file/transitrix.transitrix-studio-3.2.0@linux-x64.sha256`). The hash
computed locally on each downloaded `.vsix` (`sha256sum`) matches the corresponding
Open VSX-published `.sha256` file byte-for-byte, for all four platforms.

## Not in this record

The `.vsix` files themselves are not committed — `.gitignore` excludes `*.vsix` repo-wide, and
they are large binary downloads, not source. `SHA256SUMS.txt` fixes their identity; the URLs
above are stable (Open VSX does not mutate a published version's files), so a later task
re-fetches the identical bytes on demand rather than depending on a local copy surviving
between runs.

This step is acquisition only — no path-level inventory, no dependency-tree reconstruction, no
third-party scan, no reproducibility check. Those are transitrix-hq#133, #134, #135, #136.
Path-level + binary inventory (transitrix-hq#133) is now in [`inventory.md`](inventory.md).

## Constraints observed

Read-only with respect to distribution: nothing was published, re-published, unpublished,
deleted, or modified on any registry. No packaging or publishing workflow was changed.
