# Transitrix Studio — Obsidian plugin (first slice)

Read-only preview of **self-contained** Transitrix diagram YAML inside Obsidian Desktop Markdown notes. The plugin reuses the Studio parser, validator and SVG renderer from `@transitrix/diagrams`. It is not published to the Obsidian community catalog.

## Scope

| In this slice | Not in this slice |
| --- | --- |
| Reading view SVG fences listed below | Live Preview |
| Inline self-contained YAML only | Vault / canon projections (`view_config`-only, `sources`) |
| Shared Studio SVG render path | HTML catalogues, BPMN, compliance, MCP |
| Shared SVG display settings (node size, edge style, curvature, theme) | Spacing / scope UI |
| Extensible SVG notation registry (`src/notations/`) | Mobile (untested) |
| Desktop (`isDesktopOnly`); local folder install from a build | Community plugin release |

### Supported code block languages

| Language | Notation |
| --- | --- |
| `transitrix-goals` | Goals tree |
| `transitrix-dgca` | DGCA chain |
| `transitrix-dga` | DGA chain |
| `transitrix-action` | Action network (PSND) |
| `transitrix-action-card` | Action Card (shell + milestones; no vault/canon fill) |
| `transitrix-blocks` | Nested blocks or grid (e.g. RACI) |
| `transitrix-process-blueprint` | Process Blueprint |

`minAppVersion` is **1.0.0** because this slice only calls `Plugin.registerMarkdownCodeBlockProcessor`, `MarkdownRenderChild` / `MarkdownPostProcessorContext.addChild`, and `PluginSettingTab` / `Setting`, which are documented 1.0 APIs.

## Display settings

Under **Settings → Transitrix Studio**:

| Section | Setting | Values | Used by |
| --- | --- | --- | --- |
| General | Theme | Transitrix light / dark / Follow Obsidian | All SVG fences (Goals, DGCA/DGA, Action, Action Card, Nested Blocks, Process Blueprint) |
| SVG display | Node size | compact / normal / wide | Goals, DGCA/DGA, Action, Nested Blocks, Process Blueprint |
| SVG display | Edge style | straight / bezier / polyline | Goals, DGCA, DGA (Action keeps its own path style) |
| SVG display | Edge curvature | 0–3 (default 1) | Goals, DGCA/DGA, Action |

**SVG display** covers: Goals, DGCA, DGA, Action (network), Nested Blocks / grid, Process Blueprint. Action Card uses Theme only. Changes re-render open Reading-view blocks that opt in.

## Commands (from the repository root)

Node.js 20 or newer. After a clone:

```sh
npm ci
npm run build:obsidian-plugin
npm run typecheck:obsidian-plugin
npm run test:obsidian-plugin
npm run package:obsidian-plugin
```

`build:obsidian-plugin` compiles `@transitrix/diagrams` then bundles `packages/obsidian-plugin/dist/main.js`.
`package:obsidian-plugin` copies `manifest.json`, `styles.css` and `main.js` to `output/obsidian-plugin/` (gitignored).

## Install into a dedicated test vault

1. Build and package as above.
2. In the test vault create `.obsidian/plugins/transitrix-studio/`.
3. Copy `output/obsidian-plugin/manifest.json`, `main.js` and `styles.css` into that folder.
4. Enable **Transitrix Studio** under Settings → Community plugins (restricted mode off).
5. Copy demos from `packages/obsidian-plugin/demo/` into the vault and open them in Reading view.

## Markdown

See `demo/goals-preview.md`, `demo/fgca-preview.md`, and `demo/svg-notations-preview.md` for worked fences.

Repository projection docs are rejected (`view_config`-only / `sources` where applicable). Action Card without a vault still paints the card shell and milestones; motivation chain and child activities stay empty until a future vault-aware slice.

Source notes are never rewritten. Rendered SVG is shown as an image (`data:image/svg+xml`), not injected as HTML.
