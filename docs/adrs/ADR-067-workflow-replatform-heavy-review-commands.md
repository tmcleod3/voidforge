# ADR-067: Re-platform heavy review commands onto Dynamic Workflows

## Status: Accepted — 2026-06-13 (gauntlet.workflow.js + assemble-review.workflow.js written + syntax/API-validated; live end-to-end run is the acceptance test)

## Context

`/gauntlet` (self-described 60–80 agent launches across 5 rounds) and `/assemble`'s review-heavy phases hand-fan sub-agents via the Agent tool, keeping **every intermediate findings table in the lead's context** — the exact "more agents than one conversation can coordinate" case the Dynamic Workflow tool exists for. **ADR-064** closed the gate↔Workflow bypass (the precondition: workflow launches are now gated), so re-platforming no longer routes around ADR-051.

## Decision

Express the deterministic skeletons as canonical Workflow scripts under **`.claude/workflows/`**:

- **`gauntlet.workflow.js`** — discovery (parallel core leads) → **JS dedupe** → **3-lens adversarial REFUTE** per distinct claim (schema-validated CONFIRM votes, default-to-refuted, keep ≥2/3, verify-the-FIX) → crossfire (adversaries hunt NEW issues) → council (JS synthesis by severity). Returns a confirmed-findings report; refuted claims logged, never silently dropped.
- **`assemble-review.workflow.js`** — the review-heavy `/assemble` phases (engage + sentinel + crossfire + council) over a **mission's working diff**. The **build / architecture / devops phases STAY prose orchestration** (they write code, are sequentially dependent, and need lead judgment + `--interactive` gates). Run as **one workflow per review pass** so `--interactive` pauses sit at the workflow boundary (workflows take no mid-run input).
- **`docs/methods/WORKFLOWS.md`** — the authoring standard (canonical shape, API, the #348/#363 gotchas, the 16/1000 caps, the ADR-064 gate-launch sequence, what stays prose).

**Gate-compliant launch (ADR-064):** the command musters the Silver Surfer (Agent tool) → `record-roster.sh` → **then** invokes the Workflow, passing the roster via `args`. The gate permits it (roster recorded); the workflow's internal `agent()` calls are that authorized roster. `--light`/`--solo` use the raw-Agent fallback with a `bypass.sh`.

**What stays prose / lead judgment** (workflows orchestrate, they don't replace it): the 264 personas, the Agent Debate Protocol, severity re-rating, "verify the FIX not just the finding," and **the application of fixes** between runs. The lead applies fixes from the returned report, then re-invokes the workflow to re-verify.

## Consequences

- **Context offloaded:** an 80-agent gauntlet's intermediates live in script variables; only the synthesis reaches the lead. Schema-validated `agent()` outputs replace "return JSON and hope" (auto-retry on mismatch). Runs are journaled/resumable. Effort tiers (ADR-054) apply automatically via each agent's frontmatter.
- **Acceptance test is a live run.** The scripts are syntax-validated (ESM, async-wrapped) and built to the documented Workflow API, but a full end-to-end gauntlet launches 30+ real review agents and is the true acceptance test — to be run on a real codebase. The raw-Agent prose path remains the fallback and the canonical description.
- `--interactive` is incompatible with a single workflow run → `/assemble` runs the review workflow once per pass.

## Alternatives

- **Keep hand-fanning** — rejected: the context-bloat problem worsens as rosters grow; ADR-064 removed the only blocker.
- **One mega-workflow for all 13 `/assemble` phases** — rejected: the build phases write code + need `--interactive`, which a single workflow can't pause for. Split review-into-workflow, build-stays-prose.
- **Migrate `/campaign --interactive` too** — deferred: per-mission human gates collide with the no-mid-run-input limit.

## Implementation Scope

- **Reality anchor:** PARTIAL — the scripts + docs + command wiring exist at HEAD and pass syntax/API validation; the end-to-end live run does not (and launches real agents). "Implemented (scripts + wiring); acceptance pending a live gauntlet run."
- **Deliverables:** `.claude/workflows/gauntlet.workflow.js`, `.claude/workflows/assemble-review.workflow.js`, `docs/methods/WORKFLOWS.md`, gauntlet.md + assemble.md workflow-execution sections, CLAUDE.md Docs Reference row.
- **Verification gate:** `node --check` (async-wrapped) on both scripts (done); the live acceptance run on a real project confirms round wiring + schema validation end-to-end. Depends on **ADR-064** (gate interop) — do not run a review workflow without the gate-compliant roster sequence.
