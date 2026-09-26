### Validator diagnostic compatibility

ACTION reference, cycle, date and numeric findings now use their element codes,
separate from schedule diagnostics. The catalogue manifest selects the 7.0.0
negative-number restriction; signed 6.x values and duration aliases remain
supported. Invalid numeric types and predecessor shapes produce schema findings.

Products and scenarios projections are reported as unvalidated and fail strict
mode. Inline DGCA requires nonempty collections, with separate rules for
resolved projections and the disabled Changes layer. External codex required
fields use CODEX-002. Existing warnings remain visible.

Reference diagnostics now use the published Compliance Impact, Coverage Metric,
REL and DGCA identities. Legacy unreferenced-element warnings become visible
coverage observations for current catalogues. Inline catalogue schema messages
retain their form, field and expected/actual type. Capability Map validates
maturity from sidecar history and rejects inline time-varying storage; the
scenario-set template is explicitly unvalidated rather than checked as a
legacy singular scenario.
