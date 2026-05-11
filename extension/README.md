# Transitrix Studio — VS Code extension

Live **preview** for Transitrix diagram formats inside VS Code:

- **BPMN** — `.cervin.yaml` and `.bpmn.yaml` sources (YAML DSL → BPMN 2.0)
- **Goals tree** — `.goals.transitrix.yaml` sources (hierarchical goal tree)
- **FGCA**, capability map, and further formats shipping incrementally

The preview panel opens automatically when you open a recognised file, and refreshes on every save.

Recognised BPMN file suffixes are configured in **Settings → Transitrix Studio**.

**Development:** from the repository root run `npm run extension:prep`, then use the **Extension: Transitrix Studio** launch configuration in `.vscode/launch.json`.

Domain terminology: **[glossary.md](../glossary.md)** in the repo root.
