# ADR-051: Structural Gate Enforcement (PreToolUse Hook)

## Status
Accepted — 2026-04-20 (Phase 5a validated; Phase 5b live in v23.8.14)

## Empirical Findings (Phase 5a Validation)

Live-tested against Claude Code 4.7 on 2026-04-20:

- **Hooks reload mid-session** when `settings.json` is edited. No fresh session required for wiring changes.
- **`matcher: ".*"` correctly intercepts all tool calls;** `matcher: "Agent"` narrows to Agent calls.
- **`$CLAUDE_SESSION_ID` is NOT injected into hook env.** (Janeway's NAV-002 confirmed.) The session id lives only in stdin JSON.
- **Env vars that ARE populated:** `CLAUDE_CODE_ENTRYPOINT=cli`, `CLAUDE_PROJECT_DIR=<absolute path>`.
- **Stdin JSON fields available:** `session_id` (UUID), `transcript_path`, `cwd`, `permission_mode`, `hook_event_name`, `tool_name`, `tool_input` (object — contains `subagent_type` for Agent calls), `tool_use_id`.
- **Python3 is available** in the hook env on macOS; use it for JSON parsing with graceful fallback.
- Hook scripts using `exit 0` defensively do not block subsequent tool calls even if they hit errors mid-script (no `set -e`).

## Context

The Silver Surfer Gate (ADR-048) has been enforced entirely by prose in `CLAUDE.md` and repeated in every gated command file. Between v23.6.0 and v23.8.12 the gate has been hardened **twelve times** — each iteration adding more emphatic language in response to a specific skip incident:

- v23.6.0 — gate introduced.
- v23.7.1 — "launch as real Agent sub-process, not CLI shell-out."
- v23.7.2 — "explicit Agent tool invocation."
- v23.8.1 — anti-skip hardening in command files.
- v23.8.2 — gate lifted to CLAUDE.md root context after field report #300.
- v23.8.3 — "no cherry-picking from the roster."
- v23.8.4 — "wait for Surfer before starting work."
- v23.8.7 — absolutist language ("NO valid reason").
- v23.8.8 — gate on line 3 of every command.
- v23.8.9 — "Deploy means Agent tool calls, not thinking about agents."
- v23.8.10 — manual override flag introduced as `--ss`.
- v23.8.11 — flag renamed to `--surfer` because `--ss` was being parsed as "skip Surfer."

The failure cadence (approximately one incident per 2 days of active use) is structural evidence that **prompt-only enforcement has a ceiling it cannot break through.** Each iteration closes one rationalization; the model generates a new one.

The `--surfer` flag's own documentation states: *"This flag exists because the automatic gate has failed repeatedly."*

Prose is advisory. It cannot reliably enforce itself against a model that reasons from principle.

## Decision

**Move enforcement from prose instruction to a Claude Code `PreToolUse` hook.**

### Hook mechanism

Add to `.claude/settings.json`:

```json
"PreToolUse": [
  {
    "matcher": "Agent",
    "hooks": [
      { "type": "command", "command": "bash scripts/surfer-gate/check.sh" }
    ]
  }
]
```

The hook fires before any `Agent` tool call and checks session state for evidence that the Silver Surfer has returned a roster this turn.

### Session state

```
/tmp/voidforge-session-${session_id}/
  surfer-roster.json   # written by orchestrator (via record-roster.sh) after Surfer returns
  surfer-bypass.flag   # written by orchestrator (via bypass.sh) when --light or --solo is active
  gate.log             # append-only hook audit trail

/tmp/voidforge-gate/
  pointer-${repo_hash}  # written by check.sh on every fire — maps repo to current session_id
```

`session_id` comes from stdin JSON (empirically confirmed available; NOT from `$CLAUDE_SESSION_ID` env). `repo_hash` is the first 12 chars of `sha256(cwd)` where `cwd` is also from stdin JSON.

### Orchestrator contract

The orchestrator does NOT need to know its own `session_id` directly. Two helper scripts abstract this:

- **`scripts/surfer-gate/record-roster.sh [json]`** — reads the repo-scoped pointer written by `check.sh`, resolves session_id, writes `surfer-roster.json`. Called after Silver Surfer returns.
- **`scripts/surfer-gate/bypass.sh --light|--solo`** — same discovery path, writes `surfer-bypass.flag`. Called when the user's command carries a bypass flag, BEFORE the Surfer launches.

Both helpers are **no-ops when the hook is inactive** (exit 0 silently). The orchestrator calls them unconditionally — correctness with the hook active, harmless without.

### Hook script (`scripts/surfer-gate/check.sh`)

The full script is specified in the implementation plan (Mission 3 of the remediation campaign). Key properties:

- **Fail OPEN on infrastructure errors** — missing python3, unwritable tmp, unset session id → exit 0 (allow). A hook that crashes all Agent calls is worse than a skipped gate.
- **Fail CLOSED on confirmed violation** — state dir accessible, roster file absent, bypass file absent, launching agent is not the Surfer → exit 2 with an instructive error on stderr.
- **Silver Surfer self-launch always passes** — the hook recognizes the Surfer's own Agent call and allows it unconditionally.
- **Bypass flags honored** — if `surfer-bypass.flag` exists, any Agent call passes (user used `--light` or `--solo`).
- **10-minute roster TTL** — stale rosters are deleted and treated as absent (prevents cross-command accidental bypass within a long session).

### Validation requirement before production

Phase 5a complete as of 2026-04-20. See "Empirical Findings" section above. The matcher syntax, hook reload behavior, and stdin JSON contents are all confirmed. No further runtime-discovery work blocks Phase 5b.

### Testing

Offline test harness at `/tmp/test-check-sh.sh` covers 14 scenarios:
- Non-Agent tool pass-through
- Silver Surfer self-launch
- Block when no roster and no bypass
- Allow when roster present
- Allow when bypass present
- Fail-open on malformed JSON
- Fail-open on missing session_id
- Block on stale roster (>10 min)
- Pointer file correctly written by check.sh
- record-roster.sh writes roster file
- After record-roster, Agent allowed
- bypass.sh writes flag file
- After bypass, Agent allowed
- record-roster no-ops when hook inactive

All 14 pass as of commit that ships this ADR's Accepted status.

## Consequences

### Positive
- Closes the 12-commit hardening loop. Prose enforcement's inherent ceiling is bypassed.
- Every skip attempt is now a hook-level `BLOCK` with an audit log entry — violations become visible and countable.
- The CLAUDE.md gate prose can shrink from ~340 tokens to ~180 tokens (Gaal Dornick's rewrite applied).
- Scales to any future gated command by editing one list, not 14 command files.

### Negative
- **Environment dependency.** Hooks are a Claude Code CLI feature. Outside the CLI (Claude.ai web, API-only, IDE extensions without hook support), the hook does not fire and the prose is the only enforcement. Treebeard's long-term warning: do not assume hook support is universal.
- **Session-id drift risk.** `$CLAUDE_SESSION_ID` environment variable availability in hook processes is documented but not contractually guaranteed. Validate on each Claude Code upgrade.
- **Hook maintenance.** One more script to keep working across OS/shell combinations. Mitigation: script is ~60 lines of pure POSIX bash with defensive wrappers; no runtime dependencies beyond `python3` (used only for JSON parsing, with fallback).
- **New failure mode: hook crash.** Mitigated by fail-open-on-infra-error. Counter-risk: hook that always fails open is a no-op. Counter-mitigation: `gate.log` audit trail lets us detect no-op degradation.

### Neutral
- Prose in CLAUDE.md stays as the backstop (per Harah's protocol analysis). One day it may be retired; not this release.

## Alternatives Considered

### Rejected: continue hardening the prose
Twelve iterations have proven insufficient. The `--ss` → `--surfer` rename is the smoking gun — the flag name itself was being misread as permission to skip. No amount of prose can beat a control-flow decision the model owns.

### Rejected: transcript sentinel (orchestrator grep of conversation)
Cleaner than a filesystem sentinel for orchestrator self-enforcement, but invisible to `PreToolUse` hooks. The hook cannot read conversation transcripts. Use as a complement, not a replacement.

### Rejected: mandatory always-on blocking hook (no fail-open)
A blocking hook that crashes halts all Agent tool calls for the session. Unrecoverable without killing the process. Unacceptable for a methodology tool.

### Rejected: native `/agents` integration
Opus 4.7's native `/agents` management does not expose a gate-insertion API. The surface we can control is hooks; we use it.

## Related ADRs

- **ADR-048** — Silver Surfer Herald (defines the gate semantically; this ADR replaces the enforcement mechanism).
- **ADR-050** — Native Coexistence (the renamed `/engage` and `/sentinel` inherit gate enforcement).
- **ADR-056** — Observability Bootstrapping (defines the `surfer-gate-events.jsonl` schema; `gate.log` remains plain text for human-readable per-session debugging).

## Rollout

- **v23.8.13** (shipped): hook scripts staged in `scripts/surfer-gate/`, NOT wired into `settings.json`.
- **v23.8.14** (this release): Phase 5a empirical validation complete. `check.sh` rewritten based on real stdin JSON findings. Helper scripts `record-roster.sh` and `bypass.sh` added. Hook wired into `.claude/settings.json` as opt-out by default. CLAUDE.md orchestrator contract documented.
- **v24.0.0 (future):** prose gate in CLAUDE.md reduced further once hook is proven stable across 2+ minor releases. Campaign-level auto-resume of roster sentinels.
- **v25.0.0 (future):** evaluate whether prose gate can be fully retired — requires zero skip incidents with the hook active.
