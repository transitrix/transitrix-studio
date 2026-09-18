### Fixed

- **Repository validation coverage.** Reports discovered, read, validated, unvalidated, and failed file counts. Field primitives and unsupported or missing notation headers remain visible, with strict mode rejecting unvalidated files. Reads both view layouts during migration, reports the published `MIX-001` warning, excludes templates and independent catalogues, and retains warnings and informational findings in reports.
