---
id: ADR-0003
title: "Pin methodology_version to 1.0.0 for the acme-corp model"
status: accepted
date: "2026-07-06"
author: agent
source: ad-hoc
relates_to: []
superseded_by: null
---

## Context

The methodology released 1.0.0. The Discovery job, comparing the pinned
`methodology_version` against the latest released tag on the source repository,
found this repository behind and prepared this record. Per the architecture
decision log, a consequential change made by an agent leaves a `proposed`
decision for human ratification, not an unannounced edit.

The 0.7 → 1.0 migration recipe (`migrations/0.7-to-1.0/` in the source
methodology repository) was applied before ratification: scenarios
`activities:` → `actions:`, compliance-impact `report_type` added, registry
ID `SOURCE-EU-AI-ACT-1` renamed to `SOURCE-EU-AIACT-2024-1` (avoids false
`ACT-*` abbreviated-prefix match on "AI Act"), post-migration validate clean.

## Decision

Pin `methodology_version: "1.0.0"` in `transitrix.yaml`.
**Accepted** by maintainer 2026-07-06 after migration recipe applied.

## Consequences

- The model is validated against 1.0.0 semantics.
- The 0.7 → 1.0 migration recipe was applied; `validate.mjs` exits 0.
- Supersedes the effective scope of ADR-0002 (0.5.0 pin) for methodology-version purposes.
