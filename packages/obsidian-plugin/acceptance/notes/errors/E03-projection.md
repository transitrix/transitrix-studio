# E03 Repository projection (unsupported)

Open in **Reading view**. Expected: each fence shows an error panel saying repository-derived views are unsupported and a self-contained document is needed.

```transitrix-goals
notation: goals
id: GOALS-PROJ-1
name: Projection only
sources:
  - some/other/file.yaml
```

```transitrix-dgca
notation: dgca
id: DGCA-PROJ-1
name: Projection only
view_config:
  goals:
    filter: all
```
