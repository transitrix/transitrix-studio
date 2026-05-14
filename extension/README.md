# Transitrix Studio — VS Code extension

Live **preview** for Transitrix diagram formats inside VS Code:

- **BPMN** — `.bpmn.transitrix.yaml` (YAML DSL → BPMN 2.0); legacy `.cervin.yaml` also supported
- **Goals tree** — `.goals.transitrix.yaml` (hierarchical goal decomposition)
- **FGCA** — `.fgca.transitrix.yaml` (factors, goals, changes, activities map)
- **FGA** — `.fga.transitrix.yaml` (factors, goals, activities — change-free view)
- **Activities / AoN** — `.activities.transitrix.yaml` (activity network with critical path)
- **Nested blocks** — `.blocks.transitrix.txt` (ASCII block diagrams via Svgbob; requires Python 3 + `svgbob_cli`)
- **Products catalogue** — `.products.transitrix.yaml` (digital products, services, platforms, and bundles)

The preview panel opens automatically when you open a recognised file, and refreshes on every save.

Recognised BPMN file suffixes are configured in **Settings → Transitrix Studio**.

**Development:** from the repository root run `npm run extension:prep`, then use the **Extension: Transitrix Studio** launch configuration in `.vscode/launch.json`.

Domain terminology: **[glossary.md](../glossary.md)** in the repo root.
