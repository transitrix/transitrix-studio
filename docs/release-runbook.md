# Release runbook

How a Transitrix Studio release ships. Since the CI publish workflows landed
(2026-06), **publishing the GitHub Release is the trigger for everything
except the CLI** — the manual npm procedure this runbook used to describe
survives only for `@transitrix/cli`.

## What publishes where

| Artifact | Pipeline | Trigger |
|---|---|---|
| `@transitrix/diagrams` → npm | `.github/workflows/npm-publish.yml` | GitHub Release **published** (or `workflow_dispatch`) |
| VS Code extension → VS Code Marketplace | `.github/workflows/vscode-marketplace-publish.yml` | same |
| VS Code extension → Open VSX (Cursor / VSCodium / Windsurf) | `.github/workflows/openvsx-publish.yml` | same |
| IntelliJ plugin → JetBrains Marketplace | `.github/workflows/jetbrains-publish.yml` | same (plugin version derived from the release tag, `v` prefix stripped) |
| `@transitrix/cli` → npm | **manual** (see below) | maintainer runs `npm publish` |

Secrets backing the automation (repo Actions secrets): `NPM_TOKEN`
(granular, read-write on `@transitrix/diagrams` only — this is why the CLI
is not automated), `VSCE_PAT`, `OVSX_PAT`, and the JetBrains signing set
(`CERTIFICATE_CHAIN`, `PRIVATE_KEY`, `PRIVATE_KEY_PASSWORD`,
`PUBLISH_TOKEN`).

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
    (`src/`) changed (independent semver line; publish is manual, step 4).
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

- `npm — publish @transitrix/diagrams` — verify with
  `npm view @transitrix/diagrams version`.
- `VS Code Marketplace — multi-platform publish` — per-platform VSIX build
  (`extension:prep` installs the platform-correct `@resvg/resvg-js-*`
  binary) + `vsce publish`.
- `Open VSX — multi-platform publish` — same build matrix, `ovsx publish`.
- `JetBrains Marketplace — publish` — sets `pluginVersion` in
  `intellij/gradle.properties` from the release tag, builds, signs,
  publishes.

Every workflow also supports `workflow_dispatch` for re-runs (e.g. a
transient marketplace failure) without re-publishing the release.

### 4. `@transitrix/cli` — manual npm publish

Not covered by automation (the `NPM_TOKEN` grant is scoped to
`@transitrix/diagrams`). The slim package is assembled by
`scripts/build-cli-package.mjs`, which runs automatically at `prepack`;
it bundles `src/cli.ts` + handlers into `packages/cli/dist/` and copies
`schemas/` next to it. The package does **not** depend on
`@transitrix/diagrams` — the diagrams source it needs is bundled in.

From a clean checkout of the release commit:

```bash
npm pack --dry-run --workspace packages/cli    # inspect: dist/, schemas/, README, LICENSE only
npm publish --access public --workspace packages/cli   # prompts npm login / 2FA OTP
npm view @transitrix/cli version
```

Sanity check the published bin on a fresh machine/directory:

```bash
npm i -g @transitrix/cli
transitrix --help
transitrix compile <sample>.yaml out.bpmn
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
