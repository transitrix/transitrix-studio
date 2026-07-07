# Transitrix Studio — notation test corpus

One subfolder per diagram format. Open any `*.transitrix.yaml` file in VS Code with the Transitrix Studio extension installed to see a live preview. These fixtures drive regression tests and serve as worked examples.

| Folder | File extension | Format | Description |
|---|---|---|---|
| [`bpmn/`](bpmn/) | `*.bpmn.transitrix.yaml` | BPMN | Business process diagrams with lanes, gateways, and flows |
| [`goals/`](goals/) | `*.goals.transitrix.yaml` | Goals tree | Hierarchical goal decomposition |
| [`dgca/`](dgca/) | `*.dgca.transitrix.yaml` | DGCA | Driver → Goal → Change → Action chain |
| [`dga/`](dga/) | `*.dga.transitrix.yaml` | DGA | Driver → Goal → Action (DGCA without Changes layer) |
| [`action/`](action/) | `*.action.transitrix.yaml` | Action network | AoN / PSND precedence diagram with critical path |
| [`action-card/`](action-card/) | `*.action-card.transitrix.yaml` | Action card | Single-project narrative card with milestones |
| [`blocks/`](blocks/) | `*.blocks.transitrix.yaml` | Nested block diagrams | Recursive `block` tree rendered as nested containers |
| [`capability-map/`](capability-map/) | `*.capability-map.transitrix.yaml` | Capability map | Capability hierarchies with maturity overlay |
| [`process-map/`](process-map/) | `*.process-map.transitrix.yaml` | Process map | Top-level process catalogues |
| [`process-blueprint/`](process-blueprint/) | `*.process-blueprint.transitrix.yaml` | Process Blueprint | Wide value-chain blueprint with stage aspects |
| [`scenarios/`](scenarios/) | `*.scenarios.transitrix.yaml` | Scenarios | Alternative strategic development paths |
| [`products/`](products/) | `*.products.transitrix.yaml` | Products catalogue | Portfolio of digital products, services, platforms, and bundles |
| [`product/`](product/) | `*.product.transitrix.yaml` | Product view | Filtered views over Product elements |
| [`applications/`](applications/) | `*.applications.transitrix.yaml` | Applications catalogue | Inventory of applications, integrations, platforms, and data stores |
| [`compliance/`](compliance/) | `*.compliance.transitrix.yaml` | Compliance register | Obligation register |
| [`compliance-c3/`](compliance-c3/) | `*.compliance-c3.transitrix.yaml` | Compliance C3 | C3 compliance view |
| [`compliance-impact/`](compliance-impact/) | `*.compliance-impact.transitrix.yaml` | Compliance impact | Obligation × subject matrix with status |
| [`coverage-metric/`](coverage-metric/) | `*.coverage-metric.transitrix.yaml` | Coverage metric | Assertion-coverage breakdown per regime |
| [`actor/`](actor/) | `*.actor.transitrix.yaml` | Actor register | Actor elements |
| [`stakeholder/`](stakeholder/) | `*.stakeholder.transitrix.yaml` | Stakeholder register | Stakeholder elements |
| [`factor/`](factor/) | `*.factor.transitrix.yaml` | Factor register | Driver / factor elements |
| [`change/`](change/) | `*.change.transitrix.yaml` | Change register | Change elements |
| [`requirement/`](requirement/) | `*.requirement.transitrix.yaml` | Requirement register | Requirement elements |
| [`assertion/`](assertion/) | `*.assertion.transitrix.yaml` | Assertion register | Assertion elements |
| [`constraint/`](constraint/) | `*.constraint.transitrix.yaml` | Constraint register | Constraint elements |
| [`codex/`](codex/) | `*.codex.transitrix.yaml` | Codex | Codex notation |
| [`target-state/`](target-state/) | `*.target-state.transitrix.yaml` | Target state | Target-state notation |

Each folder may contain a `README.md` with format notes and a file index. Legacy `*.cervin.yaml` and FGCA/FGA extensions are **not** part of this corpus (removed in extension 3.0).

## Quick start

1. Install the **Transitrix Studio** extension in VS Code.
2. Open any corpus file — the preview panel opens automatically beside the editor.
3. Edit and save the file to refresh the preview.

For how this tree fits into the broader repo layout, see [`docs/repo-layout.md`](../../../docs/repo-layout.md).
