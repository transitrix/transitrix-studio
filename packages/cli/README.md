# @transitrix/cli

The Transitrix CLI — compile, validate, and report on Transitrix diagrams
(BPMN, Goals, FGCA, Capability Map, Process Blueprint, and the rest of the
Transitrix notation family) from any shell or CI pipeline.

This is the install-from-npm distribution of the same CLI shipped inside the
**Transitrix Studio** VS Code extension. Use it when you want the resolver
outside an editor — scripts, CI checks, downstream tools.

## Install

```bash
npm install -g @transitrix/cli
transitrix --help
```

Or run without installing:

```bash
npx @transitrix/cli --help
```

## Quick reference

```bash
transitrix --version                            # cli + bundled diagrams version
transitrix compile <input>.yaml <output>.bpmn   # YAML → BPMN 2.0 XML
transitrix validate <input>.yaml                # per-file validation
transitrix validate --scope=repo                # whole-repo canon checks
transitrix validate --scope=repo --json --include-model  # + resolved elements/relations
transitrix metrics <input>.yaml [--json]        # layout-quality metrics
transitrix export-compliance [--format md|pdf]  # compliance report
transitrix serve [--port 8765]                  # local web UI
```

PDF compliance export requires WeasyPrint on `PATH`
(`pipx install weasyprint`).

## What's included

- `dist/cli.js` — bundled CLI entry point. Runtime npm dependencies
  (`ajv`, `ajv-formats`, `bpmn-moddle`, `elkjs`, `js-yaml`, `xmlbuilder2`) are
  declared in `dependencies` and resolved by npm at install time.
- `dist/repo-validate.js` and `dist/export-compliance.js` — lazy-loaded
  handlers for the `validate --scope=repo` and `export-compliance`
  subcommands. The Transitrix diagrams library is bundled into these.
- `schemas/bpmn-dsl.schema.json` — the YAML DSL JSON Schema used by the
  validator and parser. Located next to `dist/` so the runtime path
  `dist/../schemas/bpmn-dsl.schema.json` resolves.

## Versioning

### 2.10.0-rc.0 candidate

This unpublished candidate bundles diagrams 1.14.0-rc.0. Repository validation
accounts for every file in declared zones, including hidden files. Only an
exactly zero-byte regular `.gitkeep` is excluded as a placeholder, with an
explicit coverage entry. Nonempty placeholders and unadmitted Markdown are
reported; malformed YAML remains an error. Archive and independent-catalogue
boundaries continue to apply.

The candidate also includes the shared requirement-chain projection used by
compliance reports. It requires review before publication. To evaluate a supplied
candidate tarball in a temporary project:

```bash
npm install --ignore-scripts /path/to/transitrix-cli-2.10.0-rc.0.tgz
npx --no-install transitrix --version
npx --no-install transitrix validate --scope=repo --root /path/to/model --json --include-model --strict
```

Existing published versions do not change when this candidate is built.

`@transitrix/cli` ships on its own version line, independent of the
Transitrix Studio extension and `@transitrix/diagrams`. The first published
release is `1.0.0`.

`@transitrix/diagrams` source (not a runtime dependency — see "What's
included" above) is bundled in at prepack, so a diagrams fix only reaches
adopters once `@transitrix/cli` itself is republished. A release-time guard
(`scripts/check-release-versions.mjs`) fails the release when
`@transitrix/diagrams` moved since the previous release and
`@transitrix/cli` did not, so the two never drift apart. Run
`transitrix --version` to see exactly which `@transitrix/diagrams` version
is bundled into an installed CLI.

## Naming

The package is born in the 2.0 era of the methodology. The legacy `cervin`
bin alias is not shipped — only `transitrix` is on `PATH`.

## License

MIT — see [`LICENSE`](./LICENSE).

## Links

- Monorepo: <https://github.com/transitrix/transitrix-studio>
- Issues: <https://github.com/transitrix/transitrix-studio/issues>
- Methodology spec: <https://github.com/transitrix/methodology>

## Requirements reports

The 2.12.0 source candidate adds `requirements-report`; 2.11.0 does not provide
this command. Publication is separate from building a candidate. Install the
supplied 2.12.0 tarball with `npm install --ignore-scripts /path/to/transitrix-cli-2.12.0.tgz`
in an empty consumer project, then use its executable on Node 20 or newer:

```sh
npx --no-install transitrix requirements-report \
  --root ./model --subject-type APPLICATION --subject-id APPLICATION-PLANNING-1 \
  --release RELEASE-PLANNING-2 --as-at 2026-09-24 --json
```

Use `--subject-type PRODUCT --subject-id PRODUCT-PLANNING-1` for a product.
Optional `--project ACTION-PLANNING-1` intersects the selected release with an
explicit project membership; optional `--expect-source-revision <full-commit>`
asserts the observed model Git revision. It never replaces observed provenance
or proves that disk content is clean. Every required option must be supplied;
unknown/duplicate flags, mismatched typed IDs and invalid calendar dates fail.
`requirements-report --help` describes this interface. Pin the exact installed
package version and retain its npm integrity together with the result.

The supported JSON envelope is `requirements-report/1`, containing:

| Field | Contract |
| --- | --- |
| `schemaVersion` | Literal `requirements-report/1`; callers must reject unsupported versions. |
| `status` | `complete`, `incomplete`, or `error`. |
| `tool` | Package name, installed version, built source Git revision (null for an unbundled call). |
| `request` | Absolute root, explicit `{type,id}` subject, release, optional project, `asAt`. Null if argument parsing failed. |
| `source` | Catalogue `.`, SHA-256 content snapshot, observed Git revision or null, mode `disk`, Git dirty state or null. Null on fatal failure. |
| `projection` | Complete shared `requirement-chain/0.3` result, or null on fatal failure. |
| `counts` | Shared count map: `{label,unit,set:{ids,completeness,total}}`, or null on fatal failure. |
| `errors` | Array of `{code,message}`; empty when a projection is available. Semantic and input findings remain in `projection`. |

Stdout contains exactly one JSON object followed by a newline. Fatal operational
diagnostics also appear on stderr. Exit **0** means computation is complete,
including when requirements have failed verification. Exit **2** means a report
is available with incomplete data. Exit **1** means no report is available:
`USAGE`, `SOURCE_REVISION`, `SOURCE_CHANGED`, `LOAD`, or `INTERNAL` in `errors`. No earlier
report is returned after failure. Help is plain text and exits 0.

The projection binds to contract/oracle revision
`a131b1862d86f34be8feb729e1cc6ebc994c3891`. It retains exact contributing IDs,
assignment provenance, raw records and source paths, stored/visual graph edges,
scope findings, reference-slot inventories and attributable/unattributable
findings. `populations.product` is the retained compatibility key for the **subject
population P**, also for an APPLICATION; `release` is L and `selected` is S.
Each population and metric has sorted distinct IDs, completeness and a nullable
total. Unknown is null, including when the known list is empty; a proven empty
population has total 0. Counts are never an overall quality score.

Membership must be explicit: `product_scope` or `application_scope`;
project pairs use `project_product` or `project_application` respectively.
Wrong-owner releases make all six metric totals unavailable. A missing project
pair makes the filtered population unavailable. Supporting-app/product links
confer no membership. Internal use does not determine subject type; physical
products use PRODUCT with `type: physical_product`. Missing membership,
malformed assignments and other-release-only assignments remain separate.
Predecessors inherit obligations within the same owner, never verification.
Only directly attached evidence qualified for the selected release can execute a
verification; child verification never verifies its parent.

The first five metrics operate on S: broken references, no accepted source path,
no valid verification definition, no applicable executed result, and applicable
failed verification. The sixth is clean unassigned requirements across the whole
subject, independent of the project filter. Known contributors survive partial
reads and unresolved references; inspect diagnostics as well as totals.

Scanning requires a readable YAML mapping at `transitrix.yaml` and recursively
reads YAML in `canon`, `codex` and `field`. Missing top-level zones are allowed.
Nested manifests delimit independent catalogues. Symlinks, failed enumeration,
unreadable files and malformed YAML remain explicit error findings, including
in the snapshot hash. Content and relative POSIX paths determine the hash;
there is no record-count truncation. Non-Git catalogues are supported with null
Git provenance. Two consecutive scans and Git readbacks detect observed edits,
renames, creates or deletes; a mismatch fails with `SOURCE_CHANGED`. This detects
changes between observations, not an atomic filesystem snapshot or a guarantee
against an edit-and-restore between reads.

Results are deterministic for unchanged bytes, scope, date and tool build.
Only `request.root` changes when relocating an otherwise identical non-Git
catalogue. No current timestamps or elapsed times enter the result. Source paths
are relative to the selected catalogue. Saved-disk results may differ from an
editor's dirty-buffer snapshot. UI availability and parity have their own
support boundary; this command does not assert a UI upgrade.

Library callers can use `buildSubjectRequirementChain` and
`requirementReleaseCounts` from `@transitrix/diagrams/compliance` in the 1.16.0
source candidate. The explicit `buildRequirementChain` adapter retains the
0.2 PRODUCT contract and its revision. Subject and legacy product selectors
cannot be combined. The CLI performs scanning and reporting for callers that
do not supply an already parsed catalogue.
