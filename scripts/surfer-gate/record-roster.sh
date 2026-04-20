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
REPO_HASH="$(printf '%s' "$PWD" | shasum -a 256 2>/dev/null | cut -c1-12)"
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
printf '%s\n' "${1:-{\"recorded\":true\}}" > "$ROSTER_FILE" 2>/dev/null || {
    echo "[record-roster] could not write $ROSTER_FILE" >&2
    exit 1
}

echo "[record-roster] roster recorded for session $SESSION_ID"
