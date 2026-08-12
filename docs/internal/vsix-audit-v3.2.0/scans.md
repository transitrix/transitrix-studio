# v3.2.0 third-party scan — two independent engines, both clean

Task: transitrix-hq#135 · Epic: transitrix-hq#130. Uses the artefacts from transitrix-hq#132
and the binary-component list from transitrix-hq#133.

Two independent engines' verdicts are recorded below, satisfying this task's acceptance
criteria. Engine 2 (VirusTotal) was unblocked by Valerii's 2026-08-11 decision to provide a
free-tier API key (recorded on transitrix-hq#135) — see "Blocked: second independent engine"
below for the prior state, kept for the record.

## What ran: Microsoft Defender (local, on-demand)

`MpCmdRun.exe -Scan -ScanType 3 -File <path> -DisableRemediation` (targeted single-item scan,
remediation disabled so a hit would be reported, not auto-quarantined, preserving evidence).
Signatures refreshed immediately before scanning (`AntivirusSignatureVersion 1.457.110.0`,
`AntivirusSignatureLastUpdated 2026-08-11T11:17:13-07:00`, `AMEngineVersion 1.1.26070.7`).

| Target | Verdict |
|---|---|
| `transitrix.transitrix-studio-3.2.0@linux-x64.vsix` | Clean — "found no threats" |
| `transitrix.transitrix-studio-3.2.0@win32-x64.vsix` | Clean — "found no threats" |
| `transitrix.transitrix-studio-3.2.0@darwin-arm64.vsix` | Clean — "found no threats" |
| `transitrix.transitrix-studio-3.2.0@linux-arm64.vsix` | Clean — "found no threats" |
| Full unpacked tree of all four (`unpacked/`, all 517×4 paths, including all 13 binary/non-plaintext components from transitrix-hq#133) | Clean — "found no threats" |

Verbatim tool output, all five runs:

```
Scan starting...
Scan finished.
Scanning <path> found no threats.
```

This covers every binary/non-plaintext component named in transitrix-hq#133 (the four
`.vsix` archives plus the fully unpacked tree containing each of the 13 components
individually) under a single engine.

## Engine 2: VirusTotal (hash lookup, then upload where unknown)

Artefacts re-fetched from the same Open VSX URLs recorded in [`README.md`](README.md); local
SHA-256 of each re-download matched `SHA256SUMS.txt` byte-for-byte before any submission.

Per the decision on transitrix-hq#135, checked each SHA-256 against VirusTotal's file report
endpoint first, and uploaded the file only for a hash VirusTotal had no record of
(`GET /api/v3/files/{sha256}` → 404). All four verdicts, verbatim `last_analysis_stats`:

| Target | SHA-256 | Path | Verdict |
|---|---|---|---|
| `...@linux-x64.vsix` | `2bfc0…7ebd84d` | uploaded (hash unknown to VT) | `{"malicious":0,"suspicious":0,"undetected":60,"harmless":0,"timeout":4,"confirmed-timeout":0,"failure":3,"type-unsupported":8}` |
| `...@linux-arm64.vsix` | `6051b…663e27b19` | uploaded (hash unknown to VT) | `{"malicious":0,"suspicious":0,"undetected":64,"harmless":0,"timeout":1,"confirmed-timeout":0,"failure":2,"type-unsupported":8}` |
| `...@win32-x64.vsix` | `62432…1793ecef0` | uploaded (hash unknown to VT) | `{"malicious":0,"suspicious":0,"undetected":64,"harmless":0,"timeout":2,"confirmed-timeout":0,"failure":2,"type-unsupported":7}` |
| `...@darwin-arm64.vsix` | `e939f…f9f72b405` | hash already known to VT (pre-existing report, not one we submitted) | `{"malicious":0,"suspicious":0,"undetected":63,"harmless":0,"timeout":2,"confirmed-timeout":0,"failure":2,"type-unsupported":8}` |

All four: **zero malicious, zero suspicious**, across every engine VirusTotal ran (60–64
detection engines returned a verdict per file; the rest reported timeout or
type-unsupported for this file format, not a miss). Full permalinks:
`https://www.virustotal.com/gui/file/<sha256>` for each hash above.

This covers every binary/non-plaintext component named in transitrix-hq#133 the same way
engine 1 did — the four `.vsix` archives, which contain all 13 named components.

## Prior state — blocked, kept for the record

The task names VirusTotal, Hybrid Analysis, ClamAV or an equivalent as acceptable second
engines. Checked what was available before the 2026-08-11 decision:

- **VirusTotal / MetaDefender / equivalent hosted multi-scanner APIs** all require an API key
  for file submission or even hash lookup (confirmed: no unauthenticated hash-lookup path).
  No such key exists in this repo's Actions secrets (`gh secret list` — `VSCE_PAT`, `OVSX_PAT`,
  `NPM_TOKEN`, `PUBLISH_TOKEN`, certificate/key secrets, no scanner key) or in this session's
  environment.
- **ClamAV** is not installed on this host (`clamscan` / `clamdscan` not on `PATH`).

Acquiring either — signing up for a hosted scanner API, or installing new local scanning
software — is a new external dependency this run is not authorized to add unilaterally
(`CLAUDE.md`'s decision-rights ladder names "new external dependencies" as Valerii's call, not
a reversible-and-mine one). Not working around it by submitting to a scanner that doesn't need
a key but also isn't actually independent verification (e.g. re-running the same local
Defender instance twice) — that would satisfy the letter of "two runs" while producing no
additional evidence.

**What would unblock this:** either a scanner API key added as a repository secret (and
explicit go-ahead to use that external service), or explicit authorization to install ClamAV
(or another local engine) on this host. Whichever Valerii/the coordinator prefers — flagging
the choice rather than picking one.

## Constraints observed

Engine 1 (Defender) is read-only with respect to distribution: scanning is local and
non-mutating (`-DisableRemediation`), nothing left this host. Engine 2 (VirusTotal) does
submit data externally by design — three of the four `.vsix` files were uploaded to
VirusTotal (the fourth's hash was already on file there). All four artefacts are already
public releases (live on Open VSX), so this discloses nothing beyond what anyone can already
download; no source, credential, or non-public material was submitted. No packaging or
publishing workflow was changed, and nothing was published, unpublished, or modified on any
registry.
