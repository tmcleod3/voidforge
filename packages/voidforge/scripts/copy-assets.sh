#!/usr/bin/env bash
# copy-assets.sh — Copy non-TS runtime assets into dist/ after tsc compilation.
# tsc only compiles .ts files. These are needed at runtime by the wizard server.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$PACKAGE_DIR/../.." && pwd)"
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

# Methodology files — needed by project creation (api/project.ts uses SCAFFOLD_DIR)
# SCAFFOLD_DIR resolves to dist/ in the npm package, so methodology must be here.
if [ -f "$REPO_ROOT/CLAUDE.md" ]; then
  cp "$REPO_ROOT/CLAUDE.md" "$DIST/CLAUDE.md"
  cp "$REPO_ROOT/HOLOCRON.md" "$DIST/HOLOCRON.md" 2>/dev/null || true
  cp "$REPO_ROOT/VERSION.md" "$DIST/VERSION.md" 2>/dev/null || true
  cp "$REPO_ROOT/CHANGELOG.md" "$DIST/CHANGELOG.md" 2>/dev/null || true
  echo "copy-assets: root methodology files → dist/"
fi

if [ -d "$REPO_ROOT/.claude/commands" ]; then
  mkdir -p "$DIST/.claude/commands"
  cp "$REPO_ROOT"/.claude/commands/*.md "$DIST/.claude/commands/"
  echo "copy-assets: .claude/commands/ → dist/ ($(ls "$DIST/.claude/commands/" | wc -l | tr -d ' ') files)"
fi

if [ -d "$REPO_ROOT/.claude/agents" ]; then
  mkdir -p "$DIST/.claude/agents"
  cp "$REPO_ROOT"/.claude/agents/*.md "$DIST/.claude/agents/"
  echo "copy-assets: .claude/agents/ → dist/ ($(ls "$DIST/.claude/agents/" | wc -l | tr -d ' ') files)"
fi

if [ -d "$REPO_ROOT/docs/methods" ]; then
  mkdir -p "$DIST/docs/methods"
  cp "$REPO_ROOT"/docs/methods/*.md "$DIST/docs/methods/"
  echo "copy-assets: docs/methods/ → dist/docs/methods/"
fi

if [ -d "$REPO_ROOT/docs/patterns" ]; then
  mkdir -p "$DIST/docs/patterns"
  cp "$REPO_ROOT"/docs/patterns/*.ts "$DIST/docs/patterns/" 2>/dev/null || true
  cp "$REPO_ROOT"/docs/patterns/*.tsx "$DIST/docs/patterns/" 2>/dev/null || true
  cp "$REPO_ROOT"/docs/patterns/*.md "$DIST/docs/patterns/" 2>/dev/null || true
  echo "copy-assets: docs/patterns/ → dist/docs/patterns/"
fi

if [ -f "$REPO_ROOT/docs/NAMING_REGISTRY.md" ]; then
  cp "$REPO_ROOT/docs/NAMING_REGISTRY.md" "$DIST/docs/NAMING_REGISTRY.md"
fi

if [ -f "$REPO_ROOT/.gitignore" ]; then
  cp "$REPO_ROOT/.gitignore" "$DIST/.gitignore"
fi

if [ -d "$REPO_ROOT/scripts/thumper" ]; then
  mkdir -p "$DIST/scripts/thumper"
  cp "$REPO_ROOT"/scripts/thumper/* "$DIST/scripts/thumper/"
  echo "copy-assets: scripts/thumper/ → dist/"
fi

echo "copy-assets: done."
