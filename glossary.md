# Glossary

Domain terms used across the Transitrix Studio codebase and documentation. Roadmap: RD-027, RD-040.

| Term | Definition |
| ------------ | ---------- |
| Automatic layout | Position computation done by the ELK (Eclipse Layout Kernel) engine — no manual coordinate editing required. |
| BPMN | Business Process Model and Notation — the OMG standard (formal/2013-12-09) for process modelling. |
| BPMN DI | BPMN Diagram Interchange — the `bpmndi:` XML blocks that store element geometry (bounds, waypoints). |
| BPMN YAML DSL | Text-based DSL for authoring BPMN processes as YAML files (`.bpmn.yaml`). |
| Compilation (compile) | The pipeline step that transforms YAML source → BPMN 2.0 XML with computed layout. |
| CLI (command-line interface) | The `cervin` binary (`dist/cli.js`) that runs compile and serve commands. |
| ELK | Eclipse Layout Kernel — the graph layout engine used for X/Y position computation. |
| Intermediate representation (IR) | The `ProcessIr` data structure produced by the parser and consumed by layout and emit. |
| Lane (swimlane) | A horizontal band inside a pool representing an actor or system boundary. |
| Live preview | Auto-refreshing diagram view in VS Code or the browser that updates on every save. |
| Participant | A pool in BPMN terms — a named entity that owns a set of lanes. |
| Pool | A top-level container in BPMN; maps to one DSL document in Transitrix Studio. |
| Sequence flow | A directed connection between two elements in a process diagram. |
| SPA (single-page application) | The browser UI served by the `serve` command from `ui/dist/`. |
| Webview | The HTML/JS preview panel embedded inside VS Code by the extension. |
