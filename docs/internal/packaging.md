# Packaging the VS Code extension

The extension is pure TypeScript/JS and packages into a single,
platform-neutral `.vsix` — no native module. **PNG export used to be the
exception:** it depended on `@resvg/resvg-js`, a native module whose
rasterizer binary shipped as a per-OS optional dependency. That dependency is
gone (hold 3, transitrix-hq#141): PNG export now rasterizes in the preview
webview's own canvas, so the packaged extension has no OS/arch-specific
content and declares no runtime `dependencies` at all.

The per-target packaging below is CI's current mechanism, not a correctness
requirement anymore — dropping it is hold 4 of the same epic
(transitrix-hq#142).

## Build a VSIX for the current platform

```bash
npm run package-extension
```

`extension:prep` bundles the extension and the compiler; there is no runtime
dependency install step. The resulting `.vsix` installs on any OS/arch.

## Packaging hygiene

Only runtime assets may live under `extension/`. Before every
`scripts/package-extension.mjs` `vsce package` step,
`node scripts/verify-extension-packaging.mjs` fails the build if forbidden
non-runtime paths appear there (`extension/.vscodeignore` is a second line of
defence).

## Build per-platform VSIXs for the Marketplace

Until hold 4 (transitrix-hq#142) lands a single universal VSIX, CI still tags
each VSIX with `vsce package --target <target>` and builds each on a matching
OS/arch runner (a CI matrix):

```bash
# on a Windows x64 runner
npm run extension:prep
cd extension && npx vsce package --target win32-x64

# on a macOS arm64 runner
npm run extension:prep
cd extension && npx vsce package --target darwin-arm64

# on a Linux x64 runner
npm run extension:prep
cd extension && npx vsce package --target linux-x64
```

Targets to cover the common desktop set: `win32-x64`, `win32-arm64`,
`darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`. `vsce publish`
accepts the same `--target` flag.

> A `vsce package` with **no** `--target` produces a genuinely universal VSIX
> now (no native dependency) — still avoided for Marketplace publishing only
> because the per-target CI matrix hasn't been retired yet (hold 4).

## Publishing to the VS Code Marketplace

Publishing a GitHub Release triggers `.github/workflows/vscode-marketplace-publish.yml`,
which runs `vsce publish` across the platform matrix automatically. The one-time
prerequisite (an Azure DevOps PAT saved as the `VSCE_PAT` Actions secret) and the
post-publish verification steps are documented in
[`vscode-marketplace-publish-runbook.md`](vscode-marketplace-publish-runbook.md).

## Publishing to Open VSX (Cursor, VSCodium, Windsurf)

Cursor and other VS Code derivatives read the [Open VSX Registry](https://open-vsx.org),
not the VS Code Marketplace. The same per-platform VSIXs above publish to
Open VSX with `ovsx publish <vsix>` — see [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md)
for the registry-specific prerequisites (namespace claim, `OVSX_PAT`) and
the per-release procedure.
