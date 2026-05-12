#!/usr/bin/env bash
# check-methodology-pin.sh — Enforce ADR-062: voidforge-build must pin
# voidforge-build-methodology to a concrete semver range (^X.Y.Z, ~X.Y.Z, or exact),
# never to `"*"` or a wildcard. v23.11.1/v23.11.2 shipped with `*` and allowed
# future breaking methodology majors to silently pair with old CLI installs.
#
# Run from CI before `npm publish`. Exits non-zero with a clear message on violation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_JSON="$(cd "$SCRIPT_DIR/.." && pwd)/package.json"

if [ ! -f "$PKG_JSON" ]; then
  echo "check-methodology-pin: $PKG_JSON not found" >&2
  exit 2
fi

RANGE="$(node -e "const p=require('$PKG_JSON'); process.stdout.write((p.dependencies||{})['voidforge-build-methodology']||'')")"

if [ -z "$RANGE" ]; then
  echo "check-methodology-pin: voidforge-build-methodology is not listed as a dependency in $PKG_JSON" >&2
  exit 1
fi

case "$RANGE" in
  '*'|'x'|'latest'|''|'>='*|'>'*)
    echo "check-methodology-pin: FAIL — voidforge-build-methodology range is '$RANGE'." >&2
    echo "  ADR-062 requires a concrete semver range (^X.Y.Z, ~X.Y.Z, or exact)." >&2
    echo "  v23.11.1 and v23.11.2 shipped with '*' and allowed silent cross-major drift." >&2
    echo "  Fix: set the range in $PKG_JSON to ^\$(jq -r .version $PKG_JSON) before publish." >&2
    exit 1
    ;;
esac

echo "check-methodology-pin: OK — voidforge-build-methodology pinned to '$RANGE'."
