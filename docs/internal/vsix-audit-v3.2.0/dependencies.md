# v3.2.0 dependency-tree reconstruction and advisory check

Task: transitrix-hq#134 · Epic: transitrix-hq#130. Builds on transitrix-hq#132 (artefacts +
SHA-256) and transitrix-hq#133 (path inventory, which is where every `package@version` below
was read from — directly out of the published, hash-fixed VSIX, not reinstalled).

**No stop-and-report was triggered** — every packaged runtime file traces to a declared
dependency in `extension/package.json` (7 direct) plus that dependency's own transitive tree
(19 more, resolved). See the finding below on why "declared dependency", not "declared
lockfile entry", is the correct bar here.

## Finding: the root `package-lock.json` does not govern `extension/`'s dependencies

The task's own framing assumes `package-lock.json` at the release tag is "the authority for
versions." Checked, and that assumption does not hold for this repository:

- Root `package.json`'s `workspaces` is `["packages/*"]` — `extension/` is **not** an npm
  workspace member. `extension/` carries its own `package.json` with its own
  `dependencies` block, resolved independently.
- `extension/package-lock.json` is itself in `.gitignore` — no lockfile for `extension/` is
  ever committed.
- `scripts/build-compiler-bundle.mjs` (the `extension:prep` step that installs
  `extension/`'s runtime dependencies) copies **only** `extension/package.json` into an
  isolated temp directory and runs
  `npm install --omit=dev --no-package-lock --no-audit --no-fund --legacy-peer-deps` —
  `--no-package-lock` is explicit and deliberate (comment in the script: the temp-dir
  approach exists specifically to be "workspace-blind", independent of root's lockfile/config).
- Root `package-lock.json` at tag `v3.2.0` was checked directly: it contains no entry for
  `extension/` and no entries for six of `extension/`'s seven direct dependencies (only
  `js-yaml` happens to also appear, pulled in by an unrelated root-level workspace package,
  at a version that is incidental, not authoritative for `extension/`).

**Consequence:** there is no lockfile anywhere in this repository's history that pins what
`extension:prep` installs. Each CI publish job resolves the caret ranges in
`extension/package.json` against whatever the npm registry serves at that moment — so the
*only* forensic record of "what was actually installed at publish time" is the artefact
itself. That is why the version list below was read out of the already-hash-fixed VSIX
(transitrix-hq#133), not reconstructed from a manifest — it is more authoritative, not less.
This is worth a decision-of-record on whether `extension/`'s runtime deps should gain a
committed lockfile going forward; flagging as an observation per the epic's "observations …
belong here as notes" instruction, not remediating under this epic.

## Dependency tree at publish time

**7 direct** runtime dependencies (`extension/package.json`), all resolving inside their
declared semver range — the exact version shipped, not "latest today":

| Direct dependency | Declared range | Version shipped in v3.2.0 |
|---|---|---|
| `@resvg/resvg-js` | `^2.6.2` | `2.6.2` |
| `ajv` | `^8.17.1` | `8.20.0` |
| `ajv-formats` | `^3.0.1` | `3.0.1` |
| `bpmn-moddle` | `^10.0.0` | `10.1.0` |
| `elkjs` | `^0.12.0` | `0.12.0` |
| `js-yaml` | `^4.1.0` | `4.3.1` |
| `xmlbuilder2` | `^3.1.1` | `3.1.1` |

**19 transitive** dependencies, all resolved by the 7 above (`bpmn-moddle` → `moddle`,
`moddle-xml`, `min-dash`, `saxen`; `xmlbuilder2` → `@oozcitak/*`; `ajv`/`ajv-formats` →
`fast-deep-equal`, `fast-uri`, `json-schema-traverse`; `js-yaml` → `argparse`; `elkjs` →
`esprima`; `@resvg/resvg-js` → its per-platform native-binary optional dependency,
`sprintf-js`/`require-from-string` pulled in by the `ajv`/`elkjs` chain).

## Advisory check

Every one of the 26 `package@version` pairs (7 direct + 19 transitive, one row per platform's
`@resvg/resvg-js-<platform>` binary counted once each) was queried against
[OSV.dev](https://osv.dev) (`POST https://api.osv.dev/v1/query`, ecosystem `npm`) — OSV
aggregates the GitHub Advisory Database plus npm's own advisory feed, so this is the public
advisory record the task asks for, queried live rather than assumed.

**Result: zero vulnerabilities across all 26 packages, at the exact versions shipped.** No
`npm audit`-equivalent finding, no deprecated package. Full per-package result (OSV response
verbatim) is in [`advisory-results.json`](advisory-results.json).

## Registry publication metadata

For each package, `registry.npmjs.org/<name>` was queried for: the target version's publish
timestamp, the package's current maintainer list, and whether that version carries an npm
provenance attestation or registry signature. Full detail in
[`dependency-advisory-report.csv`](dependency-advisory-report.csv); summary:

- **All 26** versions carry a standard npm registry signature (`dist.signatures` present).
- **Only `elkjs@0.12.0`** carries an npm **provenance attestation** (`dist.attestations`,
  build-provenance signed via Sigstore) — the other 25 do not, which is unremarkable: npm
  provenance is opt-in and most of the ecosystem (including long-established packages like
  `js-yaml`, `ajv`, the `bpmn-io` org's packages) has not adopted it. Noted as fact, not a
  defect.
- No package is marked `deprecated` at the shipped version.
- Publish dates range from 2015 (`sprintf-js@1.0.3`) to 2026-07-31 (`js-yaml@4.3.1`,
  `fast-uri@3.1.5`) — all predate the v3.2.0 publish run (2026-08-10T10:18Z), consistent with
  being installed, not published, at build time.
- Maintainer sets are what's expected for these packages: the `bpmn-io` org account plus its
  named maintainers for `bpmn-moddle`/`moddle`/`moddle-xml`/`min-dash`/`saxen`, `oozcitak` for
  their own `@oozcitak/*` family and `xmlbuilder2`, the `ajv`/`fast-*`/`json-schema-traverse`
  cluster under `esp` (Evgeny Poberezkin) and `blakeembrey`, `yisi`/`qbb.sh`/`broooooklyn` for
  `@resvg/resvg-js*`. No unexpected or single-purpose-looking account.

## Constraints observed

Read-only with respect to distribution: all checks are outbound reads against public registry
and advisory APIs (`registry.npmjs.org`, `api.osv.dev`). Nothing was published, re-published,
unpublished, deleted, or modified on any registry. No packaging or publishing workflow was
changed.
