# `canon/views/state/`

Mermaid state diagrams — Application-layer lifecycle views derived from the
canonical model. Render in VS Code with
[Markdown Preview Mermaid Support](https://marketplace.visualstudio.com/items?itemName=bierner.markdown-mermaid).
No Transitrix Studio required.

## File convention

`*.state.md`

## Coverage

State views project **lifecycle stages of application-managed objects** (an
order, a data-subject request) at the Application layer. They complement
process views (BPMN, Process Blueprint) without duplicating them: BPMN shows
the task flow; a state diagram shows the object's status transitions.

**Hard rule:** no Mermaid version of BPMN, Goals, Capability Map, Process Map,
or Gantt — those are native notation and must not be duplicated.

## See also

- `canon/elements/02_business/processes/` — PROCESS elements (source model)
- `canon/views/bpmn/` — process flows (BPMN native notation)
