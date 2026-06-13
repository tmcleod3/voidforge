# _paths.sh — Shared state-directory resolver for surfer-gate helpers (ADR-060).
#
# This file is sourced (not executed) by check.sh, record-roster.sh, bypass.sh.
# It exports the gate state directory per the ADR-060 fallback chain:
#
#   1. $XDG_RUNTIME_DIR/voidforge-gate/  — Linux tmpfs, per-user 0700 (systemd)
#   2. $HOME/.voidforge/gate/            — macOS + non-systemd Linux fallback
#   3. Unset — caller must fail-open per ADR-051 philosophy.
#
# Rationale: v23.8.17's /tmp-based state was vulnerable to multi-tenant
# pre-seed attacks (SEC-002). XDG_RUNTIME_DIR is per-user tmpfs; $HOME is
# per-user persistent. Neither is world-writable.
#
# SURFER_GATE_DIR  — root of all gate state
# SURFER_GATE_SESSIONS_DIR — per-session subdirs (sessions/<session_id>/)
# SURFER_GATE_POINTER_DIR  — repo-scoped pointer files (pointer-<hash>)

surfer_gate_resolve_state_dir() {
    if [ -n "${XDG_RUNTIME_DIR:-}" ] && [ -d "$XDG_RUNTIME_DIR" ] && [ -w "$XDG_RUNTIME_DIR" ]; then
        printf '%s/voidforge-gate' "$XDG_RUNTIME_DIR"
    elif [ -n "${HOME:-}" ] && [ -d "$HOME" ] && [ -w "$HOME" ]; then
        printf '%s/.voidforge/gate' "$HOME"
    else
        # Neither resolvable — caller fails open.
        printf ''
    fi
}

SURFER_GATE_DIR="$(surfer_gate_resolve_state_dir)"

if [ -n "$SURFER_GATE_DIR" ]; then
    # Create with 0700 perms to prevent co-tenant access even if umask is lax.
    mkdir -p "$SURFER_GATE_DIR" 2>/dev/null && chmod 0700 "$SURFER_GATE_DIR" 2>/dev/null || true
    SURFER_GATE_SESSIONS_DIR="$SURFER_GATE_DIR/sessions"
    SURFER_GATE_POINTER_DIR="$SURFER_GATE_DIR/pointers"
    mkdir -p "$SURFER_GATE_SESSIONS_DIR" "$SURFER_GATE_POINTER_DIR" 2>/dev/null || true
    chmod 0700 "$SURFER_GATE_SESSIONS_DIR" "$SURFER_GATE_POINTER_DIR" 2>/dev/null || true
else
    SURFER_GATE_SESSIONS_DIR=""
    SURFER_GATE_POINTER_DIR=""
fi

# Per-session directory for a given session_id.
surfer_gate_session_dir() {
    local sid="$1"
    [ -z "$SURFER_GATE_SESSIONS_DIR" ] && return 1
    [ -z "$sid" ] && return 1
    printf '%s/%s' "$SURFER_GATE_SESSIONS_DIR" "$sid"
}

# Stable 12-char hash of a normalized repo path, used as the key for both the
# session pointer and the pending-bypass marker. shasum (Perl) is present on
# macOS but ABSENT on minimal Linux (Alpine etc.), where coreutils sha256sum is
# present instead — without the fallback the gate silently breaks on those hosts
# (the hash comes back empty, pointer/bypass recording no-ops). Try both.
surfer_gate_repo_hash() {
    local repo_path="$1"
    [ -z "$repo_path" ] && return 1
    local normalized="${repo_path%/}"  # strip trailing slash
    local hash
    hash="$(printf '%s' "$normalized" | shasum -a 256 2>/dev/null | cut -c1-12)"
    [ -z "$hash" ] && hash="$(printf '%s' "$normalized" | sha256sum 2>/dev/null | cut -c1-12)"
    [ -z "$hash" ] && return 1
    printf '%s' "$hash"
}

# Repo-scoped pointer file for a given absolute repo path.
# Uses sha256 of normalized path (trailing slash stripped) as the key.
surfer_gate_pointer_file() {
    local repo_path="$1"
    [ -z "$SURFER_GATE_POINTER_DIR" ] && return 1
    local hash; hash="$(surfer_gate_repo_hash "$repo_path")" || return 1
    [ -z "$hash" ] && return 1
    printf '%s/pointer-%s' "$SURFER_GATE_POINTER_DIR" "$hash"
}

# Repo-scoped PENDING-bypass marker. bypass.sh writes this when no session
# pointer exists yet (the orchestrator runs bypass.sh BEFORE the first
# Agent/Workflow call, per CLAUDE.md, but check.sh only creates the pointer on
# that first fire). check.sh promotes it to the session bypass flag on the first
# fire, then deletes it. Lives at the gate root, not under sessions/, so the
# stale-session reaper never touches it.
surfer_gate_pending_bypass_file() {
    local repo_path="$1"
    [ -z "$SURFER_GATE_DIR" ] && return 1
    local hash; hash="$(surfer_gate_repo_hash "$repo_path")" || return 1
    [ -z "$hash" ] && return 1
    printf '%s/pending-bypass-%s' "$SURFER_GATE_DIR" "$hash"
}

# Reap stale session dirs. Called opportunistically by check.sh.
surfer_gate_reap_stale_sessions() {
    [ -z "$SURFER_GATE_SESSIONS_DIR" ] && return 0
    [ ! -d "$SURFER_GATE_SESSIONS_DIR" ] && return 0
    # -mindepth 1 is REQUIRED, not optional: `find DIR -maxdepth 1 -type d` matches DIR
    # itself at depth 0, so without it a stale sessions/ root mtime makes this sweep
    # `rm -rf` the ENTIRE tree — wiping every live session's roster + bypass flag, not
    # just stale children. The threshold (+120m) is kept STRICTLY GREATER than the roster
    # TTL (3600s/60m, check.sh) and the dir mtime is refreshed on every activity
    # (check.sh touches $SESSION_DIR, not just $ROSTER_FILE) so an active session is never
    # reaped while its roster/bypass is still valid (the reap-vs-fresh-roster/bypass race).
    find "$SURFER_GATE_SESSIONS_DIR" -mindepth 1 -maxdepth 1 -type d -mmin +120 -exec rm -rf {} + 2>/dev/null || true
}
