#!/usr/bin/env bash
# Prepack script for @voidforge/methodology
# Copies methodology files from monorepo root into this package directory for npm publish.
# These copies are gitignored — the source of truth is always the root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"

echo "Prepack: copying methodology files from $REPO_ROOT into $PKG_DIR"

# Copy root-level methodology files
# CLAUDE.md is filtered to strip the template Project section (ADR-058) —
# the section is for monorepo root only; published consumers fill it after init.
sed '/<!-- REMOVE-FOR-NPM-PUBLISH/,/END-REMOVE-FOR-NPM-PUBLISH -->/d' \
    "$REPO_ROOT/CLAUDE.md" > "$PKG_DIR/CLAUDE.md"
cp "$REPO_ROOT/HOLOCRON.md" "$PKG_DIR/HOLOCRON.md"
cp "$REPO_ROOT/VERSION.md" "$PKG_DIR/VERSION.md"
cp "$REPO_ROOT/CHANGELOG.md" "$PKG_DIR/CHANGELOG.md"

# Copy .claude/commands/ and .claude/agents/
rm -rf "$PKG_DIR/.claude"
mkdir -p "$PKG_DIR/.claude/commands" "$PKG_DIR/.claude/agents"
cp "$REPO_ROOT"/.claude/commands/*.md "$PKG_DIR/.claude/commands/"
cp "$REPO_ROOT"/.claude/agents/*.md "$PKG_DIR/.claude/agents/"

# Copy .claude/workflows/ (ADR-067 — re-platformed gauntlet/assemble review scripts).
# Without this, command docs reference .claude/workflows/*.js that don't ship to consumers.
mkdir -p "$PKG_DIR/.claude/workflows"
cp "$REPO_ROOT"/.claude/workflows/*.js "$PKG_DIR/.claude/workflows/" 2>/dev/null || true

# Copy docs/methods/ and docs/patterns/
rm -rf "$PKG_DIR/docs"
mkdir -p "$PKG_DIR/docs/methods" "$PKG_DIR/docs/patterns"
cp "$REPO_ROOT"/docs/methods/*.md "$PKG_DIR/docs/methods/"
# Copy EVERY pattern file regardless of extension. Globbing by .ts/.tsx/.md
# silently dropped the .sh/.py/.conf patterns (post-deploy-probe.sh,
# egress-sandbox.sh, nginx-vhost.conf, rls-test-fixture.py,
# structural-sql-sentinel.py) from the published package — LRN-11 distribution
# gap (field report #382 follow-up). A whole-dir copy ships any future type too.
cp "$REPO_ROOT"/docs/patterns/* "$PKG_DIR/docs/patterns/" 2>/dev/null || true
cp "$REPO_ROOT/docs/NAMING_REGISTRY.md" "$PKG_DIR/docs/NAMING_REGISTRY.md"
cp "$REPO_ROOT/docs/AGENT_CLASSIFICATION.md" "$PKG_DIR/docs/AGENT_CLASSIFICATION.md"

# Copy scripts/thumper/
rm -rf "$PKG_DIR/scripts/thumper"
mkdir -p "$PKG_DIR/scripts/thumper"
cp "$REPO_ROOT"/scripts/thumper/* "$PKG_DIR/scripts/thumper/"

# Copy scripts/surfer-gate/ (ADR-051 enforcement — closes #317 distribution gap).
# Without this, the PreToolUse hook prose in CLAUDE.md cites scripts that don't
# exist in consumer projects, leaving every install on prose-backstop only.
rm -rf "$PKG_DIR/scripts/surfer-gate"
mkdir -p "$PKG_DIR/scripts/surfer-gate"
cp "$REPO_ROOT"/scripts/surfer-gate/* "$PKG_DIR/scripts/surfer-gate/"
chmod +x "$PKG_DIR"/scripts/surfer-gate/*.sh 2>/dev/null || true

# Copy scripts/statusline/ (/contextmeter — context-usage meter + awareness hook).
# Without this the command doc references scripts that don't ship to consumers.
rm -rf "$PKG_DIR/scripts/statusline"
mkdir -p "$PKG_DIR/scripts/statusline"
cp "$REPO_ROOT"/scripts/statusline/* "$PKG_DIR/scripts/statusline/"
chmod +x "$PKG_DIR"/scripts/statusline/*.sh 2>/dev/null || true

echo "Prepack: done. Files ready for npm pack."
