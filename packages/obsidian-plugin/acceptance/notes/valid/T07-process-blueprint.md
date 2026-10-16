# T07 Process Blueprint

Open in **Reading view**. Expected: a blueprint with two stages, "Receive" and "Ship".

```transitrix-process-blueprint
notation: process-blueprint
spec_version: "0.1"
process_blueprint:
  id: PROCESS_BLUEPRINT-DEMO-1
  name: Demo fulfilment
  process: PROCESS-DEMO-1
  stages:
    - { id: STAGE-1, name: Receive, goal: Capture order, result: Order recorded }
    - { id: STAGE-2, name: Ship, goal: Dispatch, result: In transit }
```
