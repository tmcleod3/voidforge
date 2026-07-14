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
        # ── Budget-guard lint (field report #405) ────────────────────────────
        # A nested fan-out `parallel(N.map(() => parallel(M.map())))` schedules N×M
        # agents and MUST carry a pre-dispatch cap/triage step, or it breaches the
        # ~1,000-agent runaway cap on a large input (the /gauntlet 516-claim abort).
        # Detect the nested shape (perl slurp, tolerant of newlines) and require a
        # budget-guard token in the same file: a *_BUDGET ceiling, a chunk() batcher,
        # or a deferred[] log. Present → OK; absent → FAIL with the rule cited.
        if perl -0777 -ne 'exit(/parallel\s*\([^;]*\.map\([^;]*=>\s*parallel\s*\(/s ? 0 : 1)' "$f" 2>/dev/null; then
            if grep -qE '_BUDGET|chunk\(|deferred' "$f"; then
                echo "  OK    $(basename "$f")  (nested fan-out + budget guard)"
            else
                echo "  FAIL  $(basename "$f")"
                echo "        nested parallel() fan-out with no budget guard (field report #405)."
                echo "        A parallel(N.map(() => parallel(M.map()))) schedules N×M agents and must"
                echo "        cap/triage before dispatch (a *_BUDGET ceiling, a chunk() batcher, and a"
                echo "        deferred[] log). See WORKFLOWS.md Gotcha 4 for the capped canonical shape."
                FAIL=1
            fi
        else
            echo "  OK    $(basename "$f")"
        fi
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
