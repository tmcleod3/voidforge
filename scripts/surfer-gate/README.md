# Silver Surfer Gate — Hook Enforcement

Implementation of ADR-051 Phase 5b (live as of v23.8.14).

A `PreToolUse` hook intercepts Agent tool calls and blocks sub-agent launches until the Silver Surfer has returned a roster for the current session, unless a bypass flag is set.

## Files

- **`check.sh`** — **The gate.** Runs on every Agent tool call via `PreToolUse` hook. Allows Silver Surfer self-launch unconditionally; allows other agents only when a roster has been recorded or a bypass flag is present. Fails open on infrastructure errors.
- **`record-roster.sh`** — **Orchestrator helper.** Call after Silver Surfer returns to record the roster. Discovers current session_id via the pointer file that `check.sh` writes. No-op when the hook is inactive.
- **`bypass.sh`** — **Orchestrator helper.** Call when user's command includes `--light` or `--solo`, BEFORE launching any agents. No-op when the hook is inactive.
- **`validate.sh`** — Diagnostic-only logger. Dumps stdin JSON + env to `/tmp/voidforge-hook-validate.log` for debugging hook behavior.
- **`settings-snippet.json`** — Reference JSON for the production hook entry (and the validation diagnostic entry). The production entry is already live in `.claude/settings.json`.

## State layout

```
/tmp/voidforge-gate/
  pointer-<repo_hash>          # maps this repo's hook fires to current session_id

/tmp/voidforge-session-<session_id>/
  surfer-roster.json            # presence + freshness = "roster recorded, allow agents"
  surfer-bypass.flag            # presence = "--light/--solo active, allow agents"
  gate.log                      # append-only audit trail
```

`session_id` is the UUID parsed from each hook invocation's stdin JSON. `repo_hash` is `sha256(cwd)[:12]`.

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
    -> writes /tmp/voidforge-session-<sid>/surfer-roster.json
  orchestrator launches each rostered agent (Agent tool calls)
    -> check.sh fires, sees fresh roster, exits 0 (allow)
  synthesis, done
```

## Flow when user passes `--light`

```
user types /engage --light
  orchestrator runs: bash scripts/surfer-gate/bypass.sh --light
    -> may initially no-op if no pointer yet (common case — no prior Agent calls)
    -> orchestrator's hardcoded first agent fires the hook which writes the pointer
    -> orchestrator retries bypass.sh if needed (or bypass.sh is called before any Agent)
  orchestrator launches hardcoded roster without the Surfer
    -> check.sh sees bypass flag (if set) OR blocks (if flag missing)
```

Note: there is an ordering constraint with `--light`. The cleanest protocol is for the orchestrator to launch the Surfer FIRST (even in `--light` mode the Surfer's self-launch is always allowed), IGNORE its output, run `bypass.sh`, then proceed with the hardcoded roster. Future: let `--light` skip the Surfer entirely and just call `bypass.sh` first — which works if `bypass.sh` writes to a repo-scoped fallback path when the pointer isn't yet established.

## Failure modes

| Scenario | Behavior |
|----------|----------|
| `python3` not installed | Fail open (exit 0 — allow) |
| `/tmp` unwritable | Fail open |
| stdin JSON malformed | Fail open |
| `session_id` missing from stdin | Fail open |
| Roster file older than 10 min | Treated as absent — block unless Surfer / bypass |
| Hook itself crashes | Claude Code reports non-zero; user sees error, can disable hook |

## Phase 5a validation findings (empirical, 2026-04-20)

See ADR-051 for the full list. Key discoveries:
- `$CLAUDE_SESSION_ID` is NOT populated — use stdin JSON's `session_id` instead.
- `CLAUDE_PROJECT_DIR` IS populated and points at the repo root.
- Hooks reload mid-session when `settings.json` is edited.
- Stdin JSON contains everything needed (session_id, tool_name, tool_input, cwd, transcript_path).

## Disabling

To turn off the hook, remove or comment out the `PreToolUse` block in `.claude/settings.json`. The CLAUDE.md prose gate remains as a human-readable fallback.
