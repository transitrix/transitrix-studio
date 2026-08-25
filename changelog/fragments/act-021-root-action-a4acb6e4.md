### Added

- **`ACT-021` when an Action Schedule is scoped by `root_action`.** An ACTION the view would otherwise include that is not that root and not reachable from it via `parent` is omitted from the render with a warning that names both ids. The warning does not fire when `root_action` is absent. Duplicate-id `ACT-004` is unchanged.
