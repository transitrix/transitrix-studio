### Changed

- **`.ttrs` headers use `recipe_id` / `recipe_version`.** Fixtures, the document renderer, and `transitrix render` follow methodology 4.0.0: the header fields and the identifiers that carry them (`recipeId`, `parseRecipe`, `recipePath`) no longer use `template` as the name of this object. The vendored renderer is pinned to `v4.0.0`.
