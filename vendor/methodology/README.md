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
