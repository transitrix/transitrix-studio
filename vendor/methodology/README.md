# Vendored methodology artefacts

Files here are **copies, not sources**. Nothing in this folder is authored in this
repository, and an edit made here is not a change to the methodology — it is a
divergence from it, which is exactly what the drift check exists to catch.

## `vocabulary.yaml`

The Transitrix closed-vocabulary artefact — the authored source for every closed
set (element TYPEs, relation kinds, closed field value vocabularies, rule codes and
their severities). Its own header states the contract for consumers outside the
methodology repository: vendor the tagged release and read this path. No cross-repo
package dependency, no sibling-checkout read, no runtime fetch.

`VENDORED.json` records where the copy came from and pins its content:

| Field | Meaning |
|---|---|
| `source_repo` / `source_ref` / `source_path` | the tagged release and path the copy was taken from |
| `methodology_version` | the artefact's own `methodology_version`, restated so a swapped file cannot pass |
| `sha256` | SHA-256 of `vocabulary.yaml` with line endings normalised to LF |
| `vendored_on` | the date the copy was taken |

`tests/vocabulary-drift.test.ts` reads both and fails closed: a missing file, an
unparseable one, a missing or mismatched pin, or a hash that does not match is a
build failure, never a pass. It then compares this repo's own vocabulary constants
against the artefact and reports every divergence.

## Refreshing

```
node scripts/vendor-methodology-vocabulary.mjs --ref v3.4.0
```

The script fetches the artefact from the named tag via the GitHub API, writes both
files, and prints the new hash. Refreshing usually surfaces new drift — that is the
point; resolve or re-date the affected `tests/vocabulary-drift/allowlist.ts` entries
in the same change.

## `document-renderer/`

Eight source files of `@transitrix/document-renderer`'s render pipeline:
`pass1.mjs` (the deterministic resolver) and the four modules it imports
(`parse-recipe.mjs`, `repository.mjs`, `ids.mjs`, `syntax.mjs`) — vendored
first for the `.ttrs` preview — plus `pass2.mjs` (fills instruction slots via
a caller-supplied agent hook), `render-pdf.mjs` (Markdown → PDF, dependency-
free) and `run-record.mjs` (the provenance stamp), vendored for
`transitrix render`'s persisted end-to-end render (transitrix-hq#186). The
package's own README states this is the intended integration path: "Pass 1
ships as a unit callable on its own, so pass 2 and Studio's preview can both
depend on it as a library rather than on the whole renderer." Studio's
`.ttrs` preview (`extension/src/ttrs-preview.ts`) imports `runPass1` from the
vendored copy, and `src/render-document.ts` imports all three render-pipeline
modules — real library calls against the methodology-authored renderer, not a
reimplementation of its logic.

`VENDORED.json` records the source tag and a per-file SHA-256 (LF-normalised).
`tests/document-renderer-vendor.test.ts` fails closed: a missing file, an
unpinned file, or a hash mismatch is a build failure, never a pass.

### Refreshing

```
node scripts/vendor-methodology-document-renderer.mjs --ref v4.0.0
```

Same fetch-from-tag contract as `vocabulary.yaml` above — never a sibling
checkout, never a branch.
