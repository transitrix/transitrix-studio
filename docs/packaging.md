# Packaging the VS Code extension

Most of the extension is pure TypeScript/JS and packages into a single,
platform-neutral `.vsix`. **PNG export is the exception:** it depends on
`@resvg/resvg-js`, a native module whose rasterizer binary is shipped as a
per-OS optional dependency (`@resvg/resvg-js-win32-x64-msvc`,
`@resvg/resvg-js-darwin-arm64`, …). `npm install` lays down only the binary
matching the machine doing the install.

That makes the extension **platform-specific** for distribution purposes
(vkgeorgia/strategy#32 chose per-platform VSIX over one ~10 MB fat bundle).

## Build a VSIX for the current platform

```bash
npm run package-extension
```

`extension:prep` installs the runtime deps into `extension/node_modules`
(including the resvg binary for *this* OS/arch) and bundles the extension;
`build-compiler-bundle.mjs` fails loudly if no `@resvg/resvg-js-<platform>`
binary landed. The resulting `.vsix` is correct **only for the OS/arch it was
built on** — installing it elsewhere makes PNG export fail at runtime
(SVG export and previews are unaffected).

## Packaging hygiene

Only runtime assets may live under `extension/`. Before every
`build-extension.bat` / `build-extension.sh` `vsce package` step,
`node scripts/verify-extension-packaging.mjs` fails the build if forbidden
non-runtime paths appear there (`extension/.vscodeignore` is a second line of
defence).

## Build per-platform VSIXs for the Marketplace

Tag each VSIX with `vsce package --target <target>` so the Marketplace serves
the right artifact per client. Because the resvg binary is fetched per OS,
**each target must be built on a matching OS/arch** (a CI matrix is the
clean way):

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

> A `vsce package` with **no** `--target` still works, but the produced VSIX
> claims universal compatibility while carrying only the build machine's
> binary — avoid it for Marketplace publishing now that a native dependency
> is in play.

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
