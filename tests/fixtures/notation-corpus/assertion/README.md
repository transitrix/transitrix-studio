# Assertion — worked examples

Compliance claims that a subject (PRODUCT / PROCESS / CAPABILITY) satisfies a
REQUIREMENT (`notation: assertion`). Schema: methodology
`notations/elements/16-assertion.md`.

These files are mirrored from the methodology canon
(`organizations/acme_corp/canon/assertions/`) and are consumed by the
conformance test in `packages/diagrams/src/assertion/__tests__/example.test.ts`.

- `ASSERTION-MOBILE-DATA-ERASURE-1.yaml` — subject = PRODUCT, status = compliant, all three evidence kinds.
- `ASSERTION-CRM-DATA-ERASURE-1.yaml` — subject = CAPABILITY, status = under_review, empty evidence (ASSERT-007 correctly does not fire).
- `ASSERTION-ONBOARD-DATA-ERASURE-1.yaml` — subject = PROCESS, status = partial, mixed evidence with a documented gap.
