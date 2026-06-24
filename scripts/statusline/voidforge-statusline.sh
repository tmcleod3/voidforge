#!/usr/bin/env bash
# voidforge-statusline.sh — Context-usage meter for the Claude Code status line.
#
# Reads the status-line JSON on stdin and prints ONE line:
#   <model>  ⟦████████░░⟧ 78% ctx · 44k left
# The meter is colored green → yellow → red as the context window fills.
#
# Source of truth: the native `.context_window` object Claude Code pipes to the
# status line (`used_percentage`, `context_window_size`). When that field is
# absent (older Claude Code), it falls back to deriving usage from the most
# recent assistant `message.usage` in `.transcript_path`.
#
# Requires jq. Without jq it prints a minimal line and exits 0 — a status line
# must NEVER hard-fail (that would blank the bar).
#
# Env knobs (shared with the awareness hook so colors and warnings stay in lockstep):
#   VOIDFORGE_CONTEXT_WINDOW    denominator when the size field is absent (default 200000)
#   VOIDFORGE_CONTEXT_WARN_PCT  meter turns yellow at this % used (default 80)
#   VOIDFORGE_CONTEXT_CRIT_PCT  meter turns red at this % used (default 92)
set -uo pipefail

input="$(cat 2>/dev/null || true)"

if ! command -v jq >/dev/null 2>&1; then
  printf 'VoidForge · ctx meter needs jq (brew install jq)\n'
  exit 0
fi

j() { printf '%s' "$input" | jq -r "$1" 2>/dev/null; }

model="$(j '.model.display_name // .model.id // "Claude"')"
pct="$(j '.context_window.used_percentage // empty')"
window="$(j '.context_window.context_window_size // empty')"

# Fallback: derive from the transcript when the native field is absent.
if [ -z "$pct" ]; then
  transcript="$(j '.transcript_path // empty')"
  if [ -n "$transcript" ] && [ -f "$transcript" ]; then
    usage="$(tail -n 400 "$transcript" | jq -c 'select(.message.usage != null) | .message.usage' 2>/dev/null | tail -1)"
    if [ -n "$usage" ]; then
      used="$(printf '%s' "$usage" | jq -r '((.input_tokens//0)+(.cache_read_input_tokens//0)+(.cache_creation_input_tokens//0))' 2>/dev/null)"
      used="${used%%.*}"
      if [ -z "$window" ]; then
        if [ "${used:-0}" -gt 200000 ] 2>/dev/null; then window=1000000; else window="${VOIDFORGE_CONTEXT_WINDOW:-200000}"; fi
      fi
      if [ -n "${used:-}" ] && [ "${window:-0}" -gt 0 ] 2>/dev/null; then
        pct=$(( used * 100 / window ))
      fi
    fi
  fi
fi

# Coerce to integer; bail to model-only if we still have nothing.
pct="${pct%%.*}"
if [ -z "$pct" ]; then
  printf '%s\n' "$model"
  exit 0
fi
[ -z "$window" ] && window="${VOIDFORGE_CONTEXT_WINDOW:-200000}"
window="${window%%.*}"

[ "$pct" -lt 0 ] 2>/dev/null && pct=0
[ "$pct" -gt 100 ] 2>/dev/null && pct=100

remaining=$(( window - window * pct / 100 ))
if [ "$remaining" -ge 1000 ]; then rem_h="$(( remaining / 1000 ))k"; else rem_h="${remaining}"; fi

# Color band — defaults align with the awareness-hook thresholds (warn 80 → yellow,
# crit 92 → red) so the meter turns red exactly when the hook goes critical. Both
# honor the same env vars, so retuning one retunes the other.
yellow_at="${VOIDFORGE_CONTEXT_WARN_PCT:-80}"
red_at="${VOIDFORGE_CONTEXT_CRIT_PCT:-92}"
if   [ "$pct" -ge "$red_at" ];    then color=$'\033[31m'   # red    — checkpoint now
elif [ "$pct" -ge "$yellow_at" ]; then color=$'\033[33m'   # yellow — getting full
else                                   color=$'\033[32m'   # green  — healthy
fi
reset=$'\033[0m'
dim=$'\033[2m'

# 10-cell meter, rounded.
filled=$(( (pct + 5) / 10 ))
[ "$filled" -gt 10 ] && filled=10
[ "$filled" -lt 0 ] && filled=0
bar=""
i=0
while [ "$i" -lt 10 ]; do
  if [ "$i" -lt "$filled" ]; then bar="${bar}█"; else bar="${bar}░"; fi
  i=$(( i + 1 ))
done

printf '%s %s⟦%s⟧ %d%%%s %sctx · %s left%s\n' "$model" "$color" "$bar" "$pct" "$reset" "$dim" "$rem_h" "$reset"
