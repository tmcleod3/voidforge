#!/bin/bash
# water-rings.sh — The Water Rings — Chani's stop hook
# Sends task completion signals to Telegram when Claude Code finishes
# "Among the Fremen, water rings record the dead — and the debts of the living."
#
# The Stop hook receives metadata JSON on stdin with a transcript_path field.
# We read the transcript file (JSONL) to extract the last assistant message.
#
# Note: -e (errexit) intentionally omitted — this hook must never fail
# with a non-zero exit that could affect Claude Code's operation.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CONFIG_DIR="$PROJECT_ROOT/.voidforge/thumper"
CONFIG_FILE="$CONFIG_DIR/sietch.env"
CHANNEL_FLAG="$CONFIG_DIR/.thumper.active"

# Silent exit if not configured or channel closed
[ -f "$CONFIG_FILE" ] || exit 0
[ -f "$CHANNEL_FLAG" ] || exit 0

source "$CONFIG_FILE"
[ "${SETUP_COMPLETE:-}" = "true" ] || exit 0

# Read stop hook metadata from stdin (contains transcript_path)
HOOK_INPUT=""
if ! [ -t 0 ]; then
    HOOK_INPUT=$(perl -e 'alarm 5; local $/; print <STDIN>' 2>/dev/null || head -c 65536 2>/dev/null || echo "")
fi

# Extract transcript_path from the hook metadata
TRANSCRIPT_PATH=""
if [ -n "$HOOK_INPUT" ] && command -v python3 >/dev/null 2>&1; then
    TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('transcript_path', ''))
except Exception:
    pass
" 2>/dev/null)
elif [ -n "$HOOK_INPUT" ] && command -v jq >/dev/null 2>&1; then
    TRANSCRIPT_PATH=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null)
fi

# Extract last assistant message from the transcript (JSONL format)
extract_from_transcript() {
    local path="$1"
    [ -z "$path" ] && return
    [ -f "$path" ] || return

    if command -v python3 >/dev/null 2>&1; then
        python3 -c "
import sys, json

last_text = ''
try:
    with open(sys.argv[1], 'r') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            role = entry.get('role', '')
            if role != 'assistant':
                continue

            content = entry.get('message', entry.get('content', ''))
            if isinstance(content, dict):
                content = content.get('content', '')

            if isinstance(content, list):
                text = ' '.join(
                    block.get('text', '')
                    for block in content
                    if isinstance(block, dict) and block.get('type') == 'text'
                )
            elif isinstance(content, str):
                text = content
            else:
                continue

            if text.strip():
                last_text = text.strip()

except Exception:
    pass

if last_text:
    if len(last_text) > 3600:
        last_text = last_text[:3600] + '\n\n[...truncated]'
    print(last_text)
" "$path" 2>/dev/null
    elif command -v jq >/dev/null 2>&1; then
        # JSONL: each line is a separate JSON object
        tail -50 "$path" | \
            jq -r 'select(.role == "assistant") | .message.content // .content | if type == "array" then [.[] | select(.type == "text") | .text] | join(" ") else tostring end' 2>/dev/null | \
            tail -1 | head -c 3600
    fi
}

MESSAGE=$(extract_from_transcript "$TRANSCRIPT_PATH")

if [ -n "$MESSAGE" ]; then
    NOTIFICATION="$(printf '✅ Task complete\n\n%s\n\n─────────────────\n📡 Reply to continue' "$MESSAGE")"
else
    NOTIFICATION="$(printf '✅ Claude Code finished — no summary available.\n\n─────────────────\n📡 Reply to continue')"
fi

_send_notification() {
    local api_base="https://api.telegram.org/bot${BOT_TOKEN}"
    # Try with Markdown first, fall back to plain text
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$NOTIFICATION" \
        -d parse_mode="Markdown" \
        "${api_base}/sendMessage" >/dev/null 2>&1 || \
    curl -s --connect-timeout 5 --max-time 10 \
        -X POST \
        -d chat_id="$CHAT_ID" \
        --data-urlencode text="$NOTIFICATION" \
        "${api_base}/sendMessage" >/dev/null 2>&1 || true
}

_send_notification &

exit 0
