# Silver Surfer Gate — Hook Enforcement

Implementation of ADR-051 Phase 5b (live as of v23.8.14).

A `PreToolUse` hook intercepts **Agent and Workflow** tool calls (ADR-064 — workflow-spawned sub-agents are invisible to the per-Agent matcher, so the Workflow *launch* is gated too) and blocks them until the Silver Surfer has returned a roster for the current session, unless a bypass flag is set.

## Files

- **`check.sh`** — **The gate.** Runs on every Agent tool call via `PreToolUse` hook. Allows Silver Surfer self-launch unconditionally; allows other agents only when a roster has been recorded or a bypass flag is present. Fails open on infrastructure errors.
- **`record-roster.sh`** — **Orchestrator helper.** Call after Silver Surfer returns to record the roster. Discovers current session_id via the pointer file that `check.sh` writes. No-op when the hook is inactive.
- **`bypass.sh`** — **Orchestrator helper.** Call when the user's command includes `--light` or `--solo`, BEFORE launching any agents. If no session pointer exists yet (the common pre-first-fire case) it records a repo-scoped *pending* bypass that `check.sh` promotes on the first fire — so running it first is no longer a silent no-op. Fails closed (exit 2) on any flag other than `--light`/`--solo` (SEC-003).
- **`validate.sh`** — Diagnostic-only logger. Dumps stdin JSON + env to `/tmp/voidforge-hook-validate.log` for debugging hook behavior.
- **`settings-snippet.json`** — Reference JSON for the production hook entry (and the validation diagnostic entry). The production entry is already live in `.claude/settings.json`.

## State layout (ADR-060)

State lives under a per-user `0700` root — `$XDG_RUNTIME_DIR/voidforge-gate/` on systemd
Linux, else `$HOME/.voidforge/gate/` (macOS + non-systemd). The old world-writable
`/tmp/voidforge-*` layout was retired in v23.8.18 (SEC-002 pre-seed attack).

```
<gate-root>/                              # $XDG_RUNTIME_DIR/voidforge-gate or $HOME/.voidforge/gate
  pointers/
    pointer-<repo_hash>                   # maps this repo's hook fires to current session_id
  pending-bypass-<repo_hash>              # repo-scoped --light/--solo intent set BEFORE the
                                          #   first hook fire; promoted to the session flag, then removed
  sessions/<session_id>/
    surfer-roster.json                    # presence + freshness (TTL 3600s) = "roster recorded, allow"
    surfer-bypass.flag                    # presence = "--light/--solo active, allow agents"
    gate.log                              # append-only plain-text audit trail
    surfer-gate-events.jsonl              # structured JSONL audit (ADR-056)
```

`session_id` is the UUID parsed from each hook invocation's stdin JSON. `repo_hash` is
`sha256(cwd)[:12]` (via `shasum`, falling back to `sha256sum` on minimal Linux).

## Flow for a gated command

```
user types /engage
  orchestrator launches Silver Surfer (Agent tool)
    -> check.sh fires
    -> parses session_id from stdin JSON
    -> writes pointer file for this repo
    -> recognizes Silver Surfer self-launch, exits 0 (allow)
  Silver Surfer returns a roster
  orchestrator runs: bash scripts/surfer-gate/record-roster.sh
    -> reads pointer file, resolves session_id
    -> writes <gate-root>/sessions/<sid>/surfer-roster.json
  orchestrator launches each rostered agent (Agent tool calls)
    -> check.sh fires, sees fresh roster, exits 0 (allow)
  synthesis, done
```

## Flow when user passes `--light`

```
user types /engage --light
  orchestrator runs: bash scripts/surfer-gate/bypass.sh --light
    -> no pointer yet -> records a repo-scoped PENDING bypass (pending-bypass-<repo_hash>)
  orchestrator launches hardcoded roster without the Surfer
    -> check.sh fires, writes the pointer, PROMOTES the pending bypass to the session flag, allows
```

The ordering constraint is now resolved: `bypass.sh` run first (the documented order) records a
repo-scoped pending marker that `check.sh` promotes on the first fire, so `--light`/`--solo` can
skip the Surfer entirely without the first launch blocking. (Previously running `bypass.sh` before
any Agent call was a silent no-op; the cleanest workaround was to launch-and-ignore the Surfer first.)

## Failure modes

| Scenario | Behavior |
|----------|----------|
| `python3` not installed | Fail open (exit 0 — allow) |
| gate root (`$XDG_RUNTIME_DIR`/`$HOME`) unresolvable or unwritable | Fail open |
| stdin JSON malformed | Fail open |
| `session_id` missing from stdin | Fail open |
| Roster file older than the TTL (3600s / 60 min, #360) | Treated as absent — block unless Surfer / bypass |
| Hook itself crashes | Claude Code reports non-zero; user sees error, can disable hook |

## Phase 5a validation findings (empirical, 2026-04-20)

See ADR-051 for the full list. Key discoveries:
- `$CLAUDE_SESSION_ID` is NOT populated — use stdin JSON's `session_id` instead.
- `CLAUDE_PROJECT_DIR` IS populated and points at the repo root.
- Hooks reload mid-session when `settings.json` is edited.
- Stdin JSON contains everything needed (session_id, tool_name, tool_input, cwd, transcript_path).

## Disabling

To turn off the hook, remove or comment out the `PreToolUse` block in `.claude/settings.json`. The CLAUDE.md prose gate remains as a human-readable fallback.
