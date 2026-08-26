### Fixed

- **Compliance views scan `canon/` and `codex/`, not every YAML in the workspace.** Opening a view under an organisation `canon/` tree ingests that tree and its sibling `codex/` — the same roots the CLI uses. Palette-opened dashboards still search those folders and skip `node_modules`, `.archive`, `packages`, and test fixtures. Duplicate artefact ids are labelled as duplicates, not as unrecognized notation, and a compliance-impact preview uses the opened view file as its config.
