### Fixed

- **DGA-mode DGCA omits the Changes column.** A `dgca` document with `view_config.layers.changes: off` (and no `changes:` key) renders Driver → Goal → Action. A four-layer DGCA is unchanged.
