# Pattern: Large-Refactor Extraction (8-commit per-entity)

**When to use:** A 1,000+ LOC router/service/handler file needs splitting and the project has an existing exit gate (e.g., max-LOC-per-file). Single-commit refactors of files this size cause review fatigue, hide bugs in the diff noise, and are nearly impossible to revert surgically.

**Source:** Field report #320 §1. M-10 (Union Station): `routers/crm.py` 1,861 → 597 LOC across 8 commits. 0 regressions. Test count grew 2,099 → 2,246 (+147). Exit gate met with 78 LOC of headroom. The 5th commit's IDOR matrix surfaced a route-shadow bug that had made `PATCH /people/batch-update` unreachable in production for an unknown duration.

This is the cleanest large-refactor template I've documented. Use it.

## Architecture-Quick (Picard)

Before any commit, write a 1-2 page architecture doc to `logs/reviews/<topic>-architecture.md`:

```markdown
# Refactor: <topic> — extraction plan

## Current state
- Source file: <path> at <LOC>
- Exit gate: <LOC limit>
- LOC delta needed: <gate - current>

## Entity inventory
| Entity | Endpoints | Estimated LOC delta |
|---|---|---|
| people | 7 | -167 |
| companies | 10 | -345 |
| ... | ... | ... |
| | **Total** | **−1264** |

## Commit plan (one per entity + scaffold + cleanup)
| # | Commit | Adds | Removes | Cumulative LOC |
|---|---|---|---|---|
| 1 | scaffold (service base, error types, shared helpers) | services/_base.py | — | 1861 |
| 2 | extract people | services/people_service.py | router code | 1694 |
| ... | ... | ... | ... | ... |
| 8 | cleanup (lift duplicated helpers, prune imports, lint) | — | router cleanup | 597 |

## Function-signature contract (per service)
- org_id: int (first), user_id: str (second)
- Returns plain dict (no FastAPI Response wrappers)
- Raises ApiError (no HTTPException — service knows nothing of HTTP)
- No FastAPI imports in service modules

## Roles
- Strange — lead, owns sequencing
- Stark — router-side rewrites (thin wrappers calling service)
- Batgirl — IDOR matrix tests per entity
- Coulson — version + commit per step

## IDOR contract
- Pattern A (primary): every service method takes org_id as first param,
  every query is scoped, every test in matrix asserts cross-org denial
- Pattern B (fallback): if a method legitimately spans tenants, document
  the policy and test cross-tenant authorization explicitly
```

## Per-Commit Shape

Each entity commit follows the same shape. Keep them mechanically uniform:

1. **Extract** to `services/<entity>_service.py` — pure business logic, no FastAPI imports
2. **Rewrite** the router file as thin wrappers: validate → call service → format response
3. **Add** IDOR matrix tests for parametric paths AND fixed-suffix paths under same entity prefix (see `/docs/methods/SECURITY_AUDITOR.md` IDOR Matrix section)
4. **Verify** LOC trajectory: `git diff --stat HEAD~1 -- routers/<file>.py` shows monotonic decrease; service module count grows by 1
5. **Run targeted pytest** on touched files only (`pytest tests/services/test_<entity>_service.py tests/routers/test_<entity>.py`) — full suite is the orchestrator's gate, not the agent's
6. **Commit** with a "Deviations from Contract" section in the build report (see SUB_AGENTS.md)

## Final Cleanup Commit

Commit 8 (or N for an N-entity refactor) is non-obvious and load-bearing:

- Lift duplicated helpers that emerged across entities into a shared module
- Prune unused imports in the router file (extraction leaves behind imports the wrappers no longer need)
- Add lint scaffold if missing (LOC limit, signature-contract assertion)
- Verify no test files were dropped (mock paths often need updating to follow the extracted code)
- Confirm exit gate met with documented headroom: `wc -l routers/<file>.py`

## What This Pattern Caught

The IDOR matrix test in commit 5 (M-10 batch.py) surfaced that `/people/{person_id}` was shadowing `/people/batch-update`. FastAPI dispatches first-matching-route; a parametric path declared first eats subsequent fixed-suffix paths. The fix is path-converter type hints (`{person_id:int}`), restricting the parametric route to integer paths.

This bug had been latent in production. No unit test exercised it. No previous Gauntlet caught it. Without the IDOR matrix discipline this pattern bakes in, it would still be unreachable. (Field report #320 §1.)

## Anti-Patterns

- **Single-commit refactor** for files >1,000 LOC. Review fatigue + impossible to revert surgically.
- **No architecture-quick.** Without Picard's plan, the LOC trajectory drifts and entities get extracted in dependency-violating order.
- **No IDOR matrix.** Refactoring multi-tenant code without cross-tenant denial tests is just rearranging the leak surface.
- **Mixing entity extractions in one commit.** Each commit must remain shippable independently with green tests. One commit per entity, no exceptions.
- **Skipping the final cleanup commit.** Duplicated helpers that emerged across entities don't lift themselves; pruning matters.
- **Running full pytest as the agent's last step.** See SUB_AGENTS.md "Build-Agent Pytest Sequencing" — agent response window truncates mid-suite, orchestrator has to reconstruct.

## When NOT to Use

- File is under ~600 LOC. Just split it in one commit; the overhead isn't worth it.
- The file is genuinely cohesive (state machine, single algorithm, generated code). Extraction would fragment what should stay together.
- The exit gate isn't binding — if there's no LOC limit and no clear quality reason to split, the refactor is yak-shaving.
