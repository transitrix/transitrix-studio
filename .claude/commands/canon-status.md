Report entity counts in the project's `canon/` directory, grouped by entity type and lifecycle stage.

---

## Step 1 - locate canon

Find the canon root by checking these paths in order from the current directory:
1. `canon/` relative to the current working directory
2. Walk up parent directories until a `canon/` directory is found, or the root of the git repo is reached

If no `canon/` directory is found at all, print:

```
/canon-status: no canon directory found in this repo
```

and stop.

---

## Step 2 - collect files

Scan recursively for YAML files under:
- `<canon-root>/elements/`
- `<canon-root>/relations/`

Glob: `**/*.yaml` (and `**/*.yml` as a fallback). Skip README.md and any non-YAML files.

For each YAML file parse the top-level frontmatter keys. YAML comment lines (`# ...`) are skipped automatically.

---

## Step 3 - extract type and stage

For each file, extract two values:

**Entity type** - read in priority order:
1. `notation:` field (the canonical key in Transitrix notation files)
2. `type:` field (fallback for older or alternate layouts)
3. If neither is present, use `(unknown)`

**Lifecycle stage** - read in priority order:
1. `admission_state:` field. Values: `proposed` / `active` / `rejected`. Absent means `active` (back-compat rule: human-authored canon is admitted by construction).
2. If `admission_state:` is absent and a `status:` field is present, use its value directly.
3. If neither field is present, treat as `active`.

Skip files where the entity type is `(unknown)` - they are not typed entities.

---

## Step 4 - build counts

Group the collected (type, stage) pairs.

Rows = all distinct entity types found, sorted alphabetically.
Columns = all distinct stage values found, sorted as: `proposed` first, then `active`, then `rejected`, then any other values alphabetically.

---

## Step 5 - output the table

Print:

```
/canon-status - <repo-name or current directory>

| Type | proposed | active | rejected | ... |
|------|----------|--------|----------|-----|
| capability | 0 | 4 | 0 | ... |
| goal | 0 | 3 | 0 | ... |
| ... | ... | ... | ... | ... |
| **Total** | **N** | **N** | **N** | ... |
```

Rules:
- Omit a stage column entirely if its total is 0.
- Print a `**Total**` row at the bottom summing each column.
- If every entity across all types has stage `active` (or absent), print a note after the table: `All entities are active (admitted).`
- Count only: no file paths, no IDs, no descriptions.
