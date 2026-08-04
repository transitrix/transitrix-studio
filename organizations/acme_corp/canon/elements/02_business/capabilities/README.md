# `canon/elements/02_business/capabilities/`

Capability element primitives — each file is one capability the organisation can perform, sitting on the ArchiMate 3.2 **business** layer. The hierarchical view over these elements (with CMM maturity overlay) lives at [`../../../views/capabilities/`](../../../views/capabilities/).

Time-varying attributes (`current_maturity`, `target_maturity`, `owner_role`, `target_date`) live in a co-located sidecar (`<id>.history.yaml`) per [`notations/CONTRACT.md`](../../../../../../notations/CONTRACT.md) §9. They are **not** stored inline on the element file; inline placement triggers `VERSIONED-004`.

TYPE registry: [`notations/IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §3.1 (`CAPABILITY`), §2 (V/H sub-grammar), §4 (uniqueness scope).

## File convention

`<id>.yaml`, where `<id>` follows the canonical `CAPABILITY-V[N][.N[.N]]` or `CAPABILITY-H[N][.N]` grammar from [`IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §2 (the V/H exception to the general `<TYPE>-…-<INTEGER>` form).

For each capability, an optional sidecar `<id>.history.yaml` carries the time-varying attribute history per [`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §9. The sidecar has no `notation:` header and no admission record of its own — it follows its target primitive.

## Schema

Stable fields live on the element file. Defined in [`notations/views/05-capability-map.md`](../../../../../../notations/views/05-capability-map.md) §13 (fields table) with the inline/sidecar split annotated. Each capability element carries:

- The capability-specific stable fields: `notation: capability`, `id`, `name`, `type`, `description`, `business_process`, `applications`, `children`.
- The admission record per [`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §6: `zone: canon`, `admitted_at`, `admitted_by`, `gate_checks`.
- The primitive lifecycle per [`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §7: `valid_from`, `valid_to`.

Time-varying fields (`current_maturity`, `target_maturity`, `owner_role`, `target_date`) live in the sidecar — not inline.

## Examples in this folder

| File | Notes |
|---|---|
| `CAPABILITY-V1.yaml` | Order Management — stable fields only; time-varying attributes in the sibling sidecar |
| `CAPABILITY-V1.history.yaml` | Sidecar with four time-varying attributes (`current_maturity` / `target_maturity` / `owner_role` / `target_date`) demonstrating the CONTRACT.md §9 pattern, including a maturity progression over three years, a target revised upward, and an owner-role handover |
| `CAPABILITY-H1.yaml`, `CAPABILITY-V1.1.yaml`, `CAPABILITY-V1.2.yaml`, `CAPABILITY-V2.yaml` | Minimal examples — each pairs with a single-entry `<id>.history.yaml` sidecar for `target_maturity`, the mechanical migration pattern (§9.4) for a value with no prior history |

## See also

- Capability-map view notation: [`notations/views/05-capability-map.md`](../../../../../../notations/views/05-capability-map.md) — full field-table schema (incl. inline/sidecar split) and §14 sidecar reference.
- Sidecar contract: [`notations/CONTRACT.md`](../../../../../../notations/CONTRACT.md) §9.
- Capability-map views over these elements: [`../../../views/capabilities/`](../../../views/capabilities/).
