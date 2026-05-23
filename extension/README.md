# Transitrix Studio — VS Code extension

Live **preview** for Transitrix diagram formats inside VS Code:

- **BPMN** — `.bpmn.transitrix.yaml` (YAML DSL → BPMN 2.0); legacy `.cervin.yaml` also supported
- **Goals tree** — `.goals.transitrix.yaml` (hierarchical goal decomposition)
- **FGCA** — `.fgca.transitrix.yaml` (factors, goals, changes, activities map)
- **FGA** — `.fga.transitrix.yaml` (factors, goals, activities — change-free view)
- **Activity Network** — `.activities.transitrix.yaml` (PSND + Gantt views with critical path)
- **Process Map** — `.process-map.transitrix.yaml` (process landscape: operating / supporting / management groups)
- **Process Blueprint** — `.process-blueprint.transitrix.yaml` (stage-by-stage process design with aspects: systems, actors, equipment, information)
- **Capability Map** — `.capability-map.transitrix.yaml` (vertical / horizontal capabilities with current vs target maturity)
- **Scenarios** — `.scenarios.transitrix.yaml` (scenario planning: factors, references across the model)
- **Applications catalogue** — `.applications.transitrix.yaml` (applications, integrations, platforms, data stores)
- **Products catalogue** — `.products.transitrix.yaml` (digital products, services, platforms, bundles)
- **Nested blocks** — `.blocks.transitrix.txt` (ASCII block diagrams via Svgbob; requires Python 3 + `svgbob_cli`)

Every vector preview toolbar provides:
- **Title** — toggle the diagram caption on/off
- **Zoom** — discrete 50 / 75 / 100 / 150 / 200 % steps
- **Save .svg** — export the rendered diagram to a self-contained `.svg` file

The preview panel opens automatically when you open a recognised file, and refreshes on every save.

Recognised BPMN file suffixes are configured in **Settings → Transitrix Studio**.

**Development:** from the repository root run `npm run extension:prep`, then use the **Extension: Transitrix Studio** launch configuration in `.vscode/launch.json`.

Domain terminology: **[glossary.md](../glossary.md)** in the repo root.
