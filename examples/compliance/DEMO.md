# Compliance Demo — NorthBay Retail (EU)

A self-contained end-to-end scenario demonstrating all implemented compliance
features in Transitrix Studio. All data is fictional: the organisation
"NorthBay Retail" and its products, processes, and roles do not represent any
real entity. Law text is abbreviated and illustrative.

---

## Scenario overview

**NorthBay Retail** is a fictional EU-based e-commerce retailer preparing for a
supervisory authority audit. It has two products in scope:

| Product | ID | What it is |
|---|---|---|
| E-Commerce Platform | `PRODUCT-ECOMM-1` | Online storefront and order management |
| Customer Support Service | `PRODUCT-SUPPORT-1` | Tier-1/2 support via chat, email, phone |

The applicable regulatory regime covers two EU frameworks:

| Law | Codex ID | Key obligations in scope |
|---|---|---|
| GDPR (Reg. 2016/679) | `LAW-GDPR-1` | Right to erasure, consent management, data portability |
| NIS2 Directive (2022/2555) | `LAW-NIS2-1` | Incident reporting, supply-chain risk management |

---

## File map

```
examples/
├── codex/external/EU/
│   ├── LAW-GDPR-1.yaml                    ← GDPR codex entry
│   └── LAW-NIS2-1.yaml                    ← NIS2 codex entry
├── compliance/
│   ├── requirements/
│   │   ├── REQUIREMENT-GDPR-DATA-ERASURE-1.yaml   ← high, deadline: PAST DUE
│   │   ├── REQUIREMENT-GDPR-CONSENT-1.yaml        ← high, deadline: upcoming
│   │   ├── REQUIREMENT-GDPR-PORTABILITY-1.yaml    ← medium, no deadline
│   │   ├── REQUIREMENT-NIS2-INCIDENT-REPORT-1.yaml← high, deadline: in-force
│   │   └── REQUIREMENT-NIS2-SUPPLY-CHAIN-1.yaml   ← medium, no deadline
│   ├── assertions/
│   │   ├── ASSERTION-ECOMM-GDPR-ERASURE-1.yaml    ← non_compliant (gap + deadline badge)
│   │   ├── ASSERTION-ECOMM-GDPR-CONSENT-1.yaml    ← partial (gap decoration)
│   │   ├── ASSERTION-ECOMM-GDPR-PORTABILITY-1.yaml← compliant
│   │   ├── ASSERTION-ECOMM-NIS2-INCIDENT-1.yaml   ← under_review
│   │   └── ASSERTION-SUPPORT-GDPR-ERASURE-1.yaml  ← compliant
│   └── DEMO.md                            ← this file
├── compliance-impact/
│   └── gdpr-nis2.compliance-impact.view.yaml      ← view-config for impact matrix
└── coverage-metric/
    └── eu-coverage.coverage-metric.transitrix.yaml← coverage view-config (renderer planned)
```

---

## Walk-through: what each view shows

### 1. Compliance Matrix (`transitrix.openComplianceMatrix`)

**What it shows:** Products × Requirements grid. Each cell shows the assertion
status; empty cells are visible gaps (no assertion exists).

**What to look for:**
- `PRODUCT-SUPPORT-1` has no assertion for GDPR consent, GDPR portability,
  NIS2 incident, or NIS2 supply-chain — those are deliberate gaps visible as
  empty cells in the matrix.
- `PRODUCT-ECOMM-1` covers most requirements; the gap dashboard will catch what's missing.

---

### 2. Compliance-Impact View (`gdpr-nis2.compliance-impact.view.yaml`)

Open this file in VS Code and run the **Compliance Impact** command, or the
extension will auto-detect it when you open the file.

**What it shows:** Obligation × product matrix scoped to `LAW-GDPR-1` and
`LAW-NIS2-1`. Each row is a requirement, each column is a product; cells
show the aggregated compliance status.

**Deadline decorations (CV-3):**
- `REQUIREMENT-GDPR-DATA-ERASURE-1` — deadline `2025-12-31` (past due). If
  the assertion for this requirement is `non_compliant` or `partial`, the cell
  shows an **urgent (deadline-past)** decoration.
- `REQUIREMENT-NIS2-INCIDENT-REPORT-1` — deadline `2026-09-01` (in-force,
  within 30 days). Shows the **in-force** decoration on gap cells.
- `REQUIREMENT-GDPR-CONSENT-1` — deadline `2026-09-30` (upcoming). Shows
  the **upcoming** decoration.

---

### 3. Single-Law Tree (`transitrix.openComplianceForLaw`)

Open `LAW-GDPR-1.yaml` and run **Open compliance for this law**.

**What it shows:** GDPR → its three requirements → assertions per
requirement. You can see the `non_compliant` (erasure), `partial` (consent),
and `compliant` (portability) statuses under one law.

---

### 4. Single-Product View (`transitrix.openComplianceForProduct`)

Open `PRODUCT-ECOMM-1.yaml` and run **Open compliance for this product**.

**What it shows:** All requirements bound to the E-Commerce Platform and
their assertion statuses. The `non_compliant` erasure requirement and its
passed deadline stand out immediately.

---

### 5. Gap Dashboard (`transitrix.openComplianceGapDashboard`)

**What it shows:** Requirements without any assertion, and assertions that are
stale (past `next_review_at`).

**Deliberate gaps in this scenario:**
- `REQUIREMENT-NIS2-SUPPLY-CHAIN-1` — no assertion for either product.
  This is the intentional gap: NorthBay has not yet assessed supply-chain
  cybersecurity risk for its products. It appears as a `Requirements without
  assertions` row.

---

### 6. Process Blueprint compliance lane (opt-in)

The `examples/process-blueprint/order-fulfilment.process-blueprint.transitrix.yaml`
can be extended with `lane_config.compliance: true` to activate the compliance
lane. With the demo assertions loaded, the lane will show:

- **STAGE-1** (Receive order): chips for `LAW-GDPR-1` (consent, erasure) and
  `LAW-NIS2-1` (incident). The erasure chip shows `gap` + `deadline` decorations.
- **STAGE-2** (Pick & pack): chip for `LAW-NIS2-1` (incident, under_review).
- **STAGE-3** (Ship): chips for `LAW-GDPR-1` (portability → compliant; erasure
  → `gap`+`deadline`) and `LAW-NIS2-1` (incident).

---

### 7. Export

```bash
# Markdown compliance report (GDPR + NIS2, EU jurisdiction):
transitrix export-compliance --format md \
  --scope law:LAW-GDPR-1 --scope law:LAW-NIS2-1

# PDF (requires WeasyPrint):
transitrix export-compliance --format pdf \
  --scope law:LAW-GDPR-1 --scope law:LAW-NIS2-1 \
  --out northbay-eu-compliance.pdf
```

---

## Why each assertion status was chosen

| Assertion | Status | Reason |
|---|---|---|
| `ASSERTION-ECOMM-GDPR-ERASURE-1` | `non_compliant` | Archive purge pipeline not deployed; overdue deadline makes it the most urgent gap in the scenario |
| `ASSERTION-ECOMM-GDPR-CONSENT-1` | `partial` | Consent capture is fine; one-click withdrawal not yet available — classic "mostly there" partial |
| `ASSERTION-ECOMM-GDPR-PORTABILITY-1` | `compliant` | Self-service export fully operational; demonstrates a clean cell in the matrix |
| `ASSERTION-ECOMM-NIS2-INCIDENT-1` | `under_review` | Runbook drafted but not validated — demonstrates the "in-progress" state that is neither a gap nor confirmed compliant |
| `ASSERTION-SUPPORT-GDPR-ERASURE-1` | `compliant` | Support service erasure is correctly wired — shows that the same requirement can be compliant for one product and non-compliant for another |
| *(no assertion)* | gap | `REQUIREMENT-NIS2-SUPPLY-CHAIN-1` has no assertion for either product — deliberately left open to populate the gap dashboard |
