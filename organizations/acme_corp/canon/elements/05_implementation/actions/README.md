# `canon/elements/05_implementation/actions/`

Action element primitives — each file is one initiative / workstream (an ArchiMate 3.2 *Work Package*) on the **Implementation & Migration** layer. Actions are recursive: an initiative aggregates programmes → projects → tasks, all one TYPE via `parent`. They are arranged by the action view ([`../../../views/action/`](../../../views/action/)) as a precedence network, and by the DGCA / DGA chains ([`../../../views/dgca/`](../../../views/dgca/)).

TYPE registry: [`notations/IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §3.1 (`ACTION`). Layer rationale: [`notations/ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §6.1.

## File convention

`<id>.yaml`, where `<id>` follows `ACTION-[<middle>-]<INTEGER>` from [`IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §1. Examples: `ACTION-DISCOVERY-1.yaml`.

## Schema

Defined in [`notations/ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.4 over the common envelope §3:

- Identity + action fields: `notation: action`, `id`, `name`, `duration_days`, `goals: [GOAL-…]`, `delivers_changes: [CHANGE-…]`, `predecessors: [ACTION-…]`, `parent: ACTION-…`, schedule/cost fields, `description`.
- Admission record ([`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §6) and primitive lifecycle ([`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §7).

`goals` is a first-class time-aware relation (`action_goal`) in the temporal model; inline `goals` is v0.x transitional. `predecessors` stays inline/timeless. The element-lifecycle `valid_from`/`valid_to` are **distinct** from the schedule `start_date`/`end_date` — see [`notations/views/07-action.md`](../../../../../../notations/views/07-action.md).

## Examples in this folder

| File | Notes |
|---|---|
| `ACTION-CRM-EU-1.yaml` | Delivers `CHANGE-EU-CRM-1` (DGCA chain) |
| `ACTION-SUPPORT-1.yaml` | Serves `GOAL-OPS-1` (DGA chain — DGCA with Changes layer off) |
| `ACTION-DISCOVERY-1.yaml` … `ACTION-LAUNCH-1.yaml` | Onboarding precedence network, linked by `predecessors` |

## See also

- Element-primitive schema: [`notations/ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.4, layer §6.1.
- Action notation: [`notations/views/07-action.md`](../../../../../../notations/views/07-action.md).
- Sibling changes catalogue: [`../changes/`](../changes/).
