# Transitrix Studio

**Architecture-as-code for the modern enterprise.** Describe your organisation — goals, processes, capabilities, applications, BPMN flows — in plain YAML, and Transitrix Studio renders live diagrams inside VS Code. Review architectural changes like pull requests. Diff them. Version them. Hand them to an AI that actually reads YAML.

![Process landscape preview — YAML on the left, rendered diagram on the right](https://raw.githubusercontent.com/transitrix/transitrix-studio/main/extension/docs/preview.png)

## Why text-native architecture?

Diagrams hidden in proprietary binary files don't survive contact with version control. They are hard to diff, hard to review, hard to merge. They drift from the truth they once described.

Transitrix flips that:

- **Your architecture lives in YAML files** — readable in any editor, diffable in git, reviewable in pull requests.
- **Diagrams are derived, not authored** — never out of sync with the source of truth.
- **AI works with it natively** — your assistant can read, edit, and reason about the entire enterprise model without leaving the repo.
- **Built on open standards** — ArchiMate 3.2, BPMN 2.0, CMM. Your investment survives any single tool.

## 17 notations, one extension

| Domain | Notation | Use it for |
|---|---|---|
| Strategy | **Goals tree** | Hierarchical goal decomposition |
| Strategy | **DGCA / DGA** | Drivers → goals → (changes →) activities chains |
| Capability | **Capability map** | Current vs target maturity per capability |
| Process | **Process map** | Operating / supporting / management process landscape |
| Process | **Process blueprint** | Stage-by-stage design with systems, actors, equipment, information |
| Process | **BPMN** | Full BPMN 2.0 — YAML-authored, BPMN-rendered |
| Schedule | **Activity network** | PSND / AoN diagrams + Gantt + critical path |
| Schedule | **Activity card** | Single-project narrative: scope, motivation chain, milestones |
| Risk | **Scenarios** | Scenario planning across factors |
| Catalogue | **Applications** | Applications, integrations, platforms, data stores |
| Catalogue | **Products** | Digital products, services, bundles |
| Decomposition | **Nested blocks** | Recursive block tree |
| Compliance | **Compliance impact** | Obligation × subject impact matrix |
| Compliance | **Compliance matrix** | Products × requirements coverage view |
| Compliance | **Coverage metric** | Law coverage stats with RAG status |
| Compliance | **Gap dashboard** | Open gaps: unasserted requirements, stale assertions |

Every preview ships with a toolbar: title toggle, discrete zoom (50–200%), save as SVG, save as PNG (2× for crisp output), and copy PNG to clipboard (Windows today; macOS / Linux planned).

The preview opens automatically when you open a recognised file and refreshes on every save.

## Pairs well with Mermaid

Transitrix and Mermaid are **complementary, not competing**. Use **Mermaid** for general-purpose diagrams — flowcharts, sequence diagrams, ER, Gantt. Use **Transitrix** for the structured enterprise notations Mermaid doesn't cover. Together: nearly 30 notations at your fingertips, both free and open source.

## Get started in 60 seconds

1. **Install this extension** — search for **Transitrix Studio** in the Extensions panel of VS Code, Cursor, VSCodium, or Windsurf.
2. **Clone the starter repo:** `git clone https://github.com/transitrix/methodology`
3. **Open any `.transitrix.yaml` file** under `notations/examples/` — preview opens automatically.

Recognised BPMN file suffixes are configurable in **Settings → Transitrix Studio**.

> **Editors:** the extension ships to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=transitrix.transitrix-studio) (VS Code) and to the [Open VSX Registry](https://open-vsx.org/extension/transitrix/transitrix-studio) (Cursor, VSCodium, Windsurf). The artefact is identical; pick whichever Extensions panel ships with your editor. **JetBrains IDEs** (IntelliJ IDEA and the rest) have a companion **Transitrix Studio** plugin — install it from **Settings → Plugins → Marketplace** and search for *Transitrix Studio*.

## Settings

Configure under **Settings → Transitrix Studio**. The canonical keys are `transitrix.*`.

| Setting | Default | Description |
|---------|---------|-------------|
| `transitrix.fileExtensions` | `[".bpmn.transitrix.yaml"]` | File suffixes recognised as Transitrix BPMN source files (leading dot required). |
| `transitrix.exportEnabled` | `false` | Show the experimental BPMN/SVG/PNG export commands. |
| `transitrix.nodeSize.goals` | `normal` | Block size preset for Goals preview (`compact` / `normal` / `wide`). Also in the in-preview **Controls** panel. |
| `transitrix.nodeSize.dgca` / `.dga` | `normal` | Block size preset for DGCA/DGA chain previews. |
| `transitrix.nodeSize.action` | `normal` | Block size preset for Activities network preview. |
| `transitrix.nodeSize.blocks` | `normal` | Leaf block size preset for Nested Blocks preview (settings; Controls panel deferred). |
| `transitrix.nodeSize.processBlueprint` | `normal` | Cell/column sizing preset for Process Blueprint (pairs with existing column-width slider). |
| `transitrix.nodeSize.capabilityMap` | `normal` | Node size preset for Capability Map tree preview. |

## Learn more

- 🌐 **Site** — [transitrix.com](https://transitrix.com)
- 📖 **Methodology canon** — [github.com/transitrix/methodology](https://github.com/transitrix/methodology)
- 🧰 **Source & issues** — [github.com/transitrix/transitrix-studio](https://github.com/transitrix/transitrix-studio)
- 📚 **Glossary** — see [`glossary.md`](https://github.com/transitrix/transitrix-studio/blob/main/glossary.md) in the repo root for domain terminology

Open source. MIT licensed. Built by [Valerii Korobeinikov](https://github.com/transitrix).
