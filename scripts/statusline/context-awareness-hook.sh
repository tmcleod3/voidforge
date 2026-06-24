#!/usr/bin/env bash
# context-awareness-hook.sh — UserPromptSubmit hook that injects context-budget
# awareness INTO Claude's own context as the window fills.
#
# The status-line meter is for the human; this hook is for the model. Claude
# cannot see its own remaining context directly, so each turn (once usage crosses
# a threshold) this prints a JSON object whose `hookSpecificOutput.additionalContext`
# Claude receives — "you have ~X% left, checkpoint soon." Below the threshold it is
# silent, so it adds zero noise until it matters.
#
# Cadence: Claude Code has no time/turn-interval hooks — UserPromptSubmit (once per
# user turn) is the finest cadence available, which is exactly when fresh awareness
# is useful. Threshold-gated so it behaves like a periodic warning that only speaks
# near the limit.
#
# Requires jq; without it, no-op (exit 0). A hook must never break the turn.
#
# Env knobs:
#   VOIDFORGE_CONTEXT_WINDOW    denominator (default 200000; auto-bumps to 1000000 when usage exceeds 200k)
#   VOIDFORGE_CONTEXT_WARN_PCT  start warning at this % used (default 80)
#   VOIDFORGE_CONTEXT_CRIT_PCT  escalate to "checkpoint NOW" at this % (default 92)
set -uo pipefail

input="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0

transcript="$(printf '%s' "$input" | jq -r '.transcript_path // empty' 2>/dev/null)"
[ -n "$transcript" ] && [ -f "$transcript" ] || exit 0

usage="$(tail -n 400 "$transcript" | jq -c 'select(.message.usage != null) | .message.usage' 2>/dev/null | tail -1)"
[ -n "$usage" ] || exit 0
used="$(printf '%s' "$usage" | jq -r '((.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0))' 2>/dev/null)"
used="${used%%.*}"
[ -n "${used:-}" ] || exit 0

if [ "$used" -gt 200000 ] 2>/dev/null; then window=1000000; else window="${VOIDFORGE_CONTEXT_WINDOW:-200000}"; fi
[ "${window:-0}" -gt 0 ] 2>/dev/null || exit 0
pct=$(( used * 100 / window ))

warn="${VOIDFORGE_CONTEXT_WARN_PCT:-80}"
crit="${VOIDFORGE_CONTEXT_CRIT_PCT:-92}"
[ "$pct" -lt "$warn" ] && exit 0

rem_k=$(( (window - used) / 1000 ))

if [ "$pct" -ge "$crit" ]; then
  msg="⚠️ CONTEXT CRITICAL: ~${pct}% of the ${window}-token window is used (~${rem_k}k left). Compaction is imminent — checkpoint NOW: run /vault (or /seal) to preserve session state before the context is summarized, and prefer finishing the current sub-task over starting new work."
else
  msg="Context monitor: ~${pct}% of the ${window}-token window is used (~${rem_k}k left). You are approaching the limit — wrap up open loops and consider /vault or /seal to checkpoint before compaction."
fi

jq -cn --arg m "$msg" '{hookSpecificOutput:{hookEventName:"UserPromptSubmit",additionalContext:$m}}'
exit 0
