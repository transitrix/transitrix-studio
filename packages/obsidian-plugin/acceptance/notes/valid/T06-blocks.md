# T06 Blocks

Open in **Reading view**. Expected: two diagrams.

## T06a Nested blocks

An "Application" block containing "UI" and "API".

```transitrix-blocks
notation: blocks
spec_version: "0.1"
nested_blocks:
  id: BLOCKS-DEMO-1
  name: Demo architecture
  blocks:
    - id: APP
      name: Application
      children:
        - { id: UI, name: UI }
        - { id: API, name: API }
```

## T06b Grid (RACI)

A grid with columns PM and Eng and one row "Build" (PM = A, Eng = R).

```transitrix-blocks
notation: blocks
spec_version: "0.1"
name: Demo RACI
grid:
  columns:
    - { id: PM, name: "PM" }
    - { id: ENG, name: "Eng" }
  rows:
    - id: BUILD
      name: Build
      assign:
        PM: "A"
        ENG: "R"
```
