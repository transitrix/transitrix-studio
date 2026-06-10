# Transitrix CLI

The Transitrix CLI compiles, validates, measures and serves Transitrix notation
files **without VS Code** — for scripts, CI pipelines, and automation (e.g. a
compliance-report renderer).

The canonical command is **`transitrix`**. The legacy **`cervin`** name is a
deprecated alias of the same binary and will be removed in 2.0.0.

## Getting the CLI outside VS Code

> The CLI is **not yet published to npm** (`npm install -g transitrix` /
> `@transitrix/cli` will 404). The VS Code extension bundles the rendering
> library for previews — it does **not** put a runnable CLI on your `PATH`.
> Until a published package lands, install from a clone:

```bash
git clone https://github.com/transitrix/transitrix-studio
cd transitrix-studio
npm install
npm run build          # emits dist/, including dist/cli.js (the bin entry)
npm link               # puts `transitrix` (and legacy `cervin`) on your PATH
```

After `npm link`, the command is available globally:

```bash
transitrix --help
where.exe transitrix   # Windows: confirms it is on PATH
which transitrix       # macOS/Linux
```

`npm link` works even though the package is marked `private` (private only blocks
`npm publish`, not local linking). To undo it later: `npm rm -g transitrix-studio`.

### Without a global install

If you do not want a global shim, run the built CLI directly from the clone:

```bash
node /path/to/transitrix-studio/dist/cli.js compile input.bpmn.transitrix.yaml out.bpmn
```

…or, for development (no build step, transpiled on the fly via `tsx`):

```bash
npm run transitrix -- compile input.bpmn.transitrix.yaml out.bpmn
```

### Invoking from a script / skill

A launcher that must work whether or not `transitrix` is on `PATH` should:

1. try `transitrix` (then legacy `cervin`) on `PATH`;
2. fall back to `node <repo>/dist/cli.js` when a local clone path is known.

The CLI prints a one-line deprecation notice to **stderr** when invoked under the
legacy `cervin` name, so prefer `transitrix` in new automation.

## Commands

```text
transitrix <input.yaml> <output.bpmn> [--no-metrics] [--no-validate]
transitrix serve [--port 8765] [--host 127.0.0.1]
transitrix metrics <input.yaml> [--json]
transitrix validate <input.yaml> [--json]
transitrix export-compliance [--format md|pdf] [--scope law:<ID>|product:<ID>|gap] [--output <path>] [--root <dir>]
```

| Command | Purpose |
|---------|---------|
| *(default)* / `compile` | YAML → BPMN 2.0 XML with computed layout; prints layout-quality metrics and validation findings. Exit 1 on validation errors. |
| `serve` | Local web UI (run `npm run ui:build` once beforehand). |
| `metrics` | Layout-quality metrics only (`--json` for CI). |
| `validate` | Validation only, no XML output (`--json` for CI). Exit 1 on errors. |
| `export-compliance` | Markdown or PDF report of the compliance views (matrix by default; `law:` / `product:` / `gap` scopes). Scans `--root` (default cwd). PDF needs WeasyPrint on PATH (`pipx install weasyprint`). |

Flags: `--no-metrics` suppresses the metrics report on compile; `--no-validate`
suppresses validation **warnings** (errors always run). Input files must use a
recognised suffix (`*.bpmn.transitrix.yaml`; legacy `*.cervin.yaml` accepted) or
pass `--ext=.suffix1,.suffix2`.

## Examples

```bash
transitrix compile order.bpmn.transitrix.yaml order.bpmn
transitrix validate order.bpmn.transitrix.yaml --json
transitrix metrics order.bpmn.transitrix.yaml --json
transitrix export-compliance --format md --scope gap --output gaps.md
transitrix serve --port 9000
```

## Project config

Rule overrides are read from a `.transitrixrc` file at the project root (legacy
`.cervinrc` is read as a fallback). See [`docs/validation.md`](validation.md).
