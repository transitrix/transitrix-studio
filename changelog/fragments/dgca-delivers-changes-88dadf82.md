### Fixed

- **DGCA projection follows `delivers_changes`.** An Action that links to a Change only through the canonical `delivers_changes` field is included when `view_config.actions.surface` is `derived`, and the preview builds Change-to-Action edges from that field. The older `changes` field and `view_config.activities` remain aliases.
