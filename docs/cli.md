# Transitrix CLI

The Transitrix CLI compiles, validates, measures and serves Transitrix notation
files **without VS Code** — for scripts, CI pipelines, and automation (e.g. a
compliance-report renderer).

The canonical command is **`transitrix`**. The legacy **`cervin`** name was
removed in CLI/runtime **2.0.0**.

## Install from npm

The published package is **`@transitrix/cli`**:

```bash
npm install -g @transitrix/cli
transitrix --help
```

See [`packages/cli/README.md`](../packages/cli/README.md) for the full command
surface. Publishing is automated from GitHub Releases — see
[`docs/release-runbook.md`](release-runbook.md).

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
transitrix validate <input.yaml> [--json]
transitrix validate --scope=repo [--root <dir>] [--json]
transitrix export-compliance [--format md|pdf] [--scope law:<ID>|product:<ID>|gap] [--output <path>] [--root <dir>]
```

| Command | Purpose |
|---------|---------|
| *(default)* / `compile` | YAML → BPMN 2.0 XML with computed layout; prints layout-quality metrics and validation findings. Exit 1 on validation errors. |
| `serve` | Local web UI (run `npm run ui:build` once beforehand). |
| `metrics` | Layout-quality metrics only (`--json` for CI). |
| `validate` | Validation only, no XML output (`--json` for CI). Exit 1 on errors. Default scope is a single file; `--scope=repo` runs whole-`canon/` checks (referential integrity, atomicity, id uniqueness, policy) over `--root` (default cwd) — see [validation.md](validation.md#validation-scope-file-vs-repo). |
| `export-compliance` | Markdown or PDF report of the compliance views (matrix by default; `law:` / `product:` / `gap` scopes). Scans `--root` (default cwd). PDF needs WeasyPrint on PATH (`pipx install weasyprint`). |

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
transitrix serve --port 9000
```

## Project config

Rule overrides are read from a **`.transitrixrc`** file at the project root.
See [`docs/validation.md`](validation.md).

## VS Code extension

Extension **3.0+** recognises BPMN sources only under configured
`transitrix.fileExtensions` (default `.bpmn.transitrix.yaml`). Legacy
`*.cervin.yaml` and `cervin.*` settings/commands are removed — see
[`extension/CHANGELOG.md`](../extension/CHANGELOG.md) and [`RELEASING.md`](../RELEASING.md).
