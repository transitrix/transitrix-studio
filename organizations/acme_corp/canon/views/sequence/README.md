# `canon/views/sequence/`

Mermaid sequence diagrams — Application-layer interaction views derived from
the canonical model. Render in VS Code with
[Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid).
No Transitrix Studio required.

## File convention

`*.sequence.md`

## Coverage

Sequence views project **message exchanges between applications** at the
Application layer. They complement BPMN process flows (which show business
lanes and tasks) without duplicating them: BPMN shows who does what; a
sequence view shows which application sends what to which.

**Hard rule:** no Mermaid version of BPMN, Goals, Capability Map, Process Map,
or Gantt — those are native notation and must not be duplicated.

## See also

- `canon/views/applications/` — application catalogue (source for integrations)
- `canon/views/bpmn/` — process flows (BPMN native notation)
