# `documents/` — document-source (`.ttrs`) fixtures

Document sources for the file-level checks in `src/validate-document-source.ts`:
extension, placement, and filename/header kind agreement (`CONTRACT.md` §3 —
`HDR-003`, `TTRS-013`).

| Fixture | What it is for |
| --- | --- |
| `product.mrd.ttrs` | A well-formed document source. Copied into `canon/views/documents/` by the test — the placement the checks require. |
| `kind-mismatch.mrd.ttrs` | Filename kind `mrd`, header `kind: srs` — the disagreement `TTRS-013` names. |

Two of the four cases the checks cover are properties of a **path**, not of a
file's content, so they have no fixture here and are written by the test at the
placement they are testing:

- the `.trs` near-miss — a `.trs` file committed under `tests/fixtures/` would be
  a `.trs` file in the tree, which is the thing the check tells authors not to do;
- a misplaced `.ttrs` — the fixture above, written somewhere other than
  `canon/views/documents/`.

Kinds (`mrd`, `srs`, `sdd`, …) are the middle segment of the filename and are
**not** notations of their own, so there is deliberately one fixture per *case*
and not one per kind.
