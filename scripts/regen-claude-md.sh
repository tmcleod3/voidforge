#!/usr/bin/env bash
# regen-claude-md.sh — Regenerate the generated stack block in CLAUDE.md (field report #342 F-2)
#
# Rewrites the clearly-delimited GENERATED block in CLAUDE.md from a
# machine-readable truth source, so the block is reproducible and drift is
# impossible: re-run, diff, commit. The hand-written prose around the block is
# never touched — only the bytes between the sentinels are replaced.
#
# Truth source precedence (first hit wins):
#   1. docs/_truth.yml         — canonical project status file (framework:,
#                                language:, tests:, production_version:/version:)
#   2. package.json + git      — derive version (root version → first workspace
#                                version → latest `vX.Y.Z` git tag) and infer
#                                framework/language from dependencies.
#
# Sentinel contract (matches docs/methods/RELEASE_MANAGER.md, field report #342 F-2):
#   <!-- BEGIN GENERATED: stack (do not edit by hand — run scripts/regen-claude-md.sh) -->
#   ...generated lines...
#   <!-- END GENERATED: stack -->
#
# A bare placeholder marker on its own line is upgraded into a full block the
# first time the helper runs (so an authored CLAUDE.md can opt in cheaply):
#   <!-- AUTO:STACK -->            (or)   <!-- BEGIN GENERATED: stack -->
#
# Behavior:
#   - Block present  → its body is replaced from the truth source.
#   - Placeholder    → expanded into a full BEGIN/END block.
#   - Neither block nor placeholder, and no actionable truth → exit 0 with an
#     informational message. This is the normal case for a fresh scaffold; it
#     is NOT an error.
#   - Idempotent: running twice in a row yields a byte-identical file.
#
# Intended integration points:
#   - /git (Coulson) on every MINOR/MAJOR bump — regenerate, then diff.
#   - .husky/pre-commit — fail if the block is stale (run with --check).
#
# Usage:
#   bash scripts/regen-claude-md.sh                 # rewrite in place
#   bash scripts/regen-claude-md.sh --check         # exit 1 if block is stale, no write
#   bash scripts/regen-claude-md.sh --file path.md  # operate on a different target
#
# Exit codes:
#   0 = block regenerated / already current / nothing to do (no source, no marker)
#   1 = --check found the block stale, or an unexpected I/O failure occurred
#   2 = bad arguments

set -uo pipefail

# ---------------------------------------------------------------------------
# Paths and arguments
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET="$REPO_ROOT/CLAUDE.md"
CHECK_ONLY=0

while [ "$#" -gt 0 ]; do
    case "$1" in
        --check)
            CHECK_ONLY=1
            shift
            ;;
        --file)
            if [ "$#" -lt 2 ]; then
                echo "[regen-claude-md] --file requires a path argument" >&2
                exit 2
            fi
            TARGET="$2"
            shift 2
            ;;
        -h|--help)
            sed -n '2,40p' "$0"
            exit 0
            ;;
        *)
            echo "[regen-claude-md] unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

TRUTH_FILE="$REPO_ROOT/docs/_truth.yml"

BEGIN_SENTINEL='<!-- BEGIN GENERATED: stack (do not edit by hand — run scripts/regen-claude-md.sh) -->'
END_SENTINEL='<!-- END GENERATED: stack -->'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# yaml_scalar <file> <key> — extract a top-level `key: value` scalar from a
# flat YAML file. Strips inline comments and surrounding quotes/whitespace.
# Returns empty string if the key is absent. Deliberately minimal (no nesting)
# so we depend on nothing beyond grep/sed — _truth.yml is a flat status file.
yaml_scalar() {
    _f="$1"; _k="$2"
    [ -f "$_f" ] || { printf ''; return 0; }
    grep -E "^[[:space:]]*${_k}[[:space:]]*:" "$_f" 2>/dev/null \
        | head -n1 \
        | sed -E "s/^[[:space:]]*${_k}[[:space:]]*:[[:space:]]*//" \
        | sed -E 's/[[:space:]]+#.*$//' \
        | sed -E 's/^"(.*)"$/\1/' \
        | sed -E "s/^'(.*)'\$/\1/" \
        | sed -E 's/[[:space:]]*$//'
}

# json_scalar <file> <key> — extract a top-level "key": "value" or "key": N
# string/number from a JSON file. jq if available, else a grep/sed fallback
# that is good enough for the shallow fields we read (name, version).
json_scalar() {
    _f="$1"; _k="$2"
    [ -f "$_f" ] || { printf ''; return 0; }
    if command -v jq >/dev/null 2>&1; then
        jq -r --arg k "$_k" 'if has($k) then .[$k] else empty end' "$_f" 2>/dev/null
        return 0
    fi
    grep -E "\"${_k}\"[[:space:]]*:" "$_f" 2>/dev/null \
        | head -n1 \
        | sed -E "s/.*\"${_k}\"[[:space:]]*:[[:space:]]*//" \
        | sed -E 's/^"([^"]*)".*/\1/' \
        | sed -E 's/[[:space:]]*,?[[:space:]]*$//' \
        | sed -E 's/^"(.*)"$/\1/'
}

# json_has_dep <file> <dep-name> — true if dep-name appears as a key under
# dependencies or devDependencies. Used to infer the framework.
json_has_dep() {
    _f="$1"; _d="$2"
    [ -f "$_f" ] || return 1
    if command -v jq >/dev/null 2>&1; then
        jq -e --arg d "$_d" \
            '((.dependencies // {}) + (.devDependencies // {})) | has($d)' \
            "$_f" >/dev/null 2>&1
        return $?
    fi
    grep -qE "\"${_d}\"[[:space:]]*:" "$_f" 2>/dev/null
}

# derive_version — best-effort project version from package.json or git.
derive_version() {
    _v="$(json_scalar "$REPO_ROOT/package.json" version)"
    if [ -z "$_v" ] || [ "$_v" = "null" ]; then
        # Root is often a private monorepo with no version — try a workspace.
        for _pkg in "$REPO_ROOT"/packages/*/package.json; do
            [ -f "$_pkg" ] || continue
            _v="$(json_scalar "$_pkg" version)"
            [ -n "$_v" ] && [ "$_v" != "null" ] && break
        done
    fi
    if [ -z "$_v" ] || [ "$_v" = "null" ]; then
        # Last resort: most recent vX.Y.Z tag, stripped of the leading 'v'.
        _v="$(git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null \
            | sed -E 's/^v//')"
    fi
    printf '%s' "$_v"
}

# derive_framework — infer the framework from root or workspace package.json
# dependencies. Returns a human-readable label or empty string.
derive_framework() {
    for _pkg in "$REPO_ROOT/package.json" "$REPO_ROOT"/packages/*/package.json; do
        [ -f "$_pkg" ] || continue
        if json_has_dep "$_pkg" next; then printf 'Next.js'; return 0; fi
        if json_has_dep "$_pkg" nuxt; then printf 'Nuxt'; return 0; fi
        if json_has_dep "$_pkg" "@remix-run/react"; then printf 'Remix'; return 0; fi
        if json_has_dep "$_pkg" "@sveltejs/kit"; then printf 'SvelteKit'; return 0; fi
        if json_has_dep "$_pkg" express; then printf 'Express'; return 0; fi
        if json_has_dep "$_pkg" fastify; then printf 'Fastify'; return 0; fi
        if json_has_dep "$_pkg" react; then printf 'React'; return 0; fi
        if json_has_dep "$_pkg" vue; then printf 'Vue'; return 0; fi
    done
    printf ''
}

# derive_language — TypeScript if a tsconfig or the typescript dep exists,
# else JavaScript if a package.json exists, else empty.
derive_language() {
    if [ -f "$REPO_ROOT/tsconfig.json" ] \
        || json_has_dep "$REPO_ROOT/package.json" typescript; then
        printf 'TypeScript'
        return 0
    fi
    for _pkg in "$REPO_ROOT"/packages/*/package.json; do
        [ -f "$_pkg" ] || continue
        if json_has_dep "$_pkg" typescript; then printf 'TypeScript'; return 0; fi
    done
    [ -f "$REPO_ROOT/package.json" ] && { printf 'JavaScript'; return 0; }
    printf ''
}

# ---------------------------------------------------------------------------
# Build the generated body from the truth source
# ---------------------------------------------------------------------------
# Each line is "Label\tValue"; emitted as "- **Label:** Value". We collect into
# a newline-delimited string (bash 3.2 — no associative arrays).
build_body() {
    _framework=""; _language=""; _tests=""; _version=""

    if [ -f "$TRUTH_FILE" ]; then
        _framework="$(yaml_scalar "$TRUTH_FILE" framework)"
        _language="$(yaml_scalar "$TRUTH_FILE" language)"
        _tests="$(yaml_scalar "$TRUTH_FILE" tests)"
        _version="$(yaml_scalar "$TRUTH_FILE" production_version)"
        [ -z "$_version" ] && _version="$(yaml_scalar "$TRUTH_FILE" version)"
    fi

    # Fill any gap the truth file left from package.json + git.
    [ -z "$_framework" ] && _framework="$(derive_framework)"
    [ -z "$_language" ] && _language="$(derive_language)"
    [ -z "$_version" ] && _version="$(derive_version)"

    # Assemble the lines, then print once with no trailing newline so the
    # caller controls spacing around the block.
    _lines=""
    [ -n "$_framework" ] && _lines="${_lines}- **Framework:** ${_framework}
"
    [ -n "$_language" ] && _lines="${_lines}- **Language:** ${_language}
"
    [ -n "$_tests" ] && _lines="${_lines}- **Tests:** ${_tests}
"
    [ -n "$_version" ] && _lines="${_lines}- **Version:** ${_version}
"

    # Drop the single trailing newline (command substitution strips it anyway,
    # but be explicit so the function is correct in isolation).
    printf '%s' "${_lines%
}"
}

# generated_body — thin wrapper kept for call-site readability.
generated_body() {
    build_body
}

# ---------------------------------------------------------------------------
# Detect what's in the target file
# ---------------------------------------------------------------------------
if [ ! -f "$TARGET" ]; then
    echo "[regen-claude-md] target not found: $TARGET — nothing to do." >&2
    exit 0
fi

HAS_BLOCK=0
HAS_PLACEHOLDER=0
PLACEHOLDER_LINE=""

if grep -qF "$END_SENTINEL" "$TARGET" 2>/dev/null \
    && grep -qF "BEGIN GENERATED: stack" "$TARGET" 2>/dev/null; then
    HAS_BLOCK=1
fi

if [ "$HAS_BLOCK" -eq 0 ]; then
    # A bare placeholder, on its own line, that we can expand into a block.
    for _marker in '<!-- AUTO:STACK -->' '<!-- BEGIN GENERATED: stack -->' '<!-- stack block: fill me in -->'; do
        if grep -qxF "$_marker" "$TARGET" 2>/dev/null; then
            HAS_PLACEHOLDER=1
            PLACEHOLDER_LINE="$_marker"
            break
        fi
    done
fi

# ---------------------------------------------------------------------------
# No block, no placeholder → normal no-op (NOT an error)
# ---------------------------------------------------------------------------
if [ "$HAS_BLOCK" -eq 0 ] && [ "$HAS_PLACEHOLDER" -eq 0 ]; then
    echo "[regen-claude-md] $(basename "$TARGET") has no generated stack block and no placeholder marker."
    echo "[regen-claude-md] Nothing to regenerate. To opt in, add a line containing exactly:"
    echo "                  <!-- AUTO:STACK -->"
    echo "[regen-claude-md] (this is the normal state for a fresh scaffold — not an error)."
    exit 0
fi

# ---------------------------------------------------------------------------
# Compose the desired block
# ---------------------------------------------------------------------------
BODY="$(generated_body)"
if [ -z "$BODY" ]; then
    # We have a block/placeholder but no truth to fill it. Emit a single honest
    # line rather than a placeholder — derived, never promissory.
    BODY="- **Stack:** (no truth source — add docs/_truth.yml or a package.json)"
fi

# DESIRED is the full sentinel-wrapped block.
DESIRED="$(printf '%s\n%s\n%s\n' "$BEGIN_SENTINEL" "$BODY" "$END_SENTINEL")"

# ---------------------------------------------------------------------------
# Rewrite the file: replace existing block, or expand the placeholder.
# Use awk so the surrounding bytes are preserved exactly.
#
# The desired block is multi-line, so we pass it to awk through a temp FILE and
# slurp it with getline — never through `awk -v`. BSD awk (the default on macOS)
# rejects a literal newline inside a `-v` assignment ("newline in string"),
# which would abort the program and leave an empty $TMP — truncating CLAUDE.md
# to zero bytes. Reading the block from a file is portable across BSD and GNU
# awk and keeps the substitution byte-exact (field report #342 F-2).
# ---------------------------------------------------------------------------
TMP="$(mktemp "${TMPDIR:-/tmp}/regen-claude-md.XXXXXX")" || {
    echo "[regen-claude-md] could not create temp file" >&2
    exit 1
}
BLOCK_FILE="$(mktemp "${TMPDIR:-/tmp}/regen-claude-md-block.XXXXXX")" || {
    echo "[regen-claude-md] could not create temp file" >&2
    rm -f "$TMP"
    exit 1
}
trap 'rm -f "$TMP" "$BLOCK_FILE"' EXIT

# Materialize the desired block (no trailing newline — slurp_block re-adds the
# line structure exactly as written).
printf '%s' "$DESIRED" > "$BLOCK_FILE"

if [ "$HAS_BLOCK" -eq 1 ]; then
    awk -v blockfile="$BLOCK_FILE" '
        function slurp_block(   line, out, first) {
            out = ""; first = 1
            while ((getline line < blockfile) > 0) {
                if (first) { out = line; first = 0 }
                else       { out = out "\n" line }
            }
            close(blockfile)
            return out
        }
        BEGIN { desired = slurp_block(); inblock = 0; printed = 0 }
        index($0, "BEGIN GENERATED: stack") > 0 {
            if (!printed) { print desired; printed = 1 }
            inblock = 1
            next
        }
        inblock == 1 {
            if (index($0, "END GENERATED: stack") > 0) { inblock = 0 }
            next
        }
        { print }
    ' "$TARGET" > "$TMP"
else
    # Expand the placeholder line in place.
    awk -v marker="$PLACEHOLDER_LINE" -v blockfile="$BLOCK_FILE" '
        function slurp_block(   line, out, first) {
            out = ""; first = 1
            while ((getline line < blockfile) > 0) {
                if (first) { out = line; first = 0 }
                else       { out = out "\n" line }
            }
            close(blockfile)
            return out
        }
        BEGIN { desired = slurp_block() }
        $0 == marker { print desired; next }
        { print }
    ' "$TARGET" > "$TMP"
fi

# ---------------------------------------------------------------------------
# --check mode: report staleness, never write.
# ---------------------------------------------------------------------------
if [ "$CHECK_ONLY" -eq 1 ]; then
    if cmp -s "$TARGET" "$TMP"; then
        echo "[regen-claude-md] OK: stack block is current."
        exit 0
    fi
    echo "[regen-claude-md] STALE: stack block does not match the truth source." >&2
    echo "[regen-claude-md] Run: bash scripts/regen-claude-md.sh" >&2
    exit 1
fi

# ---------------------------------------------------------------------------
# Write only if changed (idempotent — a no-op re-run touches nothing).
# ---------------------------------------------------------------------------
if cmp -s "$TARGET" "$TMP"; then
    echo "[regen-claude-md] stack block already current — no change."
    exit 0
fi

cat "$TMP" > "$TARGET" || {
    echo "[regen-claude-md] ERROR: failed to write $TARGET" >&2
    exit 1
}
echo "[regen-claude-md] regenerated stack block in $(basename "$TARGET")."
exit 0
