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

## Consumer boundaries

The public developer repository includes source, tests, build tools and contributor
instructions. The repository publish manifest inventories that surface; it does
not authorize copying the whole repository into an installed package.

| Delivery | Consumer need and retained files | Repository-only inputs |
| --- | --- | --- |
| VSIX | VS Code installer metadata; extension/compiler/webview bundles; schemas, syntax, CSS/fonts and icons loaded at runtime; README, changelog, gallery media and license used by the listing and installed documentation | TypeScript build inputs, development-host test harness and configuration |
| npm CLI | Executable and validator bundles, runtime version/provenance JSON, JSON schemas, package metadata, README and license | Tests, build scripts and source trees |
| npm diagrams SDK | Runtime exports, TypeScript declarations, CSS and the source layout explicitly documented in the package README for downstream developers; package metadata, README and license | Test fixtures, test files, source maps and build tools |
| JetBrains | Plugin metadata/icons, JVM classes and JCEF host/renderer resources inside the plugin JAR | Kotlin sources, Gradle tooling and tests |
| Obsidian | The installer/runtime's main.js, manifest.json and styles.css; documentation, licensing and development source remain available from the linked public repository | Build tools, test suites, examples and source files are excluded from the installed release assets |

The VSIX checker validates the complete archive path set and refuses both extra
files and missing consumer dependencies. Test sources remain in the repository
and are compiled outside the archive for the development-host smoke tests.
The npm/Obsidian composition check uses actual npm dry-run packlists after the
build and the assembled Obsidian directory, without publishing anything:

```sh
node --test scripts/consumer-package-paths.test.mjs
npm run build:cli-package
npm run package:obsidian-plugin
node scripts/consumer-package-paths.mjs
```

JetBrains JAR composition can be checked with the same path verifier's
`jetbrains-jar` profile. This does not replace IDE compatibility testing.
