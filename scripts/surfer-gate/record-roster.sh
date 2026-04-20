#!/usr/bin/env bash
# record-roster.sh — Orchestrator helper for ADR-051 Silver Surfer Gate.
#
# Called by the orchestrator AFTER the Silver Surfer sub-agent returns its
# roster, BEFORE launching any further Agent tool calls.
#
# Discovers the current session_id via a pointer file that check.sh writes
# on every hook invocation. Writes a session-scoped sentinel that check.sh
# will recognize as "roster has been returned — allow further Agent calls."
#
# Usage:
#   bash scripts/surfer-gate/record-roster.sh               # minimal — marks roster received
#   bash scripts/surfer-gate/record-roster.sh "<json>"      # optional — include roster content for audit
#
# Exit codes:
#   0 = roster recorded, or hook not active (no-op; orchestrator keeps going)
#   1 = something went wrong but the orchestrator should not abort

set -uo pipefail

# Locate the session pointer that check.sh writes on every hook fire.
# Prefer $CLAUDE_PROJECT_DIR (injected by Claude Code into hook/command env) —
# check.sh hashes stdin's `cwd`, which equals $CLAUDE_PROJECT_DIR in practice.
# Fall back to $PWD if the env var isn't set (e.g., run manually from terminal).
REPO_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
REPO_HASH="$(printf '%s' "$REPO_PATH" | shasum -a 256 2>/dev/null | cut -c1-12)"
if [ -z "$REPO_HASH" ]; then
    echo "[record-roster] shasum unavailable — cannot compute repo hash. No-op." >&2
    exit 0
fi

POINTER="/tmp/voidforge-gate/pointer-${REPO_HASH}"
if [ ! -f "$POINTER" ]; then
    # No pointer means the PreToolUse hook isn't active. That's fine —
    # this helper is a no-op when the gate isn't enforcing. The Silver
    # Surfer Gate prose in CLAUDE.md remains the backstop.
    echo "[record-roster] no session pointer at $POINTER — hook not active. No-op." >&2
    exit 0
fi

SESSION_ID="$(cat "$POINTER" 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
    echo "[record-roster] session pointer empty — no-op." >&2
    exit 0
fi

SESSION_DIR="/tmp/voidforge-session-${SESSION_ID}"
ROSTER_FILE="$SESSION_DIR/surfer-roster.json"

mkdir -p "$SESSION_DIR" 2>/dev/null || {
    echo "[record-roster] could not create $SESSION_DIR" >&2
    exit 1
}

# Write whatever the orchestrator passed (or a minimal sentinel).
# Use printf to construct the default without shell-escape artifacts — avoids the
# prior `{\"recorded\":true\}` expansion that wrote a literal backslash on some
# shells. Do NOT strip backslashes from orchestrator-supplied $1, which may
# contain legitimate JSON escapes (\u0041, \", etc.).
if [ "$#" -ge 1 ]; then
    ROSTER_CONTENT="$1"
else
    ROSTER_CONTENT='{"recorded":true}'
fi
printf '%s\n' "$ROSTER_CONTENT" > "$ROSTER_FILE" 2>/dev/null || {
    echo "[record-roster] could not write $ROSTER_FILE" >&2
    exit 1
}

# Emit a structured ROSTER_RECEIVED event to the gate-events JSONL stream (ADR-056).
# Non-fatal: any emit failure is swallowed.
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
SAFE_ROSTER="$(printf '%s' "$ROSTER_CONTENT" | tr -d '\n' | sed 's/\\/\\\\/g; s/"/\\"/g')"
JSONL_LINE="$(printf '{"ts":"%s","session_id":"%s","event":"ROSTER_RECEIVED","roster_json":"%s"}' \
    "$TS" "$SESSION_ID" "$SAFE_ROSTER")"

# Session-scoped
printf '%s\n' "$JSONL_LINE" >> "$SESSION_DIR/surfer-gate-events.jsonl" 2>/dev/null || true
# Repo-persistent (use $REPO_PATH — set earlier from $CLAUDE_PROJECT_DIR — not
# bare $PWD, so the JSONL lands in the correct repo even when the orchestrator
# calls this helper from a subdirectory).
# Create logs/ if missing to avoid silent drops — BE-005.
mkdir -p "$REPO_PATH/logs" 2>/dev/null && \
    printf '%s\n' "$JSONL_LINE" >> "$REPO_PATH/logs/surfer-gate-events.jsonl" 2>/dev/null || true

echo "[record-roster] roster recorded for session $SESSION_ID"
