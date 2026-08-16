# Transitrix CLI

The Transitrix CLI compiles, validates, measures and serves Transitrix notation
files **without VS Code** — for scripts, CI pipelines, and automation (e.g. a
compliance-report renderer).

The canonical command is **`transitrix`**.

## Install from npm

The published package is **`@transitrix/cli`**:

```bash
npm install -g @transitrix/cli
transitrix --help
```

See [`packages/cli/README.md`](../packages/cli/README.md) for the full command
surface. Publishing is automated from GitHub Releases — see
[`docs/internal/release-runbook.md`](internal/release-runbook.md).

The VS Code extension bundles renderers for in-editor previews; it does **not**
put the CLI on your `PATH`. Use `@transitrix/cli` (or a clone build below) for
terminal and CI workflows.

## Install from a clone (development)

```bash
git clone https://github.com/transitrix/transitrix-studio
cd transitrix-studio
npm install
npm run build          # emits dist/, including dist/cli.js
npm link               # puts `transitrix` on your PATH (root workspace)
```

After `npm link`:

```bash
transitrix --help
where.exe transitrix   # Windows
which transitrix       # macOS/Linux
```

`npm link` works even though the root package is `private` (private only blocks
`npm publish`, not local linking). To undo: `npm rm -g transitrix-studio`.

### Without a global install

Run the built CLI directly from the clone:

```bash
node /path/to/transitrix-studio/dist/cli.js compile input.bpmn.transitrix.yaml out.bpmn
```

…or, for development (transpiled on the fly via `tsx`):

```bash
npm run transitrix -- compile input.bpmn.transitrix.yaml out.bpmn
```

### Invoking from a script / skill

A launcher that must work whether or not `transitrix` is on `PATH` should:

1. try `transitrix` on `PATH`;
2. fall back to `node <repo>/dist/cli.js` when a local clone path is known.

## Commands

```text
transitrix <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
transitrix serve [--port 8765] [--host 127.0.0.1]
transitrix metrics <input.yaml> [--json]
transitrix validate <input.yaml> [--json] [--template <name>]
transitrix validate <input.yaml> --fix [--author <name>] [--valid-from <YYYY-MM-DD>] [--root <dir>] [--dry-run]
transitrix validate --scope=repo [--root <dir>] [--json] [--include-model]
transitrix new <goal|driver|constraint|requirement> --id <ID> --name "<label>" [options]
transitrix export-compliance [--format md|pdf] [--scope law:<ID>|product:<ID>|gap] [--output <path>] [--root <dir>]
transitrix impact [--root <dir>] [--json]
transitrix render <input.ttrs> [--out <dir>] [--root <dir>] [--json]
```

| Command | Purpose |
|---------|---------|
| *(default)* / `compile` | YAML → BPMN 2.0 XML with computed layout; prints layout-quality metrics and validation findings. Exit 1 on validation errors. |
| `serve` | Local web UI (run `npm run ui:build` once beforehand). |
| `metrics` | Layout-quality metrics only (`--json` for CI). |
| `validate` | Validation only, no XML output (`--json` for CI). Exit 1 on errors. Default scope is a single file; `--scope=repo` runs whole-`canon/` checks (referential integrity, atomicity, id uniqueness, policy) over `--root` (default cwd) — see [validation.md](validation.md#validation-scope-file-vs-repo). `--include-model` (with `--json`) also emits the resolved `canon/elements/**`/`canon/relations/**` records it parsed — see [validation.md](validation.md#resolved-model-output---include-model). `--template <name>` (file scope, `blocks` matrix-subset `grid:` documents only — e.g. `raci`) additionally enforces that template's own cell-value invariant (e.g. `RACI-001`) on top of the base `BL-02x` rules; the base notation does not fix a cell-value vocabulary, so this is opt-in per template. |
| `new <type>` | Scaffolds a standalone motivation-layer element (`goal`, `driver`, `constraint`, `requirement`) with the admission record and lifecycle envelope computed rather than hand-typed — see [Envelope defaults](#envelope-defaults). `--dry-run` previews without writing. Run `transitrix new <type> --help` for the per-type fields. |
| `export-compliance` | Markdown or PDF report of the compliance views (matrix by default; `law:` / `product:` / `gap` scopes). Scans `--root` (default cwd). PDF needs WeasyPrint on PATH (`pipx install weasyprint`). |
| `impact` | Names which `canon/views/**` documents a *staged* (`git add`, not yet committed) `canon/elements/**` change makes stale. Silent when nothing is staged, or when nothing this can resolve is affected. Resolves the three canon-projection view notations with a static resolver (`goals`, `dgca`/`fgca`, `action`); every other view (inline-form views, `blocks`, `applications`, `capability-map`, `compliance-impact`, `coverage-metric`, `bpmn`) is reported as coverage not determined, never as unaffected. Document (`.ttrs`) coverage is not yet included. `--root` sets the repo to check (default cwd). |
| `render` | Renders a `.ttrs` document end to end — Pass 1 + Pass 2 + Markdown + PDF + a run-record — and writes `<basename>.md`, `<basename>.pdf` and `<basename>.run-record.json` next to the source (or into `--out`). No instruction-slot filler is supplied, so every slot renders open, same as the source's own unfilled state — this is a building block for a future regeneration offer, not a document-authoring tool of its own. `--root` sets the repo whose `git rev-parse HEAD` is recorded in the run-record (default: the source file's directory). Exits 1 on any unresolved model-object reference (`strict` profile, `runPass1`'s own default). |

Flags: `--no-metrics` suppresses the metrics report on compile; `--no-validate`
suppresses validation **warnings** (errors always run). Input files must use a
recognised suffix (default **`*.bpmn.transitrix.yaml`**) or pass
`--ext=.suffix1,.suffix2`.

## Examples

```bash
transitrix compile order.bpmn.transitrix.yaml order.bpmn
transitrix validate order.bpmn.transitrix.yaml --json
transitrix validate --scope=repo --root organizations/acme_corp
transitrix metrics order.bpmn.transitrix.yaml --json
transitrix export-compliance --format md --scope gap --output gaps.md
transitrix render canon/views/documents/product.mrd.ttrs
transitrix serve --port 9000
```

## Envelope defaults

Authoring an element requires only the fields that carry its own meaning:
`notation`, `id`, `name`, and the per-TYPE fields. The rest of the canonical
envelope — the admission record (`CONTRACT.md` §6) and the primitive lifecycle
(`CONTRACT.md` §7) — is produced by whichever path creates the file.

Two commands supply it:

- **`transitrix new <type>`** — writes a brand-new element file with the
  envelope already complete.
- **`transitrix validate <file> --fix`** — completes the envelope on a file
  that was hand-authored without one, inserting only what it can derive and
  leaving every value already present untouched.

The VS Code extension's **New … Element** commands take the third path and use
the same defaults; see [`extension/README.md`](../extension/README.md).

### The defaults, and how to override them

| Field | Default | Override |
|---|---|---|
| `zone` | `canon` | — (the creation paths write into `canon/`) |
| `admitted_at` | today | **none, by design** — see below |
| `admitted_by` | `git config user.name` | `--author "<name>"` |
| `gate_checks` | the result of the checks that actually ran | — (never a constant `pass`) |
| `valid_from` | today | `--valid-from <YYYY-MM-DD>` |
| `valid_to` | `null` (open-ended) | — (close a primitive by editing the file) |

```bash
# an element whose subject has been true since before it was written down
transitrix new goal --id GOAL-042 --name "Reduce audit lead time" --valid-from 2026-01-01

# same override when completing a hand-authored file
transitrix validate canon/elements/01_motivation/goals/GOAL-042.yaml --fix --valid-from 2026-01-01
```

Dates are quoted `YYYY-MM-DD` (`CONTRACT.md` §4). A `--valid-from` that is not
a calendar date in that form is rejected — the command fails rather than
falling back to today, so a mistyped date can never be recorded silently.

**Why `admitted_at` has no override.** `admitted_at` records when admission
actually happened, so a caller-supplied value would falsify the admission
record — the same reason `gate_checks` is never written as a constant `pass`.
`valid_from` is different in kind: it is a statement about the subject, not
about the tooling, and an author may legitimately know it to be earlier or
later than the day they run the command.

**What `--fix` will not do.** It fills only what it can derive. A field it
cannot determine — most commonly `admitted_by`, when neither `--author` nor
`git config user.name` supplies an identity — is reported as unresolved and
the file still fails validation. `--fix` completes; it does not invent.

## Project config

Rule overrides are read from a **`.transitrixrc`** file at the project root.
See [`docs/validation.md`](validation.md).

## VS Code extension

Extension **3.0+** recognises BPMN sources only under configured
`transitrix.fileExtensions` (default `.bpmn.transitrix.yaml`). See
[`extension/CHANGELOG.md`](../extension/CHANGELOG.md) for the 3.0 change log.
