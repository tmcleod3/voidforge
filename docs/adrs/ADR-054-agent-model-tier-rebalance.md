# ADR-054: Agent Model Tier Rebalance

## Status
In progress — 2026-04-20 (partial implementation in v23.8.13: Surfer → Haiku). **Amended 2026-06-13: added the `effort`-tiering dimension + Haiku 4.5 constraints (200K context, no `effort` parameter).**

## Context
Agent model distribution before audit: ~78% Sonnet (206 agents), ~14% Haiku (38 agents), ~8% `inherit` (20 agents, leads). The Silver Surfer — highest-frequency agent in the fleet, fires before every gated command — was on Sonnet for what is essentially a classification and pattern-match task against agent YAML frontmatter.

Per Ducem Barr's token-economics audit: the Surfer is the single largest cost lever because it runs on every gated command, and it doesn't synthesize — it selects. Haiku 4.5 handles that class of task without quality regression.

## Decision

**Silver Surfer → Haiku 4.5** (shipped v23.8.13).

Additional rebalance targets (v23.9.0):
- `oracle-static-analysis` → Haiku (pattern scanning with fixed severity tags)
- `wong-documentation` → Haiku (presence checks)
- `black-canary-monitoring` → Haiku (threshold comparison)
- `bilbo-microcopy` → Haiku (short-string auditing)

**No Opus promotions** without documented quality failures on Sonnet. Leads use `model: inherit` which resolves to the orchestrator's model (Opus 4.8 when the orchestrator is Opus).

**Legitimate `inherit` semantics confirmed** (per Fern's compliance scan): Claude Code honors `inherit` by propagating the parent context's model. Twenty lead agents correctly use it.

**Effort tiering (amended 2026-06-13).** Model tier and **effort** are *independent* cost levers; this ADR originally tuned only the model. Add an `effort:` dimension: **Leads → `xhigh`** (recommended start for agentic work on Opus 4.8), **Specialists → `medium`** (read-and-report review rarely needs full `high` spend), **Scouts (Haiku) → OMIT** — **Haiku 4.5 does not support the `effort` parameter and errors if it is passed.** Haiku also caps at **200K context (not 1M)** — the Surfer pre-scan and scout prompts must fit within it (read frontmatter, not full agent bodies, on large rosters). Tuning effort across the ~200 Sonnet specialists (`high`→`medium`) is a **larger, safer saving** than the original few-agent Haiku rebalance, because it applies fleet-wide without changing which model runs. **Precondition:** verify the runtime honors agent-frontmatter `effort:` before the 264-file edit; the policy is documented in `SUB_AGENTS.md` Model Tiering regardless, and the fleet edit is a platform-alignment-campaign mission.

## Consequences
**Positive:** ~5× cost reduction on Silver Surfer invocations. Largest single-command saving in the fleet.
**Negative:** Haiku's output style differs slightly from Sonnet — validate on next gauntlet that roster selection quality is preserved.
**Neutral:** fleet still heavily Sonnet (correct for specialists doing real reasoning).
**Constraint (amended 2026-06-13):** the Surfer's move to Haiku makes Haiku's **200K context ceiling** an operational limit on the pre-scan — on large rosters (the fleet is now 264 agents) the Surfer must read frontmatter only, never full bodies, to avoid truncation; and no code path may pass an `effort` parameter to a Haiku-tier agent (it errors).

## Alternatives Considered
- Uniform Sonnet (current) — wastes capability where Haiku suffices.
- Opus for Surfer (over-spec) — no evidence the selection task needs it.

## Related ADRs
ADR-044 (subagent materialization).

## Rollout
- v23.8.13: Surfer → Haiku.
- v23.9.0: Oracle, Wong, Black Canary, Bilbo → Haiku after cost/quality measurement on current Surfer change.
