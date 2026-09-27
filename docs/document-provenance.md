# Check document provenance

Use `transitrix check-document` to compare retained evidence without rendering
or writing any files:

```sh
transitrix check-document --run report.run-record.json --recipe report.ttrs --output report.md --json
```

The command always prints structured JSON using `document-provenance/1`.
Exit codes are 0 for complete consistency, 1 for inconsistent evidence, and 2
for incomplete evidence or invalid arguments. An inconsistent result can also
be incomplete: inspect both fields. Optional file arguments may be omitted;
their checks remain unknown. Select one issued artifact per invocation.

In VS Code, run **Transitrix: Check Document Provenance** from the command
palette or a `.ttrs` editor toolbar. Select the retained run record, recipe and
issued artifact, then choose whether to add a recorded claims JSON file.
The report shows coverage, every check's scope and reason, recorded claims,
observed comparison values, evidence handles and explicit gaps. Cancellation
does not read evidence. An untrusted workspace returns generic unavailable
evidence. Checking does not invoke the renderer or offer regeneration.

Both interfaces read only the explicitly selected local files. They do not
follow references within them, inspect Git, resolve tags, or import author-supplied
observations. File access failures produce generic evidence diagnostics without
paths or exception text. Use the CLI under the local caller's filesystem access
policy; its arguments authorize disclosure of the selected bundle to that caller.

`--claims claims.json` supplies recorded assertions, never trusted observations.
For example, the optional fields `recipe_sha256`, `output_sha256` and
`output_run_sha256` compare declared lowercase SHA-256 values against the exact
selected bytes. The last field declares which run the output belongs to; a match
does not establish that the run generated it. Other claims include repository
identity, input kind, snapshot identity, selection digest, product/release,
document issue/revision and material input inventories. Without independently
retained observations, these checks remain unverifiable. A claims file cannot
supply such observations through an `observed` field.

Matching labels or digests establish consistency only, not generation,
authenticity, approval or compliance. Legacy run records lack exact snapshot,
selection, input closure and output binding evidence. Today's HEAD cannot fill
those gaps. `model_id` denotes the model used for generated prose. Document
revision is independent of product release; repository/snapshot identity is
independent of both. Changes require review only when independently observed
complete closure supports that conclusion; unknown closure stays unknown.

The shared checker is pinned at source revision
`4a8c3028fc98290bbbef7a67d38ce851549590a4` under
`vendor/methodology/document-renderer/provenance/`. Its `VENDORED.json` records
the contract and SHA-256 hashes; the adjacent schema describes the result.
This isolated import closure preserves the existing renderer's separate pin.
Both consumer adapters call this checker and preserve its result and ordering.
