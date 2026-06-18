Report counts of compliance-relevant codex entries grouped by entity category and admission stage.

---

## Step 1 - locate entry points

From the current working directory (or repo root), identify three entry locations:

1. **REQUIREMENT files** - YAML files anywhere under `canon/` whose `notation:` field is `requirement`. Typically at `canon/elements/01_motivation/requirements/*.yaml`.
2. **ASSERTION files** - YAML files anywhere under `canon/` whose `notation:` field is `assertion`. Typically at `canon/assertions/*.yaml` or `canon/elements/**/*.yaml`.
3. **CODEX_SOURCE entries** - all YAML files under a `codex/` directory at the repo root (any depth). These carry `zone: codex`; they do not use the `notation:` key.

If none of the three groups yields any files, print:

```
/codex-status: no codex entries found in this repo
```

and stop.

---

## Step 2 - collect and categorise

Scan all YAML files in the three locations above. Assign each file to exactly one category:

| Category label | Criteria |
|---|---|
| `REQUIREMENT` | `notation: requirement` anywhere under `canon/` |
| `ASSERTION` | `notation: assertion` anywhere under `canon/` |
| `CODEX_SOURCE` | Any `.yaml` file directly under a `codex/` directory tree |

Skip README.md and any file that does not parse as valid YAML.

---

## Step 3 - extract admission stage

For each file, determine its admission stage:

**For REQUIREMENT and ASSERTION files** - read in priority order:
1. `admission_state:` field. Values: `proposed` / `active` / `rejected`. Absent means `active`.
2. If `admission_state:` is absent and a `status:` field is present, use it.
3. If neither is present, treat as `active`.

**For CODEX_SOURCE files** - read in priority order:
1. `admission_state:` field if present.
2. If `zone: codex` is set and `admission_state:` is absent, treat as `admitted`.
3. If neither `zone:` nor `admission_state:` is set, treat as `proposed`.

---

## Step 4 - build counts

Group by (category, stage).

Rows = `REQUIREMENT`, `ASSERTION`, `CODEX_SOURCE` (always in this order; show a row even if count is 0).
Columns = all distinct stage values found, sorted as: `proposed` first, then `active` / `admitted`, then `rejected`, then any other values alphabetically.

---

## Step 5 - output the table

Print:

```
/codex-status - <repo-name or current directory>

| Category | proposed | active | rejected | ... |
|----------|----------|--------|----------|-----|
| REQUIREMENT | 0 | 6 | 0 | ... |
| ASSERTION | 1 | 7 | 0 | ... |
| CODEX_SOURCE | 0 | 2 | 0 | ... |
| **Total** | **N** | **N** | **N** | ... |
```

Rules:
- Omit a stage column entirely if its total across all rows is 0.
- Print a `**Total**` row at the bottom summing each column.
- Count only: no file paths, no IDs, no descriptions.
