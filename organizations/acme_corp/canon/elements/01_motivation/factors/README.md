# `canon/elements/01_motivation/factors/`

Driver element primitives — each file is one **neutral driver** (external or internal) on the ArchiMate 3.2 **motivation** layer (ArchiMate **Driver**). A driver names the standing force the organisation acts on (a regulatory regime, a market shift, an internal performance dimension); it carries no findings and no polarity. Drivers open the strategy chain: they justify the goals that follow. The FGCA / FGA views (`../../../views/fgca/`, `../../../views/fga/`) are the authoring surface; a driver shared across documents is materialised here as its canonical record.

**Driver vs finding.** A DRIVER is the *thing* (e.g. "Support response time"), not a statement about its current state. Dated findings about a driver's state — measurements, trends, observations — are `ASSESSMENT` records that `assesses` the DRIVER ([`../assessments/`](../assessments/), schema [`ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.16). Polarity (whether a finding helps or harms a particular goal) lives on the `assessment_influences_goal` REL ([`17-relations.md`](../../../../../../notations/elements/17-relations.md) §3) — never on the DRIVER or the ASSESSMENT.

TYPE registry: [`notations/IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §3.1 (`DRIVER`).

## File convention

`<id>.yaml`, where `<id>` follows the canonical grammar `DRIVER-[<middle>-]<INTEGER>` from [`IDS_AND_REFERENCES.md`](../../../../../../notations/IDS_AND_REFERENCES.md) §1. Examples: `DRIVER-EU-REG-1.yaml`, `DRIVER-1.yaml`.

## Schema

Defined in [`notations/ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.1 (per-TYPE fields) over the common envelope §3:

- Identity + factor fields: `notation: driver`, `id`, `name`, optional `type` (`external` | `internal`), optional `category` (PESTLE — external only: `political` | `economic` | `social` | `technological` | `legal` | `environmental`), `description`, `references_constraint: [CONSTRAINT-…]`.
- Admission record per [`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §6: `zone: canon`, `admitted_at`, `admitted_by`, `gate_checks`.
- Primitive lifecycle per [`CONTRACT.md`](../../../../../../notations/CONTRACT.md) §7: `valid_from`, `valid_to`.

## Examples in this folder

| File | Notes |
|---|---|
| `DRIVER-EU-REG-1.yaml` | External driver — EU regulatory regime for market entry; `category: legal`; references `CONSTRAINT-GDPR-RESIDENCY-1` |
| `DRIVER-COMP-1.yaml` | Internal driver — support response time (the performance dimension); assessed by `ASSESSMENT-SUPPORT-RESPONSE-1` |

## See also

- Element-primitive schema: [`notations/ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.1.
- ASSESSMENT (findings about a driver): [`../assessments/`](../assessments/), [`ELEMENT_PRIMITIVES.md`](../../../../../../notations/ELEMENT_PRIMITIVES.md) §7.16.
- `assessment_influences_goal` REL (where polarity / SWOT lives): [`notations/elements/17-relations.md`](../../../../../../notations/elements/17-relations.md) §3.
- FGCA / FGA notations: [`notations/views/02-fgca.md`](../../../../../../notations/views/02-fgca.md), [`notations/views/03-fga.md`](../../../../../../notations/views/03-fga.md).
- Views over these elements: [`../../../views/fgca/`](../../../views/fgca/), [`../../../views/fga/`](../../../views/fga/).
