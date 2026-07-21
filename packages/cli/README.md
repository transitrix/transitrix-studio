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

`@transitrix/cli` ships on its own version line, independent of the
Transitrix Studio extension and `@transitrix/diagrams`. The first published
release is `1.0.0`.

## Naming

The package is born in the 2.0 era of the methodology. The legacy `cervin`
bin alias is not shipped — only `transitrix` is on `PATH`.

## License

MIT — see [`LICENSE`](./LICENSE).

## Links

- Monorepo: <https://github.com/transitrix/transitrix-studio>
- Issues: <https://github.com/transitrix/transitrix-studio/issues>
- Methodology spec: <https://github.com/transitrix/methodology>
