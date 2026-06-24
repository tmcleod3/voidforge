#!/usr/bin/env bash
# bypass.sh — Orchestrator helper for --light / --solo bypass (ADR-051 + ADR-060).
#
# Writes a session-scoped bypass flag that check.sh honors. Fail-closed on
# unknown flag values (SEC-003 fix) — only --light and --solo are valid.
#
# Usage:
#   bash scripts/surfer-gate/bypass.sh --light
#   bash scripts/surfer-gate/bypass.sh --solo
#
# Exit codes:
#   0 = bypass recorded, or hook inactive (no-op)
#   2 = rejected: unknown flag value (SEC-003 fail-closed)

set -uo pipefail

FLAG="${1:-}"

# SEC-003: validate BEFORE touching state. Unknown flags are rejected with a
# clear error and no bypass file is written. This closes the prompt-injection
# path where `bash bypass.sh --anything` would silently produce a bypass.
case "$FLAG" in
    --light|--solo) ;;  # valid — continue
    "")
        echo "[bypass] usage: bypass.sh --light | --solo" >&2
        exit 2
        ;;
    *)
        echo "[bypass] ERROR: unknown flag '$FLAG'. Only --light and --solo are valid." >&2
        exit 2
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=_paths.sh
. "$SCRIPT_DIR/_paths.sh" 2>/dev/null || exit 0

REPO_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
REPO_PATH="${REPO_PATH%/}"  # normalize trailing slash (BE-002)

if [ -z "$SURFER_GATE_DIR" ]; then
    exit 0
fi

POINTER_FILE="$(surfer_gate_pointer_file "$REPO_PATH")"
if [ -z "$POINTER_FILE" ] || [ ! -f "$POINTER_FILE" ]; then
    # No session pointer yet. The orchestrator (per CLAUDE.md) runs bypass.sh BEFORE the
    # first Agent/Workflow call, but check.sh only creates the pointer on that first fire,
    # so there is no session to flag yet. Record a repo-scoped PENDING bypass that check.sh
    # promotes to the real session flag on the first fire. Without this, `bypass.sh --light`
    # run first was a silent no-op and the first launch still blocked (A5/field report).
    PENDING_BYPASS="$(surfer_gate_pending_bypass_file "$REPO_PATH" 2>/dev/null || true)"
    if [ -n "$PENDING_BYPASS" ]; then
        if ( umask 077; printf '%s\n' "$FLAG" > "$PENDING_BYPASS" ) 2>/dev/null; then
            echo "[bypass] no active session yet — recorded PENDING $FLAG (applies on next launch)"
        else
            echo "[bypass] hook not active and could not record pending bypass — no-op." >&2
        fi
    else
        echo "[bypass] hook not active — no-op." >&2
    fi
    exit 0
fi

SESSION_ID="$(cat "$POINTER_FILE" 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

# Stale-pointer self-repair (#384 RC-3). The repo pointer can name a DEAD session
# — a prior /clear'ed or crashed session whose dir still lingers. Writing the
# bypass flag into that dead dir leaves the LIVE session blocked: the documented
# bug (CLAUDE.md "Known gate bug — stale session pointer") whose only workaround
# was to re-run bypass.sh after the first blocked check.sh fire repointed the
# pointer. We can now do better: Claude Code exports the live session id to tool
# calls as CLAUDE_CODE_SESSION_ID — the SAME id it passes the PreToolUse hook as
# session_id (verified: it equals the live transcript's basename). When it is
# available and disagrees with the pointer, the pointer is stale — trust the env
# var, repoint the pointer to the live session, and flag THAT dir, so the bypass
# lands correctly on the first try with no operator re-run. On older CLIs that do
# not export the var, LIVE_SID is empty and we fall back to the pointer as before.
LIVE_SID="${CLAUDE_CODE_SESSION_ID:-}"
if [ -n "$LIVE_SID" ] && [ "$LIVE_SID" != "$SESSION_ID" ]; then
    if printf '%s\n' "$LIVE_SID" > "$POINTER_FILE" 2>/dev/null; then
        chmod 0600 "$POINTER_FILE" 2>/dev/null || true
        echo "[bypass] stale session pointer ($SESSION_ID) repaired → live session $LIVE_SID"
        SESSION_ID="$LIVE_SID"
    fi
fi

SESSION_DIR="$(surfer_gate_session_dir "$SESSION_ID")"
[ -z "$SESSION_DIR" ] && exit 0

BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"

mkdir -p "$SESSION_DIR" 2>/dev/null && chmod 0700 "$SESSION_DIR" 2>/dev/null || exit 0
printf '%s\n' "$FLAG" > "$BYPASS_FILE" 2>/dev/null && chmod 0600 "$BYPASS_FILE" 2>/dev/null || exit 0
# Bump the session DIR mtime: the reaper keys on dir mtime and writing the flag file
# alone does not refresh it, so a freshly-bypassed-but-stale session dir could be reaped
# out from under the very next launch (A2/the reap-vs-bypass race).
touch "$SESSION_DIR" 2>/dev/null || true

echo "[bypass] flag $FLAG recorded for session $SESSION_ID"
