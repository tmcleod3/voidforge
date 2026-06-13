# ADR-059: Concurrency Model Reconciliation

## Status
Accepted — 2026-04-20 (amended 2026-06-13: real platform concurrency ceiling added)

## Context
Two contradictory instructions:
- `CLAUDE.md` Silver Surfer Gate: *"If the Surfer returns 20 agents, your next action is 20 Agent tool calls (parallel where possible)."*
- `docs/methods/SUB_AGENTS.md:332`: *"Max 3 concurrent agents (hard cap)."*

The cap was written for older context windows where 15+ parallel findings tables thrashed context. Opus 4.8 with 1M context does not have this constraint — field report #270 observed 15+ parallel agents running at 15-25% context usage.

## Decision

**CLAUDE.md is authoritative. Update SUB_AGENTS.md lines 330-336 (per Seldon's rewrite):**

```
### Concurrency Rules
- Fan out the full roster in parallel for read-only analysis. Opus 4.8's 1M context handles 20+ concurrent findings tables without thrashing.
- No two concurrent agents may write to the same file — partition by domain, or serialize writes.
- Fix/build agents: batch into waves only when writes overlap. Independent files = parallel.
- Wait for ALL parallel agents before synthesizing (field report #300).
```

**The genuine caps:**
1. **Write collisions** — two agents writing to the same file must serialize.
2. **Sequential dependencies** — when agent B needs agent A's output, that's logic, not a concurrency rule.
3. **Platform ceiling (amended 2026-06-13, platform research).** The Claude Code runtime caps **~16 concurrent** agents (excess queues — true for both raw Agent calls and the Workflow tool) and **~1,000 total agents per workflow run**. "Fan out the full roster" stays correct, but it is throttled to ~16 at a time, not truly N-wide — the "20+/30+ concurrent" framing describes context headroom, not actual parallelism. Design phases to **batch** against the 1,000 ceiling; never one-agent-per-file unbounded on a large repo (reinforces SUB_AGENTS.md "Glob the List, Sweep the Remainder"). A 5-round × ~12-agent Gauntlet fits comfortably; unbounded loop-until-dry and per-file fan-outs are the risk. This also retroactively grounds the Silver Surfer's ~18-roster cap (#344/#346) in the real 16-concurrent reality rather than an arbitrary heuristic.

## Consequences
**Positive:** contradiction eliminated. Predictable throughput with real cap documented.
**Negative:** existing references to "max 3 concurrent" in other docs may need updating (Mustang's cleanup sweep handles this in v23.9.0).

## Alternatives Considered
- Raise the cap to a higher fixed number (5, 10) — still arbitrary.
- Keep the cap for legacy compat — rejected, contradicts the documented enforcement.

## Related ADRs
ADR-048 (gate), ADR-043 (max by default).

## Rollout
v23.9.0 with SUB_AGENTS.md edit.
