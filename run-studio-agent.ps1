# run-studio-agent.ps1 — RELOCATED (2026-06-12)
#
# The canonical launcher (which embeds the full unattended-agent prompt) now
# lives in the PRIVATE strategy hub and is intentionally NOT published here:
#   C:\GitHub\strategy\win-claude\runners\run-studio-agent.ps1
#
# It was moved out of this public repo to stop the agent prompt being
# world-readable. This file is only a thin forwarder so that a Task Scheduler
# task still pointing at this path keeps working until it is repointed at the
# private copy. Once every \Transitrix\ task points at the private launcher,
# this shim can be deleted (it is gitignored, so it will not come back).

$ErrorActionPreference = "Stop"
$canonical = "C:\GitHub\strategy\win-claude\runners\run-studio-agent.ps1"
if (Test-Path $canonical) {
    & $canonical @args
    exit $LASTEXITCODE
}
Write-Error "Canonical Studio launcher not found at $canonical. It now lives in the private strategy hub (win-claude/runners/)."
exit 1
