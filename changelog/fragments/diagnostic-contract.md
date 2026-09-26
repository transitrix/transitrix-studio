### Validator diagnostic compatibility

ACTION reference, cycle, date and numeric findings now use their element codes,
separate from schedule diagnostics. The catalogue manifest selects the 7.0.0
negative-number restriction; signed 6.x values and duration aliases remain
supported. Invalid numeric types and predecessor shapes produce schema findings.

Products and scenarios projections are reported as unvalidated and fail strict
mode. Inline DGCA requires nonempty collections, with separate rules for
resolved projections and the disabled Changes layer. External codex required
fields use CODEX-002. Existing warnings remain visible.
