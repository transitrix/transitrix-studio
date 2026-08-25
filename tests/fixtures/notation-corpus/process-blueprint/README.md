# Process Blueprint notation — examples

File extension: **`.process-blueprint.transitrix.yaml`**

## Format overview

A process blueprint is a wide, single-page diagram that maps each stage of a value chain to its supporting operational context — systems, actors, equipment, and information entities — together with the stage's goal and result. Stages are laid out left to right; each stage is a column, and the aspect categories are fixed rows that align horizontally across columns.

The data shape is **flat**: a single `process_blueprint:` root with parallel arrays for `stages[]` and the four aspect categories. Each aspect entry carries a `stages: […]` cross-reference listing every column it appears in — a document-local `STAGE-…` sketch or an admitted `PROCESS-…`. The nested-box visual is derived from this flat shape by the renderer — entries spanning consecutive columns render as a single pill; entries on non-consecutive columns render as one pill per column.

A catalogued-column worked example (columns are child `PROCESS` elements; headers and goal/result come from those elements) lives at [`../relations/process-parent/`](../relations/process-parent/).

## Files in this folder

| File | Description |
|---|---|
| [`order-fulfilment.process-blueprint.transitrix.yaml`](order-fulfilment.process-blueprint.transitrix.yaml) | Three-stage retail order-fulfilment blueprint (Receive → Pick & pack → Ship) with all four aspect categories populated |

## Notation header

Every file must start with:

```yaml
notation: process-blueprint
```

## Required fields

| Field | Description |
|---|---|
| `process_blueprint.id` | Pattern `PROCESS_BLUEPRINT-[<middle>-]<INTEGER>` |
| `process_blueprint.name` | Display name |
| `process_blueprint.stages` | Non-empty array of column entries |
| `stages[].id` | `STAGE-[<middle>-]<INTEGER>` (sketch) or `PROCESS-[<middle>-]<INTEGER>` (catalogued); unique within the document |
| `stages[].name` / `goal` / `result` | Required on `STAGE-…` columns. Omit on `PROCESS-…` columns — the preview derives them from the child PROCESS element |

## Optional fields

| Field | Description |
|---|---|
| `process_blueprint.description` / `period` / `version` / `date` / `author` | Document metadata |
| `process_blueprint.process` / `scenario` | Cross-references to a `PROCESS-…` or `SCENARIO-…` element |
| `process_blueprint.systems[]` | Applications used in the stages — entries with `id` must use the `APPLICATION-` prefix |
| `process_blueprint.actors[]` | Roles carrying out the stages — entries with `id` must use the `ROLE-` prefix |
| `process_blueprint.equipment[]` | Physical instruments — free-form labels in v0.1 |
| `process_blueprint.information_entities[]` | Data, documents, records — free-form labels in v0.1 |

Every aspect entry has `name` and `stages: […]` (non-empty). An entry's `id` is optional; when present it must match the canonical grammar `<TYPE>-[<middle>-]<INTEGER>`.

## Preview

Open any `.process-blueprint.transitrix.yaml` file in VS Code with Transitrix Studio installed — the preview panel opens automatically showing the value chain as a horizontal grid: columns across the top, goal/result rows above the fixed aspect rows (systems → actors → equipment → information). Entries spanning consecutive columns render as a single pill; entries on non-consecutive columns render as one pill per column. A `PROCESS-…` column reads its header and goal/result from the matching PROCESS element under a neighbouring or ancestor `canon/elements/` tree.

## Canonical reference

The canonical spec lives in the [methodology repo](https://github.com/transitrix/methodology) at [`notations/13-process-blueprint.md`](https://github.com/transitrix/methodology/blob/main/notations/13-process-blueprint.md).
