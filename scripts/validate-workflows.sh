#!/usr/bin/env bash
# validate-workflows.sh — syntax gate for .claude/workflows/*.workflow.js (ADR-067).
#
# These scripts run INSIDE the Workflow tool runtime, which wraps the file body in an
# async function and injects phase()/parallel()/pipeline()/agent()/log()/budget/workflow
# as locals. That is precisely why they legitimately use top-level `await` and `return`
# alongside `export const meta` — a combination a BARE `node --check` rejects with
# "Illegal return statement". So a naive `node --check` is NOT a valid gate, and the
# pre-v23.19.0 CHANGELOG/VERSION claim that the scripts "pass node --check" was inaccurate.
#
# This validator reproduces the runtime's shape: strip the `export` keyword and wrap the
# body in an async function, THEN `node --check`. A real syntax error in a workflow script
# now fails CI instead of shipping to npm undetected (the #297 "referenced-but-unvalidated"
# class, applied to the workflow scripts).
#
# Run: bash scripts/validate-workflows.sh   (exit 0 = all OK, 1 = a script is broken)

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="$ROOT/.claude/workflows"

[ -d "$DIR" ] || { echo "validate-workflows: no $DIR — nothing to check."; exit 0; }

shopt -s nullglob
FILES=("$DIR"/*.workflow.js)
shopt -u nullglob
if [ ${#FILES[@]} -eq 0 ]; then
    echo "validate-workflows: no *.workflow.js found — nothing to check."
    exit 0
fi

FAIL=0
for f in "${FILES[@]}"; do
    tmpd="$(mktemp -d)"
    tmp="$tmpd/wf.cjs"
    err="$tmpd/err.txt"
    {
        echo '(async function __wf_validate__(args, phase, parallel, pipeline, agent, log, budget, workflow) {'
        # Strip a leading `export ` so module-level `export const meta` is valid inside the
        # wrapper function; everything else (top-level await/return) is now in-function.
        sed -E 's/^export (const|let|var|function|async|class) /\1 /' "$f"
        echo '})'
    } > "$tmp"
    if node --check "$tmp" 2>"$err"; then
        echo "  OK    $(basename "$f")"
    else
        echo "  FAIL  $(basename "$f")"
        sed 's/^/        /' "$err"
        FAIL=1
    fi
    rm -rf "$tmpd"
done

if [ "$FAIL" -ne 0 ]; then
    echo "validate-workflows: at least one workflow script has a syntax error."
    exit 1
fi
echo "validate-workflows: all workflow scripts OK (${#FILES[@]} checked)."
