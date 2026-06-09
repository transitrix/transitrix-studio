# run-studio-agent.ps1
# Unattended Claude Code run for the Transitrix Studio project agent.
# Pulls its tasks from the strategy hub, does the work, opens PRs (never merges),
# and externalises any questions to GitHub issues (because nobody is at the keyboard).
#
# Reconstructed 2026-06-07 from the dsm/swarm runner template (the canonical
# launcher was missing from the repo root while its siblings were present).
# Mirrors run-dsm-agent.ps1 exactly, with STUDIO config values. If a real
# launcher exists elsewhere on this machine, reconcile the two and keep one.
#
# -- ONE-TIME SETUP (once, interactively, before scheduling) -------------------
#   1. claude         # log in once so creds are cached, then exit
#   2. gh auth login  # authenticate the GitHub CLI once
#   Schedule it hidden + non-interactive (see register command) so a closed
#   console can never send Ctrl+C and kill the run.
# -----------------------------------------------------------------------------

$ErrorActionPreference = "Stop"

# -- Per-agent configuration ---------------------------------------------------
$AgentName = "STUDIO"
$RepoPath  = "C:\GitHub\transitrix-studio"
$ProjLabel = "proj:transitrix-studio"
# -----------------------------------------------------------------------------

$LogDir  = Join-Path $RepoPath ".archive\agent-runs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
$LogFile = Join-Path $LogDir ("$($AgentName.ToLower())-agent-{0:yyyy-MM-dd-HHmmss}.log" -f (Get-Date))

Set-Location $RepoPath
# Self-heal: drop any stale git lock, then start each run from a clean, up-to-date main
# (so a failed/interrupted previous run can't leave junk or the wrong base branch).
if (Test-Path '.git\index.lock') { Remove-Item '.git\index.lock' -Force -ErrorAction SilentlyContinue }
# git writes normal status (e.g. "Reset branch 'main'") to stderr; under
# $ErrorActionPreference='Stop' that aborts the script even though git succeeds.
# Run the prep with Continue and gate on the real exit codes instead.
$ErrorActionPreference = 'Continue'
git fetch origin --quiet 2>$null
$gitFetchExit = $LASTEXITCODE
git checkout -f -B main origin/main 2>$null
$gitCheckoutExit = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($gitFetchExit -ne 0 -or $gitCheckoutExit -ne 0) {
    throw "git prep failed (fetch=$gitFetchExit checkout=$gitCheckoutExit)"
}

$Prompt = @"
You are the Transitrix $AgentName project agent, running UNATTENDED on a schedule.
There is no human at the keyboard - never wait for interactive input.

Working repo: $RepoPath (you are already in it).

1. Orient: read ./CLAUDE.md here, and STRATEGY.md in C:\GitHub\strategy.
   Then read your bus inbox at ./.archive/agent-bus/inbox.md - act on any
   answer/relay entries dated after your previous run - this is how the orchestrator
   replies to your questions and relays facts from sibling agents (local-only file).
2. Pull YOUR open tasks only:
     gh issue list -R vkgeorgia/strategy --label $ProjLabel --state open
   Read only $ProjLabel issues. Do NOT read or cross-reference issues with
   other proj:* labels, nor kind:proposal-to-strategy / kind:status-report.
3. Pick the single highest-priority task whose dependencies are satisfied
   (respect 'Do first' and 'Depends on #NNN' notes; skip blocked ones).
   SKIP any task already waiting on Valerii's merge: if an open PR already exists
   for it (check 'gh pr list --state open') or a previous run already left a
   PR-link comment on the issue, do NOT redo it - move to the next actionable task.
   If there is no actionable task, do nothing and exit - do not invent work.
4. Read the full issue (gh issue view <N> -R vkgeorgia/strategy), decompose it
   yourself, and do the work on a NEW feature branch in this repo.
5. Before opening a PR: run the repo's documented checks (build / linters / unit
   tests per ./CLAUDE.md) and re-read the tail of every file you wrote.
6. Open a PR. DO NOT MERGE - Valerii gates every merge. Never run 'gh pr merge',
   never force-push, never use --no-verify, never edit canon in the strategy repo,
   never put client names in anything committed.
7. Report back: gh issue comment <N> -R vkgeorgia/strategy with the PR link.
   Close the issue only if fully done; otherwise leave it open.

BEFORE YOU ASK ANYTHING: first check whether the answer is already determined by canon -
./CLAUDE.md, plus STRATEGY.md / STRATEGIC_CONTEXT.md in C:\GitHub\strategy, the notation
specs in C:\GitHub\methodology\notations\, NOTATIONS_VALIDATION.md, and repo conventions.
If canon settles it, follow canon and do NOT ask.

IF YOU ARE BLOCKED, UNSURE, OR A DECISION IS NEEDED (and canon does NOT settle it):
   Do not stall and do not guess. Write your question to your bus OUTBOX - append an
   entry to ./.archive/agent-bus/outbox.md (format is in that file) with
   enough context to answer, referencing the hub issue. Then set the signal label:
     gh issue edit <N> -R vkgeorgia/strategy --add-label needs:answer
   The label is the SIGNAL; your outbox carries the TEXT. The orchestrator reads your
   question from the outbox and replies in your inbox; you pick it up next run.
   Leave the issue open. If it is a cross-cutting / strategic question (architecture
   fork, scope, public-release gate, cross-project impact), open a new issue with:
     gh issue create -R vkgeorgia/strategy --label kind:proposal-to-strategy ...
   Then STOP. The orchestrator auto-answers questions that canon settles (with a
   citation) and routes facts/status between agents; anything needing judgement
   Valerii answers from his digest. You pick up the reply on your next scheduled run.

Scope discipline: one concern per PR. If the work spills outside the task's stated
scope, stop and split it into a new task issue instead.
"@

# --allowedTools pre-grants permissions so the run never pauses on a prompt.
# --max-turns caps runaway loops. Output goes straight to the log file (no console,
# so a closed window can't kill the run).
# Run the agent, retrying on transient API overload / 5xx.
# claude -p prints "API Error: 5xx" / "Overloaded" and exits non-zero on these.
$maxAttempts = 3
# Logging hardened 2026-06-06: header OUTSIDE the redirect so every run leaves a breadcrumb;
# each attempt captures to a temp file, records exit + bytes, then appends - a 0-byte log is no
# longer ambiguous. (A per-attempt timeout wrapper was tried and REVERTED 2026-06-06: it failed
#  under Task Scheduler. Hang protection now relies on the task's 1h ExecutionTimeLimit.)
"[runner] START $AgentName $(Get-Date -Format o)" | Out-File -FilePath $LogFile -Encoding utf8
$claudeExit = $null
$succeeded = $false
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
  $AttemptLog = "$LogFile.attempt$attempt"
  claude -p "$Prompt" `
    --allowedTools "Bash Read Grep Glob Edit Write" `
    --max-turns 60 `
    --output-format text *> $AttemptLog
  $claudeExit = $LASTEXITCODE
  $bytes = (Get-Item -LiteralPath $AttemptLog -ErrorAction SilentlyContinue).Length
  $transient = Select-String -Path $AttemptLog -Pattern 'API Error: 5\d\d|Overloaded|overloaded_error|Service Unavailable' -Quiet
  Add-Content -Path $LogFile -Value "[runner] attempt $attempt/${maxAttempts}: claude exit=$claudeExit, $bytes bytes captured" -Encoding utf8
  if (-not $bytes) {
    Add-Content -Path $LogFile -Value "[runner] WARNING: claude produced NO output this attempt (exit=$claudeExit) - likely killed/interrupted (machine sleep, missed/overlapping schedule) or a no-op with an empty result. Not a silent success." -Encoding utf8
  }
  Get-Content -LiteralPath $AttemptLog -ErrorAction SilentlyContinue | Add-Content -Path $LogFile -Encoding utf8
  Remove-Item -LiteralPath $AttemptLog -Force -ErrorAction SilentlyContinue
  if ($claudeExit -eq 0 -and -not $transient -and $bytes -gt 0) {
    $succeeded = $true
    break
  }
  if ($attempt -lt $maxAttempts) {
    if ($transient -or -not $bytes) {
      $delaySec = 30 * $attempt   # 30s, then 60s
      $reason = if ($transient) { "transient API failure" } else { "empty output (exit=$claudeExit)" }
      Add-Content -Path $LogFile -Value "[runner] $reason on attempt $attempt/$maxAttempts; retrying in ${delaySec}s..." -Encoding utf8
      Start-Sleep -Seconds $delaySec
    } else {
      Add-Content -Path $LogFile -Value "[runner] non-transient failure (exit=$claudeExit) on attempt $attempt/$maxAttempts; not retrying." -Encoding utf8
      break
    }
  } else {
    Add-Content -Path $LogFile -Value "[runner] gave up after $maxAttempts attempts (exit=$claudeExit)." -Encoding utf8
  }
}
$finalExit = if ($succeeded) { 0 } elseif ($null -ne $claudeExit -and $claudeExit -ne 0) { $claudeExit } else { 1 }
"[runner] END $AgentName $(Get-Date -Format o) exit=$finalExit succeeded=$succeeded" | Add-Content -Path $LogFile -Encoding utf8

Write-Output "$AgentName agent run finished $(Get-Date -Format o); log: $LogFile; exit=$finalExit"
exit $finalExit
