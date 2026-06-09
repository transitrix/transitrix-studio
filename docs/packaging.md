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

## Archive paths must stay outside `extension/`

Retired extension sources (e.g. dropped previews) live under
`.archive/extension/` at the **repo root**, not inside `extension/` and not
under the legacy `0. archive/extension/` path. Anything under
`extension/0. archive/` or `extension/.archive/` would otherwise land in the VSIX
unless excluded.

Safeguards (`.archive` convention — see `CLAUDE.md`):

- `extension/.vscodeignore` lists `0. archive/**` and `.archive/**`
- `node scripts/verify-extension-packaging.mjs` runs before every
  `build-extension.bat` / `build-extension.sh` `vsce package` step and fails if
  archive folders appear under `extension/` or if legacy `0. archive/extension/`
  exists at the repo root

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
