### Added

- Per-file relation validation accepts `reports_to` and checks scalar endpoints,
  admission metadata and inclusive lifecycle dates. Actor validation rejects
  inline reporting fields while preserving free-form extensions. Reporting
  graph validation and dated queries remain separate from file validation.
