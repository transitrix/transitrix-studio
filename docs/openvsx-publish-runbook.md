# Release runbook — Open VSX (Cursor, VSCodium, Windsurf)

How to publish Transitrix Studio's VS Code extension to the
[Open VSX Registry](https://open-vsx.org) so Cursor users (and the rest of
the Open VSX consumer set — VSCodium, Windsurf, Gitpod, etc.) can install
it directly from within their editor.

Open VSX is the Eclipse Foundation registry that Cursor reads — there is
no separate "Cursor marketplace". Publishing the existing per-platform
`.vsix` artefacts to Open VSX covers all these editors in one action.

The npm publish flow for `@transitrix/diagrams` / `@transitrix/cli` is a
separate procedure — see [`release-runbook.md`](release-runbook.md).
The VS Code Marketplace publish flow is the same `vsce publish` per
target documented in [`packaging.md`](packaging.md); the steps below
mirror it for the `ovsx` CLI.

## What gets published

The **same per-platform VSIXs** the VS Code Marketplace ships. There is
no separate "Cursor build" — the artefact is the one produced by
`npm run package-extension` on each matching runner. The native
`@resvg/resvg-js-*` binary makes the VSIX platform-specific, so a CI
matrix or several local runs are required to cover the desktop set:

| Target | Built on |
|---|---|
| `win32-x64` | Windows x64 |
| `win32-arm64` | Windows arm64 |
| `darwin-x64` | macOS x64 |
| `darwin-arm64` | macOS arm64 |
| `linux-x64` | Linux x64 |
| `linux-arm64` | Linux arm64 |

A VSIX built with **no** `--target` claims universal compatibility while
carrying only the build machine's resvg binary — do not publish one of
those to Open VSX for the same reason it is avoided on the Marketplace.

## Prerequisites (one-time, maintainer action)

These steps are outside the agent scope and must be done before the
first Open VSX publish session:

1. **Create the `transitrix` Open VSX namespace.** Sign in at
   <https://open-vsx.org> with the GitHub account that owns the
   publisher identity, then claim the `transitrix` namespace under
   *User Settings → Namespaces*. The namespace must match the
   `publisher` field in `extension/package.json` (`"publisher":
   "transitrix"`).
2. **Generate a personal access token** under *User Settings → Access
   Tokens*. Save it as `OVSX_PAT` in the shell environment used for
   publishing (and as a repo Actions secret of the same name if/when CI
   publish-on-tag is wired up later).
3. **Install the `ovsx` CLI** in the publishing environment:
   ```bash
   npm install -g ovsx
   ```

Open VSX does not require 2FA for publishes; the token gates the write.

## Pre-flight checklist (run for every release)

Run from a clean checkout of the tag/commit being released, after the
Marketplace pre-flight has passed:

- [ ] The VS Code Marketplace publish for this version is **done** and
      visible at <https://marketplace.visualstudio.com/items?itemName=transitrix.transitrix-studio>.
      Open VSX is the second hop, not the source of truth.
- [ ] The per-platform VSIX files from the Marketplace step are still
      on disk (or rebuild them per [`packaging.md`](packaging.md)).
- [ ] The `version` field in `extension/package.json` matches the
      Marketplace listing exactly.
- [ ] `extension/README.md` and the icon (`extension/icon.png`) match
      what shipped to the Marketplace — Open VSX renders these on the
      listing page from the VSIX itself, so there is nothing extra to
      sync if the same artefact is used.
- [ ] `OVSX_PAT` is set in the current shell and `ovsx` is on PATH:
      ```bash
      ovsx --version
      echo "$OVSX_PAT" | head -c 4   # sanity-check it is set
      ```

## Publishing

Publish each per-platform VSIX from its matching runner (the resvg
binary is per-OS — a `linux-x64` VSIX cannot be produced on Windows).
`ovsx publish` accepts a `.vsix` path directly; the namespace and
version are read from the file:

```bash
# on a Windows x64 runner, after `npm run package-extension`
ovsx publish extension/transitrix-studio-<version>-win32-x64.vsix

# on a macOS arm64 runner
ovsx publish extension/transitrix-studio-<version>-darwin-arm64.vsix

# on a Linux x64 runner
ovsx publish extension/transitrix-studio-<version>-linux-x64.vsix
```

Repeat for every target in the table above. `ovsx` returns a JSON blob
containing the published download URL on success.

> If only a single platform's VSIX is published, Open VSX will refuse to
> install the extension on any other platform — there is no universal
> fallback. Either publish the full set or accept a single-platform
> listing knowingly.

## Verify

For every published target, confirm the listing returns the expected
version:

```bash
ovsx get transitrix.transitrix-studio
# or
curl -s https://open-vsx.org/api/transitrix/transitrix-studio | jq '.version, .platform'
```

End-to-end install check inside Cursor:

1. Open Cursor → *Extensions* panel.
2. Search for **Transitrix Studio** — the listing should show the
   `transitrix` publisher and the version just published.
3. Click *Install*; open a `*.bpmn.transitrix.yaml` file from the
   methodology starter repo; the preview should open automatically.

The same install path works in VSCodium and Windsurf — no per-editor
verification step needed beyond a spot check.

## Keeping Open VSX in sync on future releases

The Open VSX publish is a **second hop** after every VS Code
Marketplace release. The steady-state procedure is:

1. Publish to the Marketplace per [`packaging.md`](packaging.md) and
   the existing release process.
2. From the same runners (or rebuilt VSIXs on matching OS/arch), run
   `ovsx publish <vsix>` for each target — see above.
3. Confirm the Open VSX version field matches the Marketplace listing
   before announcing the release.

When CI publish-on-tag automation lands, the same matrix that runs
`vsce publish` should run `ovsx publish` next to it with `OVSX_PAT`
injected from the repo Actions secret. Until then, both hops are
manual.

## Unpublish / yank

Open VSX permits removing a specific version through the web UI
(*Namespace → Extension → Version → Delete*). Prefer a patch release
with a fix over a delete — Cursor / VSCodium clients may have cached
the install metadata and a re-publish at the same version is rejected.

## Relates

- Strategy hub: [`vkgeorgia/strategy#184`](https://github.com/vkgeorgia/strategy/issues/184) — the Cursor publish task this runbook codifies.
- [`packaging.md`](packaging.md) — VSIX packaging (the artefact shape Open VSX consumes).
- [`release-runbook.md`](release-runbook.md) — separate procedure for `@transitrix/*` npm packages.
