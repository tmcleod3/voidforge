#!/usr/bin/env bash
# bypass.sh — Orchestrator helper for ADR-051 Silver Surfer Gate.
#
# Called by the orchestrator when the user's command includes --light or
# --solo. Writes a session-scoped bypass flag that check.sh will honor,
# allowing subsequent Agent tool calls to proceed without a Surfer roster.
#
# Usage:
#   bash scripts/surfer-gate/bypass.sh --light
#   bash scripts/surfer-gate/bypass.sh --solo
#
# Exit codes:
#   0 = bypass recorded, or hook not active (no-op)
#   1 = something went wrong

set -uo pipefail

FLAG="${1:-unspecified}"

REPO_PATH="${CLAUDE_PROJECT_DIR:-$PWD}"
REPO_HASH="$(printf '%s' "$REPO_PATH" | shasum -a 256 2>/dev/null | cut -c1-12)"
if [ -z "$REPO_HASH" ]; then
    exit 0
fi

# Validate flag — only --light and --solo are documented bypass values.
case "$FLAG" in
    --light|--solo) ;;
    *)
        echo "[bypass] warning: unknown flag '$FLAG' — documented values are --light and --solo. Proceeding anyway (fail-open philosophy)." >&2
        ;;
esac

POINTER="/tmp/voidforge-gate/pointer-${REPO_HASH}"
if [ ! -f "$POINTER" ]; then
    # Hook not active — gate already passes. No-op.
    exit 0
fi

SESSION_ID="$(cat "$POINTER" 2>/dev/null)"
if [ -z "$SESSION_ID" ]; then
    exit 0
fi

SESSION_DIR="/tmp/voidforge-session-${SESSION_ID}"
BYPASS_FILE="$SESSION_DIR/surfer-bypass.flag"

mkdir -p "$SESSION_DIR" 2>/dev/null || exit 1
printf '%s\n' "$FLAG" > "$BYPASS_FILE" 2>/dev/null || exit 1

echo "[bypass] flag $FLAG recorded for session $SESSION_ID"
