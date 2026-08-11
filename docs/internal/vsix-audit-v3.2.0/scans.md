# v3.2.0 third-party scan — partial, blocked on a second independent engine

Task: transitrix-hq#135 · Epic: transitrix-hq#130. Uses the artefacts from transitrix-hq#132
and the binary-component list from transitrix-hq#133.

**This task is not complete.** One independent engine's verdicts are recorded below; the
task's own acceptance criteria require at least two. Leaving transitrix-hq#135 open rather
than closing on partial coverage.

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

## Blocked: second independent engine

The task names VirusTotal, Hybrid Analysis, ClamAV or an equivalent as acceptable second
engines. Checked what's available in this unattended run:

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

Read-only with respect to distribution: scanning is local and non-mutating
(`-DisableRemediation`); nothing was submitted to any external service, so no additional data
about these artefacts left this host. No packaging or publishing workflow was changed.
