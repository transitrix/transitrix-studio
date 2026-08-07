# Integration — worked examples

Application-layer integrations (`notation: integration`). Schema:
`ELEMENT_PRIMITIVES.md` §7.8.

Hand-authored — no promoted `INTEGRATION` element exists yet in the acme-corp
worked example (v1 nests integrations inline under an application's
`integrations[]`); consumed by `tests/validate-notation.test.ts`.

- `INTEGRATION-OMS-EVENTS-1.yaml` — `interface_semantics: true`, all five conditional fields present.
- `INTEGRATION-CRM-SYNC-1.yaml` — plain point-to-point data pipe, no interface semantics.
