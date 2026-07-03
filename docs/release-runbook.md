# Release runbook

How a Transitrix Studio release ships: **publishing the GitHub Release is
the trigger for everything** — npm packages, both VS Code marketplaces, and
the JetBrains plugin all publish from CI.

## What publishes where

| Artifact | Pipeline | Trigger |
|---|---|---|
| `@transitrix/diagrams` + `@transitrix/cli` → npm | `.github/workflows/npm-publish.yml` | GitHub Release **published** (or `workflow_dispatch`) |
| VS Code extension → VS Code Marketplace | `.github/workflows/vscode-marketplace-publish.yml` | same |
| VS Code extension → Open VSX (Cursor / VSCodium / Windsurf) | `.github/workflows/openvsx-publish.yml` | same |
| IntelliJ plugin → JetBrains Marketplace | `.github/workflows/jetbrains-publish.yml` | same (plugin version derived from the release tag, `v` prefix stripped) |

Secrets backing the automation (repo Actions secrets): `NPM_TOKEN`
(read-write on **both** `@transitrix/diagrams` and `@transitrix/cli`;
mind the expiry if it is a granular token), `VSCE_PAT`, `OVSX_PAT`, and
the JetBrains signing set (`CERTIFICATE_CHAIN`, `PRIVATE_KEY`,
`PRIVATE_KEY_PASSWORD`, `PUBLISH_TOKEN`).

The npm publish steps are idempotent: each compares the workspace version
with the registry and skips when that version is already published, so
releases that bump only one package (or neither) stay green.

## Release procedure

### 1. Release PR (agent-preparable)

One PR against `main` — the pattern of the 2.8.0 (#339) and 2.9.0 (#344)
notes PRs:

- `CHANGELOG.md`: retitle `[Unreleased]` to `[X.Y.Z] — <date>`; make sure
  every PR merged since the previous notes PR has an entry (fixes merged
  after the notes PR are the usual gap).
- Versions:
  - root `package.json` + `extension/package.json` — bump together via
    `node scripts/bump-extension-version.mjs minor|patch|major`;
  - `packages/diagrams/package.json` — bump when the diagrams library
    changed since its last published version (independent semver line);
  - `packages/cli/package.json` — bump when the bundled compiler sources
    (`src/`) changed (independent semver line).
- Pre-flight, from a clean tree on the release branch:
  - [ ] `npm run build` green
  - [ ] `npm run compile` + `npm run compile:extension` green
  - [ ] `npm test` green (root core + diagrams workspace)
  - [ ] CHANGELOG heading matches the version fields

### 2. Merge + draft release (Valerii gates)

- Merge the release PR; verify `main` actually has the bump.
- Create a **draft** GitHub Release: tag `vX.Y.Z`, target `main`, title
  `Transitrix Studio X.Y.Z`, body = the CHANGELOG section under a
  `## What's changed` heading. (A draft creates no tag; the tag is created
  on the then-current target when the draft is published — so always merge
  the release PR **before** publishing.)

### 3. Publish the release → automation fires

Publishing the release starts all four workflows. Watch them under
Actions → filter event `release`:

- `npm — publish packages` — `@transitrix/diagrams` first, then
  `@transitrix/cli` (versions that are already on the registry are
  skipped). Verify with `npm view @transitrix/diagrams version` and
  `npm view @transitrix/cli version`.
- `VS Code Marketplace — multi-platform publish` — per-platform VSIX build
  (`extension:prep` installs the platform-correct `@resvg/resvg-js-*`
  binary) + `vsce publish`.
- `Open VSX — multi-platform publish` — same build matrix, `ovsx publish`.
- `JetBrains Marketplace — publish` — sets `pluginVersion` in
  `intellij/gradle.properties` from the release tag, builds, signs,
  publishes.

Every workflow also supports `workflow_dispatch` for re-runs (e.g. a
transient marketplace failure) without re-publishing the release.

### 4. Post-publish sanity check (optional)

The `@transitrix/cli` slim package is assembled by
`scripts/build-cli-package.mjs` at `prepack`; it bundles `src/cli.ts` +
handlers into `packages/cli/dist/` and copies `schemas/` next to it. The
package does **not** depend on `@transitrix/diagrams` — the diagrams
source it needs is bundled in.

Sanity check the published bin on a fresh machine/directory:

```bash
npm i -g @transitrix/cli
transitrix --help
transitrix compile <sample>.yaml out.bpmn
```

Manual publish fallback (e.g. the token expired mid-release) — from a
clean checkout of the release commit:

```bash
npm pack --dry-run --workspace packages/cli    # inspect: dist/, schemas/, README, LICENSE only
npm publish --access public --workspace packages/cli   # prompts npm login / 2FA OTP
```

## Unpublish / yank (npm)

npm only permits unpublish within 72 hours, and it breaks cached installs
downstream. Prefer a patch release; if a version is genuinely broken, mark
it deprecated instead:

```bash
npm deprecate @transitrix/diagrams@1.0.0 "Broken — use 1.0.1+"
```

## Relates

- [`docs/packaging.md`](packaging.md) — VSIX packaging details.
- [`docs/vscode-marketplace-publish-runbook.md`](vscode-marketplace-publish-runbook.md),
  [`docs/openvsx-publish-runbook.md`](openvsx-publish-runbook.md) — the
  marketplace-specific notes the workflows codify.
- [`docs/cli.md`](cli.md) — CLI install docs.
