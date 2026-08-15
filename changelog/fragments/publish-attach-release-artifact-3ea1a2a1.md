### Changed

- **Open VSX publish consumes the release-attached VSIX instead of rebuilding.** Creating a release draft now builds the universal VSIX once and attaches it, with its SHA-256, as a release asset; the Open VSX publish job downloads and verifies that exact file rather than repackaging at publish time. The VS Code Marketplace publish workflow no longer triggers automatically on a release — it runs by `workflow_dispatch` only.
