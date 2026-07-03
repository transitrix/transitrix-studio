# tools/ — internal tooling

Scripts in this directory are **internal team tooling** — not part of the published acme-corp
example and not intended for end users.

## dsm-demo-seed.sql

Populates a running [DSM](https://github.com/transitrix/transitrix-dsm) instance with the
acme-corp FGCA chain (Factor → Goal → Change → Activity) for demo and development purposes.

**When to use:** after starting DSM locally or on a dev instance, to load meaningful example
data that mirrors the acme-corp canon.

**How:**

```bash
psql "$DATABASE_DSN" -f tools/dsm-demo-seed.sql
```

Requires DSM schema already applied and at least one organization + active scenario present.
The script is idempotent — safe to re-run.

**Future direction:** this seed will be generated from the acme-corp YAML notations directly
once the DSM text-repo ingest pipeline (T9 serializer) is in place. Until then the SQL is
maintained by hand alongside the canon YAML.
