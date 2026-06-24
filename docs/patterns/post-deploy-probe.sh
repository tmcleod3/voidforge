#!/usr/bin/env bash
# Post-Deploy Probe — Assert sensitive paths are NOT publicly served.
#
# Reference implementation for .claude/commands/deploy.md Step 4.5.
# Probes a denylist of paths against a live deploy URL.
#
# CONTENT-AWARE, NOT STATUS-ONLY (field report #371). A Single-Page App with a
# catch-all route returns HTTP 200 for EVERY path — /.env, /.git/config,
# /id_rsa — by serving index.html. A status-only probe reads those 200s as
# "EXPOSED" and would trigger a ROLLBACK of a clean deploy (false positive),
# while a real leak that happens to 200 looks identical to the shell. So we
# assert on CONTENT and Content-Type, not status alone:
#   - 200 + text/html shell (<!doctype html> / <html)            -> PASS  (SPA fallback)
#   - 200 + non-HTML body (KEY=VALUE, JSON, PEM, "ref:", binary) -> EXPOSED (real leak)
#   - non-200                                                    -> PASS  (not served)
# A real .env leak is text/plain `KEY=VALUE`; a .git/config is an INI `[core]`
# block; an id_rsa is a `-----BEGIN ... PRIVATE KEY-----` PEM. None are HTML.
#
# Evidence: field reports #305 (32-day credential leak), #303 (methodology
# exposure), #371 (SPA catch-all status-only false-positive → would-be rollback).
#
# Usage:
#   DEPLOY_URL=https://example.com bash docs/patterns/post-deploy-probe.sh
#   DEPLOY_URL=https://example.com DEPLOY_PROBE_EXTRA=$'/admin\n/private.key' bash docs/patterns/post-deploy-probe.sh

set -euo pipefail

: "${DEPLOY_URL:?DEPLOY_URL is required (e.g. https://example.com)}"

# Strip trailing slash for clean URL composition.
DEPLOY_URL="${DEPLOY_URL%/}"

TMP="$(mktemp -t postdeploy-probe.XXXXXX)"
BODY="$(mktemp -t postdeploy-body.XXXXXX)"
cleanup() { rm -f "$TMP" "$BODY"; }
trap cleanup EXIT INT TERM

# Fixed denylist — mirrors Step 4.5 in .claude/commands/deploy.md.
DENYLIST=(
  "/.env"
  "/.env.production"
  "/.env.local"
  "/.git/config"
  "/.git/HEAD"
  "/.claude/agents/silver-surfer-herald.md"
  "/docs/methods/FORGE_KEEPER.md"
  "/HOLOCRON.md"
  "/CHANGELOG.md"
  "/VERSION.md"
  "/package.json"
  "/tsconfig.json"
  "/id_rsa"
  "/.ssh/id_rsa"
)

# Optional extensible denylist (newline-separated).
if [[ -n "${DEPLOY_PROBE_EXTRA:-}" ]]; then
  while IFS= read -r extra; do
    [[ -n "$extra" ]] && DENYLIST+=("$extra")
  done <<< "$DEPLOY_PROBE_EXTRA"
fi

# Decide whether a fetched path is a REAL leak vs an SPA HTML fallback.
# Inputs: $1 status, $2 content-type header, body file at $BODY.
# Echoes "leak" or "ok".
classify() {
  local status="$1" ctype="$2"
  # Only a 200 can possibly be a leak; anything else is not served.
  [[ "$status" == "200" ]] || { echo "ok"; return; }

  # Lowercase the content-type for matching.
  local ct; ct="$(printf '%s' "$ctype" | tr '[:upper:]' '[:lower:]')"

  # An HTML response is the SPA catch-all shell, not the sensitive file. PASS.
  if [[ "$ct" == *"text/html"* ]]; then echo "ok"; return; fi
  # Body-sniff fallback when the server omits/mislabels Content-Type: a leading
  # <!doctype html> or <html is the SPA shell.
  if head -c 256 "$BODY" | tr '[:upper:]' '[:lower:]' | grep -qE '<!doctype html|<html'; then
    echo "ok"; return
  fi

  # 200 + non-HTML body = the real file is being served. EXPOSED.
  echo "leak"
}

hits=0
checked=0

for path in "${DENYLIST[@]}"; do
  checked=$((checked + 1))
  url="${DEPLOY_URL}${path}"
  # Capture status + content-type, and the body (capped) for sniffing.
  read -r status ctype < <(
    curl -s -o "$BODY" --max-time 10 \
      -w '%{http_code} %{content_type}\n' "$url" 2>/dev/null || echo "000 -"
  )
  verdict="$(classify "$status" "$ctype")"
  if [[ "$verdict" == "leak" ]]; then
    hits=$((hits + 1))
    printf 'LEAK     %s  %-24s  -> %s\n' "$status" "$ctype" "$url" | tee -a "$TMP" >&2
  else
    printf 'ok       %s  %-24s  -> %s\n' "$status" "$ctype" "$url"
  fi
done

printf '{"action":"post-deploy-probe","url":"%s","checked":%d,"hits":%d,"mode":"content-aware"}\n' \
  "$DEPLOY_URL" "$checked" "$hits"

if (( hits > 0 )); then
  echo "[post-deploy-probe] ${hits} sensitive path(s) served as non-HTML content. Rollback and fix deploy surface." >&2
  exit 1
fi

echo "[post-deploy-probe] clean (SPA HTML fallbacks treated as PASS)"
exit 0
