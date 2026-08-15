# Release runbook — Open VSX (Cursor, VSCodium, Windsurf)

How to publish Transitrix Studio's VS Code extension to the
[Open VSX Registry](https://open-vsx.org) so Cursor users (and the rest of
the Open VSX consumer set — VSCodium, Windsurf, Gitpod, etc.) can install
it directly from within their editor.

Open VSX is the Eclipse Foundation registry that Cursor reads — there is
no separate "Cursor marketplace". Publishing the same universal `.vsix`
to Open VSX covers all these editors in one action.

The npm publish flow for `@transitrix/diagrams` / `@transitrix/cli` is a
separate procedure — see [`release-runbook.md`](release-runbook.md).
The VS Code Marketplace publish flow builds the same universal VSIX
documented in [`packaging.md`](packaging.md); the steps below mirror it
for the `ovsx` CLI.

## What gets published

The **same universal VSIX** the VS Code Marketplace ships — there is no
separate "Cursor build". The extension declares no runtime `dependencies`
and has no OS/arch-specific content (`@resvg/resvg-js`, its one-time
native dependency, was removed — hold 3, transitrix-hq#141), so a single
`vsce package` (no `--target`) run, from any machine, produces the
artefact for every platform. Per-target packaging was retired in hold 4
(transitrix-hq#142).

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

## Pre-flight checklist (manual publish only)

The CI path needs none of this — it downloads the release-attached VSIX
directly. Run these checks only when publishing by hand from a clean
checkout of the tag/commit being released:

- [ ] The universal VSIX to publish is on disk, either downloaded from the
      release's assets or freshly built per [`packaging.md`](packaging.md).
- [ ] The `version` field in `extension/package.json` matches the release
      tag.
- [ ] `extension/README.md` and the icon (`extension/icon.png`) are as
      intended — Open VSX renders these on the listing page from the VSIX
      itself, so there is nothing extra to sync.
- [ ] `OVSX_PAT` is set in the current shell and `ovsx` is on PATH:
      ```bash
      ovsx --version
      echo "$OVSX_PAT" | head -c 4   # sanity-check it is set
      ```

## Publishing

`ovsx publish` accepts a `.vsix` path directly; the namespace and
version are read from the file. One publish covers every platform:

```bash
npm run package-extension
ovsx publish output/transitrix-studio-<version>.vsix
```

`ovsx` returns a JSON blob containing the published download URL on
success.

## Verify

Confirm the listing returns the expected version:

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

The Open VSX publish runs from the GitHub Release directly — it does not
wait on a VS Code Marketplace publish.

### CI path (recommended)

The `.github/workflows/openvsx-publish.yml` workflow runs automatically
on every GitHub Release (`release: types: [published]`) from a single
`ubuntu-latest` job: downloads the universal VSIX that
`.github/workflows/attach-release-vsix.yml` already attached to the
release at draft time (no rebuild), verifies it against the recorded
SHA-256, and publishes it with `ovsx publish`. The workflow reads
`OVSX_PAT` from the repo Actions secret.

### Manual fallback

To publish by hand (e.g. to re-publish a failed run), follow the steps
in the **Publishing** section above from any machine. You can also
trigger the workflow manually via the **workflow_dispatch** button in
the Actions tab.

After every publish (CI or manual):

1. Confirm the Open VSX version field matches the Marketplace listing:
   ```bash
   curl -s https://open-vsx.org/api/transitrix/transitrix-studio | jq '.version'
   ```
2. Spot-check the listing in Cursor's Extensions panel before announcing
   the release.

## Unpublish / yank

Open VSX permits removing a specific version through the web UI
(*Namespace → Extension → Version → Delete*). Prefer a patch release
with a fix over a delete — Cursor / VSCodium clients may have cached
the install metadata and a re-publish at the same version is rejected.

## Relates

- [`packaging.md`](packaging.md) — VSIX packaging (the artefact shape Open VSX consumes).
- [`release-runbook.md`](release-runbook.md) — separate procedure for `@transitrix/*` npm packages.
