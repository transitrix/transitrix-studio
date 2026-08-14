# Packaging the VS Code extension

The extension is pure TypeScript/JS and packages into a single, universal
`.vsix` — no native module, no OS/arch-specific content, no runtime
`dependencies` declared at all. **PNG export used to be the exception:** it
depended on `@resvg/resvg-js`, a native module whose rasterizer binary
shipped as a per-OS optional dependency. That dependency is gone (hold 3,
transitrix-hq#141): PNG export now rasterizes in the preview webview's own
canvas.

With no platform-specific component, `vsce package` (no `--target`) is the
only packaging path — the per-target CI matrix that used to exist has been
retired (hold 4, transitrix-hq#142). One VSIX installs on every OS/arch VS
Code supports, including targets no CI runner ever built for (e.g. Intel
macOS, Windows ARM).

## Build a VSIX

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

## Building in CI (attested, once)

`.github/workflows/build-vsix.yml` packages the same universal VSIX in CI —
`npm ci` from the committed lockfile, then `npm run package-extension` — and
additionally records the artefact's SHA-256 and attests it with
[`actions/attest-build-provenance`](https://github.com/actions/attest-build-provenance)
(no external service, no key: GitHub's own OIDC/Sigstore integration). It
exposes the result as a downloadable build artifact named `universal-vsix`
(the `.vsix` plus a `.sha256` file) — nothing in this workflow publishes
anywhere; there are no registry credentials in its scope.

It is a reusable workflow (`workflow_call`), meant to be called once by a
verification pipeline and once by the registry-publish pipeline, so both
consume the identical built-and-attested file rather than each rebuilding
its own copy. `workflow_dispatch` is also available for a standalone
inspection run. Callers must grant at least `contents: read`,
`id-token: write`, `attestations: write` for the attestation step to
succeed.

## Publishing to the VS Code Marketplace

Publishing a GitHub Release triggers `.github/workflows/vscode-marketplace-publish.yml`,
which builds and publishes the universal VSIX with `vsce publish`. The one-time
prerequisite (an Azure DevOps PAT saved as the `VSCE_PAT` Actions secret) and the
post-publish verification steps are documented in
[`vscode-marketplace-publish-runbook.md`](vscode-marketplace-publish-runbook.md).

## Publishing to Open VSX (Cursor, VSCodium, Windsurf)

Cursor and other VS Code derivatives read the [Open VSX Registry](https://open-vsx.org),
not the VS Code Marketplace. The same universal VSIX above publishes to
Open VSX with `ovsx publish <vsix>` — see [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md)
for the registry-specific prerequisites (namespace claim, `OVSX_PAT`) and
the per-release procedure.
