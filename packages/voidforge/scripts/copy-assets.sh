#!/usr/bin/env bash
# copy-assets.sh — Copy non-TS runtime assets into dist/ after tsc compilation.
# tsc only compiles .ts files. These are needed at runtime by the wizard server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST="$PACKAGE_DIR/dist"

# UI files (HTML, CSS, JS, SVG — served by wizard/server.js)
if [ -d "$PACKAGE_DIR/wizard/ui" ]; then
  mkdir -p "$DIST/wizard/ui"
  cp -r "$PACKAGE_DIR/wizard/ui/"* "$DIST/wizard/ui/"
  echo "copy-assets: wizard/ui/ → dist/wizard/ui/ ($(ls "$DIST/wizard/ui/" | wc -l | tr -d ' ') files)"
fi

# Config files loaded at runtime
if [ -f "$PACKAGE_DIR/wizard/danger-room.config.json" ]; then
  cp "$PACKAGE_DIR/wizard/danger-room.config.json" "$DIST/wizard/danger-room.config.json"
  echo "copy-assets: danger-room.config.json → dist/"
fi

echo "copy-assets: done."
