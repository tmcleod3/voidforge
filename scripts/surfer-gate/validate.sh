#!/usr/bin/env bash
# validate.sh — Phase 5a PreToolUse hook validation test (ADR-051)
#
# DIAGNOSTIC TOOL ONLY. Dumps what Claude Code pipes to hooks so you can
# verify the runtime behavior before trusting check.sh.
#
# Exits 0 always. Never blocks a tool call.
#
# Empirical findings (2026-04-20, Claude Code 4.7):
#   - Env: CLAUDE_CODE_ENTRYPOINT, CLAUDE_PROJECT_DIR are populated.
#         CLAUDE_SESSION_ID is NOT populated (use stdin JSON instead).
#   - Stdin JSON has: session_id, transcript_path, cwd, permission_mode,
#         hook_event_name, tool_name, tool_input (object), tool_use_id.
#   - Hooks DO reload mid-session when settings.json is edited.

LOG="/tmp/voidforge-hook-validate.log"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

TOOL_INPUT=""
if ! [ -t 0 ]; then
    TOOL_INPUT="$(cat 2>/dev/null || true)"
fi

{
    echo "========== [${TS}] =========="
    echo "--- CLAUDE_* env vars ---"
    env | grep -i "^CLAUDE" | sort || echo "(none)"
    echo "--- stdin JSON (${#TOOL_INPUT} bytes) ---"
    echo "$TOOL_INPUT"
    echo ""
} >> "$LOG" 2>/dev/null || true

exit 0
