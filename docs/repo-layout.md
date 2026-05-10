# Repository layout (Transitrix Studio)

This document maps **top-level folders** to **roles** so you know where to look and what to change.

---

## Mental model

```
                    ┌─────────────────────────────────────┐
                    │  Specs, methodology, JSON schemas   │
                    │  method/  notation-kit/  schemas/   │
                    └─────────────────────────────────────┘
                                         │
                    ┌────────────────────┴────────────────────┐
                    │         Node / TypeScript core          │
                    │  Parser → Layout → Emitter, CLI, HTTP   │
                    │              src/                       │
                    └────────────────────┬────────────────────┘
          ┌──────────────────────────────┼──────────────────────────────┐
          │                              │                              │
   ┌──────▼──────┐                ┌───────▼───────┐              ┌─────────▼─────────┐
   │  extension/ │                │     ui/       │              │ backends/blocks │
   │  VS Code    │                │  Vite web UI │              │ Python + Svgbob  │
   └─────────────┘                └───────────────┘              └──────────────────┘
```

All BPMN authoring shares the **`src/`** pipeline (`compile` API). **`backends/blocks/`** is invoked as a **separate process** from Node (nested-blocks previews).

---

## Top-level directories

| Path | Role |
|------|------|
| [`src/`](../src/) | **Core**: YAML DSL → BPMN XML; layout; validation hooks; **`cervin` CLI**; **`cervin serve`** HTTP handler. Compiled to `dist/`. |
| [`extension/`](../extension/) | **VS Code extension**: commands, preview webview; bundles compiler output copied by `npm run extension:prep`. |
| [`ui/`](../ui/) | **Browser UI** for local server: editor + BPMN viewer + nested-blocks tab; proxies to `/api/*` in dev (`vite.config.ts`). |
| [`webview/`](../webview/) | Shared / legacy webview scripting for the extension (**check `extension/`** for what is actually wired). |
| [`backends/blocks/`](../backends/blocks/) | **Polyglot backend**: nested block diagrams → SVG via Svgbob; **`blocks_stdio.py`** for Studio IPC. |
| [`examples/`](../examples/) | **Samples by tool**: [`bpmn/`](../examples/bpmn/) (YAML demos + corpus), [`nested-blocks/`](../examples/nested-blocks/) (Ascii/Markdown for Svgbob). See [`examples/README.md`](../examples/README.md). |
| [`tests/`](../tests/) | **Vitest** suite; integration and API tests assume repo layout (paths joined to `examples/…`). |
| [`scripts/`](../scripts/) | Build, baseline metrics, optional debug tooling (`scripts/debug/`). |
| [`method/`](../method/) | Transitrix **methodology** (audit, validation levels, routing rules catalog) — normative prose, not runtime code. |
| [`notation-kit/`](../notation-kit/) | **Notation artefacts** tied to the DSL (rules, glossary pointers, YAML examples alongside schema **where maintained**); distinct from runnable `schemas/` duplicates where noted in RDs. |
| [`schemas/`](../schemas/) | **JSON Schema** copies / sources for AJV (e.g. `bpmn-dsl.schema.json`). |
| [`docs/`](../docs/) | **Project docs**: validation catalogue notes, metrics baselines policies, **this layout map**. |

Configuration at repo root (`package.json`, `tsconfig*.json`, `.vscode/`): orchestrate build, lint, extension packaging.

---

## “Where do I change …?”

| Task | Likely location |
|------|----------------|
| BPMN DSL parsing / schema errors | [`src/parser.ts`](../src/parser.ts), [`schemas/`](../schemas/) |
| Layout / routing quality | [`src/layout.ts`](../src/layout.ts), [`src/layout-options.ts`](../src/layout-options.ts); rules in [`method/methodology.md`](../method/methodology.md) §6–7 |
| BPMN XML output | [`src/emitter.ts`](../src/emitter.ts) |
| CLI behaviour | [`src/cli.ts`](../src/cli.ts), [`src/cli-parse.ts`](../src/cli-parse.ts) |
| Web server / compile APIs | [`src/serve-ui.ts`](../src/serve-ui.ts); UI dev parity in [`ui/vite.config.ts`](../ui/vite.config.ts) |
| VS Code UX | [`extension/src/`](../extension/src/) |
| Web UI panels (BPMN + nested-blocks) | [`ui/src/main.ts`](../ui/src/main.ts), [`ui/src/style.css`](../ui/src/style.css) |
| Svgbob / nested-blocks generator | [`backends/blocks/`](../backends/blocks/), samples in [`examples/nested-blocks/`](../examples/nested-blocks/) |
| New **text format** in Studio | Add **`examples/<tool>/`**, optionally **`src/<feature>`** or **`backends/<name>/`**; register preview/CLI parity; extend this doc. |

---

## Optional future tightening (not done by default)

Grouping **`src/`**, **`ui/`**, and **`extension/`** under a single parent (e.g. `studio/`) can reduce root clutter but **touches many paths** (VSIX scripts, Vitest imports, Launch configs). Prefer a dedicated PR if you pursue it; until then **this document is the authoritative map**.
---

**Last updated:** 2026-05-06
