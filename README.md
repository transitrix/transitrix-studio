# Transitrix Studio

**VS Code extension and CLI for editing and previewing Transitrix diagrams.**

Text-first BPMN authoring: write your process as structured YAML, compile to valid BPMN 2.0 XML with automatic layout, preview live in VS Code or the browser.

## What this is

Transitrix Studio brings **text-first diagram authoring** to VS Code. Instead of dragging shapes in a GUI editor, you write YAML — structured, diffable, reviewable in pull requests. The compiler produces BPMN 2.0 XML with computed layout coordinates using the ELK (Eclipse Layout Kernel) engine.

Formats supported today:

| Format | File suffix | Status |
|---|---|---|
| BPMN 2.0 | `.cervin.yaml`, `.bpmn.yaml` | Stable |
| Goals tree | `.goals.transitrix.yaml` | Stable |
| FGCA, capability map, and more | — | In development |

> **Note (v0.4.0):** Legacy identifiers (`.cervin.yaml` extension, `cervin` CLI binary, `.cervinrc` config) are kept in v0.4.0 and will be renamed in v0.5.

## Install

**From VS Code Marketplace:**

Search for **Transitrix Studio** in the Extensions panel, or install via CLI:

```bash
code --install-extension transitrix.transitrix-studio
```

**From GitHub Releases:**

Download the `.vsix` file from [GitHub Releases](https://github.com/transitrix/transitrix-studio/releases) and install:

```bash
code --install-extension transitrix-studio-0.4.0.vsix
```

## Quick start — BPMN

Create a file `example.bpmn.yaml`:

```yaml
process:
  id: OrderFulfillment
  name: Order Fulfillment
  pools:
    - id: main
      name: Order Fulfillment
      lanes:
        - id: sales
          name: Sales
          elements:
            - { id: start, type: startEvent }
            - { id: receiveOrder, type: userTask, name: Receive order }
            - { id: end, type: endEvent }
  flows:
    - { from: start, to: receiveOrder }
    - { from: receiveOrder, to: end }
```

Open it in VS Code — the preview panel opens automatically and refreshes on every save.

## CLI

```bash
cervin compile input.bpmn.yaml output.bpmn
cervin serve                         # local web UI at http://localhost:3000
```

## Repository layout

```
transitrix-studio/
  src/              — BPMN core pipeline (parser, layout, emitter, CLI)
  extension/        — VS Code extension
  packages/diagrams/ — shared renderers and validators (@transitrix/diagrams)
  ui/               — Vite browser UI (cervin serve)
  backends/blocks/  — Python nested-block backend
  tests/            — Vitest suite
  schemas/          — JSON Schema sources
  examples/bpmn/    — YAML demos and corpus
  docs/             — Project documentation
```

See [`docs/repo-layout.md`](docs/repo-layout.md) for a detailed directory map.

## Methodology

Notation semantics and design rationale: [github.com/transitrix/methodology](https://github.com/transitrix/methodology).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). By submitting a pull request, you agree that your contribution is licensed under the project's MIT License (LICENSE).

## Author

Created and maintained by **Valerii Korobeinikov**.

## License

MIT — see [LICENSE](LICENSE).
