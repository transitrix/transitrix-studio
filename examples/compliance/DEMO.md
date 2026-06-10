# Compliance Demo — acme_corp (EU)

> **This example directory is retired.** The canonical compliance demo has moved
> to the `transitrix/methodology` repository under `organizations/acme_corp/`.
>
> See: https://github.com/transitrix/methodology/tree/main/organizations/acme_corp

---

## Quick start

Open Transitrix Studio in VS Code, then open any of these files from
`transitrix/methodology/organizations/acme_corp/`:

| File | What you see |
|---|---|
| `canon/views/eu-compliance.compliance-impact.transitrix.yaml` | Compliance matrix: obligations × products |
| `canon/views/eu-coverage.coverage-metric.transitrix.yaml` | Coverage-% gauge per law |
| `examples/process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml` | Process blueprint with compliance lane |

## Features demonstrated

| Feature | Entry point |
|---|---|
| Compliance matrix | Compliance-impact view |
| Single-law view | Filter `derived_from_codex: [LAW-GDPR-1]` |
| Single-product view | Filter `subjects.products: [PRODUCT-ECOMM-1]` |
| Gap dashboard | NIS2 supply-chain has no assertion → gap cell |
| Compliance-impact view | `eu-compliance.compliance-impact.transitrix.yaml` |
| Coverage-metric view | `eu-coverage.coverage-metric.transitrix.yaml` |
| Process blueprint lane | Order-fulfilment blueprint with `lane_config.compliance: true` |

---

Original NorthBay Retail demo files archived at `.archive/compliance-northbay-demo/`.
