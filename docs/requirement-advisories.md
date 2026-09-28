# Requirement language advisories

The opt-in English pilot asks review questions about `TBD`/`TBC`, “as soon as
possible”, and “fast”/“quickly”/“user-friendly” in REQUIREMENT `name` and
`description`. Findings are advisory: they do not fail validation or CI, score
quality, rewrite text, or change agreement, admission or verification state.

The rules follow [contract 0.1.0 at its pinned revision](https://github.com/transitrix/methodology/blob/e3b51b64c837bd6a05eb5c1631819cc2adf1ccfd/notations/requirement-language-advisories.md).
Only explicitly selected fields and English ranges are evaluated. Source text,
code, quotations and CommonMark reference mentions are excluded. A match is a
question, not proof of a defect or a claim that no criterion exists elsewhere.

## Use the same request in the CLI and editor

Create a JSON request **outside** your model repository. This file is your local
read authorization and pilot configuration; it is not a canonical model record.
Use an absolute `root` pointing to your Git working tree, a stable repository
identity, and repository-relative paths for the records you wish to read:

```json
{
  "version": "1.0.0",
  "root": "/path/to/model",
  "repositoryIdentity": "my-model",
  "configuration": {
    "enabled": true,
    "rules": ["RLA-PLACEHOLDER", "RLA-TIMING", "RLA-EVALUATIVE"],
    "english": { "name": true, "description": true }
  },
  "requirements": [
    {
      "path": "canon/elements/requirements/example.yaml",
      "fields": ["name", "description"]
    }
  ]
}
```

Run `transitrix advisories /path/to/request.json` to print normalized JSON.
In VS Code, run **Transitrix: Review Requirement Language (Opt-in)** and choose
that same request. The editor renders the same result, including coverage,
context resolutions, dismissals and evidence. Neither consumer implicitly scans
the repository or fetches URLs. Editor evaluation reads saved files; save the
document first to include edits.

Set `enabled` to `false` to disable evaluation, or remove rules to narrow it.
For mixed-language fields, replace `true` with explicitly selected ranges such
as `[[0, 24], [40, 65]]`. Offsets count Unicode scalar values in the entire
decoded string, including Markdown. Unselected language is never inferred from
a token match.

Coverage is `not-evaluated`, `partially-evaluated`, or `evaluated`. Only fully
evaluated scope with an empty active findings list has `no-findings`; inspect
the separate resolution and dismissal lists as well. None of these states is
a verification verdict. Malformed YAML, non-string fields, unsupported syntax
or unavailable exact source mapping produces a coverage limitation. Missing
and denied context both produce `context-unavailable`.

## Context and reviewer decisions

An optional request `contexts` object maps local handles to explicit files.
Each requirement selects handles using its own `contexts` array. For a
verification, supply `{ "path": "canon/elements/verifications/check.yaml",
"kind": "verification" }`. The adapter requires an admission envelope and
uses only `protocol`, `verifies`, and optional `verified_on` scope. A requirement
selection's optional `release` must match the verification's release.

For a definition, supply `kind: "definition"`, `path`, `requirementPath`,
`target`, `anchor`, `selectedLink`, `excerpt`, and the exact file `sha256`.
`target` is relative to the requirement's file and `selectedLink` equals
`target + "#" + anchor`. It must occur as a link in the selected field. The
target file must contain both the anchor (an explicit HTML/Markdown anchor or
a heading slug) and excerpt. These checks establish provenance, not semantic
adequacy. Paths outside the selected repository, including escaping symlinks,
are refused. No target is opened merely because a link names it.

Bindings belong in a requirement selection's external `bindings` array. A
binding includes `requirementId`, `field`, `fieldSha256`, `span`, `rule`,
`contextSha256`, `snapshot`, `actor`, `rationale`, and a `resolution` of
`criterion-supplied`, `placeholder-resolved`, or `intentional-high-level`.
Copy exact evidence from the result after review. Valid, unambiguous bindings
move candidates to `contextResolutions`. Stale or conflicting bindings keep
candidates active. Context presence alone never resolves a candidate.

To dismiss or revoke, explicitly configure `auditPath` outside the model
repository and provide a reviewer identity and reason:

```sh
transitrix advisories request.json --dismiss FINDING_ID --actor reviewer --reason "Reviewed for this snapshot"
transitrix advisories request.json --revoke FINDING_ID --actor reviewer --reason "Review reopened"
```

The editor offers these same explicit actions after opening a review. Audit
storage is append-only JSON Lines; evaluation never writes it. The local OS
user supplies and authorizes these decisions. A multi-user service must
authenticate the actor and authorize both access and decisions itself; an actor
string is not authentication. Re-evaluation verifies that the result is still
current before appending. A different source snapshot or context digest
requires a fresh decision. No rule-wide or requirement-wide suppression exists.

## Shared result interface

`src/requirement-advisories/index.ts` exports `evaluateRequirements`, its typed
adapter, result `1.0.0`, and audit-event constructor. Consumers can bind this
interface to their existing transport; it introduces no server or transport
protocol. The adapter authorizes an opaque handle **before** reading it.
Unauthorized requirement metadata is omitted. Context read errors and denials
have one generic representation, without target identities, paths or counts.

The result pins contract revision and rule version, Unicode 15.1.0 category
data, enabled configuration and digest, repository identity, and snapshot.
The local snapshot is the Git commit plus a digest of the explicitly selected
visible file paths and their actual byte hashes, sorted by UTF-8 path bytes.
It identifies this selected overlay, not every file in a working tree. Other
adapters must supply their actual authorized snapshot and retain this scope
distinction. Context is checked against the same snapshot.

Every finding carries its decoded scalar span, matched text, original UTF-8
`sourceSegments`, source/field hashes, rule/version, advisory question,
negation evidence, consulted visible contexts and limits. Findings sort by
UTF-8 source path, requirement ID, field, span, and rule. The content-bound
finding identity follows the contract's compact UTF-8 JSON array algorithm;
YAML wrapping does not change it. Dismissal additionally binds the snapshot and
context digest, so a later source revision does not inherit suppression.

Production context digests hash compact `JSON.stringify` output of the
returned visible-context array sorted by identity and revision. Preserve the
returned object member order when confirming a binding. Context excerpts are
never normalized. This is a versioned adapter convention outside the canonical
schema.

YAML 1.2 parsing uses `yaml` 2.8.1; CommonMark classification uses
`mdast-util-from-markdown` 2.0.2 and `micromark` 4.0.2. Matching is ASCII-case
insensitive with pinned Unicode identifier boundaries. Source maps preserve
escaped scalars, UTF-8 byte widths, and literal versus folded line breaks.
If an exact mapping cannot be established, the field is not evaluated. Display
code must convert scalar offsets to UTF-16 explicitly, for example
`Array.from(value).slice(0, scalarOffset).join('').length`; source segments are
not a replacement-edit range.
