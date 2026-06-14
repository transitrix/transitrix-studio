# Transitrix Studio

**VS Code extension and CLI for editing and previewing Transitrix diagrams.**

Text-first BPMN authoring: write your process as structured YAML, compile to valid BPMN 2.0 XML with automatic layout, preview live in VS Code or the browser.

## What this is

Transitrix Studio brings **text-first diagram authoring** to VS Code. Instead of dragging shapes in a GUI editor, you write YAML — structured, diffable, reviewable in pull requests. The compiler produces BPMN 2.0 XML with computed layout coordinates using the ELK (Eclipse Layout Kernel) engine.

Studio previews the full Transitrix notation kit — **13 diagram notations** plus compliance views and canon artefacts (assertion / requirement). See [`extension/README.md`](extension/README.md) for the authoritative per-format list shipping in the VSIX, and the methodology repo for the notation specs themselves: [github.com/transitrix/methodology](https://github.com/transitrix/methodology).

> **Legacy identifiers.** The `.cervin.yaml` file extension and the `cervin` CLI binary name predate the `transitrix` rename and are kept accepted for backward compatibility; new files should use the canonical `*.<short-name>.transitrix.yaml` form per the methodology (e.g. `*.bpmn.transitrix.yaml` for BPMN).

## Install

**From the VS Code Marketplace (VS Code):**

Search for **Transitrix Studio** in the Extensions panel, or install via CLI:

```bash
code --install-extension transitrix.transitrix-studio
```

**From the Open VSX Registry (Cursor, VSCodium, Windsurf):**

Search for **Transitrix Studio** in the Extensions panel of your editor. The
same artefact is published to [Open VSX](https://open-vsx.org/extension/transitrix/transitrix-studio),
which Cursor and other VS Code derivatives read by default. No
per-editor build — the VSIX is identical to the Marketplace listing.

**From GitHub Releases:**

Download the `.vsix` file from [GitHub Releases](https://github.com/transitrix/transitrix-studio/releases) and install:

```bash
code --install-extension transitrix-studio-1.0.0.vsix
```

A companion IntelliJ IDEA plugin is available on the JetBrains Marketplace — install it from **Settings → Plugins → Marketplace** and search for *Transitrix Studio* (source under [`intellij/`](intellij/)).

## Quick start — BPMN

Create a file `example.bpmn.transitrix.yaml`:

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

The `transitrix` CLI compiles, validates and serves notation files **outside VS
Code** — for scripts and CI. It is **not yet on npm**, and the VS Code extension
does not put a CLI on your `PATH`; install from a clone:

```bash
git clone https://github.com/transitrix/transitrix-studio
cd transitrix-studio && npm install && npm run build
npm link                             # puts `transitrix` on your PATH
```

Then:

```bash
transitrix compile input.bpmn.transitrix.yaml output.bpmn
transitrix validate input.bpmn.transitrix.yaml --json
transitrix serve                     # local web UI at http://localhost:8765
```

`cervin` is a deprecated alias of `transitrix` (removed in 2.0.0). Full command
reference and scripting/auto-detection notes: **[`docs/cli.md`](docs/cli.md)**.

## Repository layout

```
transitrix-studio/
  src/              — BPMN core pipeline (parser, layout, emitter, CLI)
  extension/        — VS Code extension
  packages/diagrams/ — shared renderers and validators (@transitrix/diagrams)
  ui/               — Vite browser UI (transitrix serve)
  tests/            — Vitest suite + notation corpus (tests/fixtures/)
  schemas/          — JSON Schema sources
  organizations/    — worked example organization
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
