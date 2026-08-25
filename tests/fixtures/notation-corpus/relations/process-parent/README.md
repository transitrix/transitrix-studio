# Catalogued Process Blueprint columns

Order fulfilment as a value chain: receive, pick, and ship are child `PROCESS` elements, not document-local `STAGE-…` sketches. The blueprint lists those processes as columns; `name`, `goal`, and `result` come from the PROCESS files under `canon/elements/`, not from restated view fields.

Composition is the `process_parent` relation (`PROCESS` → `PROCESS`). Column order is the `stages[]` array, not the relation.

The `STAGE-` only sketch remains at [`../../process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml`](../../process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml).
