# Release runbook

How a Transitrix Studio release ships: **an explicit draft-attachment run builds
and attaches the universal VSIX; publishing the verified draft triggers the
registry-publish jobs**, which consume that same attached file rather than
rebuilding — npm packages, Open VSX, and the JetBrains plugin all publish
from CI.

## What publishes where

| Artifact | Pipeline | Trigger |
|---|---|---|
| Universal VSIX, attached to the release + SHA-256 recorded | `.github/workflows/attach-release-vsix.yml` | Explicit `workflow_dispatch` for an existing draft tag, run against its exact target commit |
| `@transitrix/diagrams` + `@transitrix/cli` → npm | `.github/workflows/npm-publish.yml` | GitHub Release **published** (or `workflow_dispatch`) |
| VS Code extension → VS Code Marketplace | `.github/workflows/vscode-marketplace-publish.yml` | `workflow_dispatch` only — see that workflow's header before changing this |
| VS Code extension → Open VSX (Cursor / VSCodium / Windsurf) | `.github/workflows/openvsx-publish.yml` | GitHub Release **published** (or `workflow_dispatch`); downloads the asset `attach-release-vsix.yml` attached rather than rebuilding |
| IntelliJ plugin → JetBrains Marketplace | `.github/workflows/jetbrains-publish.yml` | GitHub Release **published** (plugin version derived from the release tag, `v` prefix stripped) |

Secrets backing the automation (repo Actions secrets): `NPM_TOKEN`
(read-write on **both** `@transitrix/diagrams` and `@transitrix/cli`;
mind the expiry if it is a granular token), `VSCE_PAT`, `OVSX_PAT`, and
the JetBrains signing set (`CERTIFICATE_CHAIN`, `PRIVATE_KEY`,
`PRIVATE_KEY_PASSWORD`, `PUBLISH_TOKEN`).

The npm publish steps are idempotent: each compares the workspace version
with the registry and skips when that version is already published, so
releases that bump only one package (or neither) stay green.

`npm-publish.yml` gates both publish steps on a `version-guards` job
(`scripts/check-release-versions.mjs`). It compares the release commit with
the previous `v*` tag and fails the release, naming the package, when either:

- `packages/diagrams/src` changed over that span but
  `@transitrix/diagrams` is releasing under the same version — the change
  would reach the registry under a version that doesn't carry it; or
- `@transitrix/diagrams` moved but `@transitrix/cli` did not — `cli` bundles
  the diagrams source at prepack, so the idempotent publish step would skip
  it and ship a stale bundled copy.

Because those two invariants are checked here, a pull request never has to
bump either version field, and two PRs touching `packages/diagrams/src` no
longer collide on one.

## Release procedure

### 1. Release PR (agent-preparable)

One PR against `main` — the pattern of the 2.8.0 (#339) and 2.9.0 (#344)
notes PRs:

- `CHANGELOG.md`: first run `node scripts/assemble-changelog.mjs` to fold
  every `changelog/fragments/*.md` file accumulated since the previous
  release into `## Unreleased` (it deletes the fragments it consumes — see
  [`changelog/fragments/README.md`](../../changelog/fragments/README.md)).
  Then retitle `## Unreleased` to `## [X.Y.Z] — <date>`; make sure every PR
  merged since the previous notes PR has an entry (a PR that predates the
  fragment mechanism, or whose author forgot to add one, is the usual gap —
  add it by hand).
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

### 2. Merge (Valerii gates)

- Merge the release PR; verify `main` actually has the bump.

### 3. Draft release (agent-preparable)

- Create a **draft** GitHub Release: tag `vX.Y.Z`, target the exact release
  commit SHA, title `Transitrix Studio X.Y.Z`, body = the CHANGELOG section
  under a `## What's changed` heading. A draft creates no tag; the tag is
  created when the draft is published. Always merge the release PR before
  drafting, and pin the draft to that merge commit rather than to a moving
  branch.
- Dispatch `attach-release-vsix.yml` against that same commit and pass the
  draft's `vX.Y.Z` tag as its `tag` input. The workflow refuses a published
  release, a non-semver tag, or a draft targeting a different commit. It
  builds the universal VSIX once, records its SHA-256, and attaches both to
  the draft as release assets. Confirm the run is green and both assets are
  present before the next step — a draft published without them leaves the
  registry-publish jobs with nothing to download.
- Valerii reviews the draft, verifies the branch/commit it targets and the
  attached asset, and publishes it — see step 4.

### 4. Publish the release → automation fires

Publishing the release starts the registry-publish workflows. Watch them
under Actions → filter event `release`:

- `npm — publish packages` — `@transitrix/diagrams` first, then
  `@transitrix/cli` (versions that are already on the registry are
  skipped). Verify with `npm view @transitrix/diagrams version` and
  `npm view @transitrix/cli version`.
- `Open VSX — publish` — downloads the VSIX `attach-release-vsix.yml`
  attached to this release (no rebuild) and runs `ovsx publish` on that
  exact file.
- `JetBrains Marketplace — publish` — sets `pluginVersion` in
  `intellij/gradle.properties` from the release tag, builds, signs,
  publishes.

`VS Code Marketplace — publish` does **not** fire automatically — it is
`workflow_dispatch` only; see that workflow's header comment before
changing this.

Every workflow also supports `workflow_dispatch` for re-runs (e.g. a
transient registry failure) without re-publishing the release.

### 5. Post-publish sanity check (optional)

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

- [`packaging.md`](packaging.md) — VSIX packaging details.
- [`vscode-marketplace-publish-runbook.md`](vscode-marketplace-publish-runbook.md),
  [`openvsx-publish-runbook.md`](openvsx-publish-runbook.md) — the
  marketplace-specific notes the workflows codify.
- [`docs/cli.md`](cli.md) — CLI install docs.
