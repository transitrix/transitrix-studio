# Release runbook — npm

How to publish Transitrix's npm packages by hand. This is the manual procedure
agreed in strategy hub issue `vkgeorgia/strategy#199`; CI publish-on-tag
automation is a deferred follow-up.

The VS Code extension `.vsix` flow is a separate pipeline — see
[`docs/packaging.md`](packaging.md) for the per-platform build, and
[`docs/openvsx-publish-runbook.md`](openvsx-publish-runbook.md) for the
Open VSX (Cursor / VSCodium / Windsurf) publish hop after each
Marketplace release.

## Packages

Two scoped packages live on the `@transitrix/*` namespace:

| Package | Source | Bin | Notes |
|---|---|---|---|
| `@transitrix/diagrams` | `packages/diagrams/` | — | Shared rendering / validation / pure-mutation library. Consumed by the CLI, the VS Code extension, and downstream tools. |
| `@transitrix/cli` | slim package — own `package.json` with `bin` + `files` allowlist, `dist/cli.js` + runtime deps only (not the whole repo) | `transitrix` only (no `cervin` alias — the new package is born in the 2.0 era, see `#191`) | First release `1.0.0`, independent of the extension version line. |

**Publish order matters: `@transitrix/diagrams` first, then `@transitrix/cli`** —
the CLI depends on diagrams; npm has to be able to resolve it.

## Prerequisites (one-time, Valerii action)

These steps are outside the agent scope and must be done before the first
publish session:

1. **Create the `transitrix` npm organisation** at <https://www.npmjs.com/org/create>.
2. **Enable 2FA for `@transitrix/*` writes** (org settings → "Require 2FA for write actions").
3. Confirm `npm whoami` shows the publishing account is a member of the org with
   publish permission on the scope.
4. (Optional, recommended) Reserve the unscoped `transitrix` name on npm so a
   future squatter can't grab it — even if we ship under `@transitrix/cli`.

A registry token is **not** needed for manual publishes; `npm publish` uses the
interactive 2FA OTP. A token is only required when CI publish-on-tag is wired
up later.

## Pre-flight checklist (run for every release)

Run from a clean checkout of the tag/commit being released:

- [ ] `git status` clean; on the exact commit being shipped (no local edits).
- [ ] `npm ci` (not `npm install`) — reproducible install from `package-lock.json`.
- [ ] `npm run build` succeeds for the root package, emitting `dist/`.
- [ ] `npm --workspace packages/diagrams run build` succeeds, emitting
      `packages/diagrams/dist/`.
- [ ] `npm test` is green (root core tests + diagrams workspace tests).
- [ ] `npm run compile && npm run compile:extension` are green
      (catches type regressions the test suite doesn't exercise).
- [ ] `CHANGELOG.md` has an entry for the version being shipped (move
      `[Unreleased]` items to a dated heading; bump the version header).
- [ ] The version field in the package being published matches the CHANGELOG
      heading.
- [ ] `npm whoami` returns the expected publishing account and is a member of
      the `transitrix` org with publish permission on the scope.

## Publishing `@transitrix/diagrams`

1. **Flip the publish flag.** In `packages/diagrams/package.json` ensure
   `"private": false` (or the field is absent). Add `homepage`, `repository`,
   and `bugs` fields pointing at the monorepo if missing — npm shows these on
   the package page.
2. **Set the version.** First release: `1.0.0` per the published-package
   versioning decision. Subsequent releases follow semver from there
   (independent of the extension version line).
3. **Dry-run the pack** to inspect the tarball contents:
   ```bash
   npm --workspace packages/diagrams pack --dry-run
   ```
   Verify the listed files match the `"files"` allowlist
   (`dist/`, `src/`) — nothing extraneous, no secrets, no `node_modules`.
4. **Publish:**
   ```bash
   npm --workspace packages/diagrams publish --access public
   ```
   - `--access public` is required for the first publish of a scoped package;
     the default is `restricted`.
   - npm prompts for the 2FA OTP interactively.
5. **Verify** the package appeared on the registry:
   ```bash
   npm view @transitrix/diagrams version
   ```

## Publishing `@transitrix/cli`

The slim CLI package is *assembled* — it owns its `package.json`, `bin`, and
`files` allowlist, ships bundled `dist/` + `schemas/` only, and does **not**
include the rest of the monorepo. The assembly script is
`scripts/build-cli-package.mjs`; the workspace's `prepack` runs it
automatically for `npm pack` and `npm publish`.

1. **Prepare the publishable directory.** From the repo root, run
   `npm run build:cli-package` (or rely on the workspace's `prepack` to do
   it). The script esbuild-bundles `src/cli.ts`, `src/repo-validate.ts`, and
   `src/export-compliance.ts` into `packages/cli/dist/`, externalising the
   runtime npm deps (`ajv`, `ajv-formats`, `bpmn-moddle`, `elkjs`, `js-yaml`,
   `xmlbuilder2`) and copying the JSON Schemas next to `dist/` (the runtime
   resolves `dist/../schemas/bpmn-dsl.schema.json`, see
   `src/schema-path.ts`). The slim `package.json` declares
   `bin: { transitrix: "./dist/cli.js" }`, the runtime `dependencies` only
   (no `devDependencies`), and `engines.node >= 20`. No `cervin` bin alias —
   see the per-package table above.
2. **Confirm the dependency on `@transitrix/diagrams`** in the slim
   `package.json` points at a version range that includes the version just
   published in the previous step (e.g. `"^1.0.0"`).
3. **Dry-run:**
   ```bash
   npm pack --dry-run --workspace packages/cli
   ```
   Confirm the tarball contains `dist/cli.js`, `dist/repo-validate.js`,
   `dist/export-compliance.js`, `schemas/*.json`, the slim `package.json`,
   `README.md`, `LICENSE` — and nothing else. The packed tarball is
   ~40 kB / 9 files at `1.0.0`.
4. **Publish:**
   ```bash
   npm publish --access public --workspace packages/cli
   ```
   npm prompts for the 2FA OTP.
5. **Verify on a clean machine / fresh directory:**
   ```bash
   npm i -g @transitrix/cli
   transitrix --help                  # canonical
   transitrix compile <sample>.yaml out.bpmn
   ```
   On Windows: `where.exe transitrix`. On macOS / Linux: `which transitrix`.

## Post-publish

- **Tag the git commit** for traceability (matches the version published):
  ```bash
  git tag -s diagrams-v1.0.0 -m "Release @transitrix/diagrams 1.0.0"
  git tag -s cli-v1.0.0      -m "Release @transitrix/cli 1.0.0"
  git push --tags
  ```
- **Update consumer docs.** [`docs/cli.md`](cli.md) currently states "the CLI
  is not yet published to npm" — promote `npm i -g @transitrix/cli` to the
  primary install path and demote the `npm link`-from-a-clone instructions to
  a "from source" subsection.
- **Update strategy hub issue `#199`** with the published versions and a link
  to the npm pages; close when the acceptance criteria are met.
- **Notify downstream consumers** (e.g. the maintainer's compliance
  renderer) that they can switch from the clone+`npm link` recipe to
  `npm i -g @transitrix/cli`.

## Unpublish / yank

npm only permits unpublish within 72 hours of publish for non-trivial
packages, and even within that window it's disruptive (cached installs break
for downstream consumers). Prefer a **patch release with a fix** over an
unpublish. If a published version is genuinely broken, mark it deprecated:

```bash
npm deprecate @transitrix/diagrams@1.0.0 "Broken — use 1.0.1+"
```

## Relates

- Strategy hub: [`vkgeorgia/strategy#199`](https://github.com/vkgeorgia/strategy/issues/199) — the npm-publish task, including the decisions this runbook codifies.
- [`docs/cli.md`](cli.md) — current install-from-clone instructions (to be updated post-publish).
- [`docs/packaging.md`](packaging.md) — VS Code extension `.vsix` packaging (separate pipeline).
- `CLAUDE.md` §Cervin naming — explains why `@transitrix/cli` ships with no `cervin` bin alias.
