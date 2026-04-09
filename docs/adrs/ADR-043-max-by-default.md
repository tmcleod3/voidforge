# ADR-043: Max by Default — Invert the Flag Taxonomy

## Status: Accepted

## Context

The current flag taxonomy requires users to opt INTO quality:

```
/campaign                    → standard agents, human pauses
/campaign --blitz            → autonomous (no pauses)
/campaign --muster           → full agent roster
/campaign --blitz --muster   → autonomous + full roster
```

In practice, the project owner runs `--blitz --muster` on every command. The "standard" mode — fewer agents, human confirmation prompts — is never used. The flags that push for MORE quality are typed every time. The flags that reduce quality (`--fast`) are rarely used.

This is backwards. The default should be maximum quality. Flags should reduce scope when you specifically need less.

## Decision

### Invert the defaults

**Before (opt-in to quality):**
```
(default)     → Standard agents, human pauses between missions
--blitz       → Autonomous execution (no pauses)
--muster      → Full 9-universe agent deployment
--fast        → Reduced review passes
--infinity    → Maximum Gauntlet intensity
```

**After (opt-out of quality):**
```
(default)     → Autonomous + full agent roster + all review passes
--light       → Standard agents only (skip cross-domain, skip muster roster)
--interactive → Pause for human confirmation between missions
--fast        → Reduced review passes (unchanged — already opt-out)
--solo        → Lead agent only, no sub-agents (minimal mode for quick checks)
```

### What changes in practice

| Current | New | Effect |
|---------|-----|--------|
| `/campaign` | `/campaign` | Was: standard agents + human pauses. Now: autonomous + full roster |
| `/campaign --blitz --muster` | `/campaign` | Same behavior, zero flags needed |
| `/campaign --blitz` | `/campaign --light` | Autonomous but standard agents |
| `/architect` | `/architect` | Was: Star Trek bridge crew. Now: full Muster (all relevant agents) |
| `/architect --muster` | `/architect` | Same behavior, zero flags needed |
| `/gauntlet` | `/gauntlet` | Was: 5 rounds, standard roster. Now: 5 rounds, full roster |
| `/gauntlet --fast` | `/gauntlet --fast` | Unchanged — still reduces passes |
| `/review` | `/review` | Was: lead + standard sub-agents. Now: lead + content-driven selection (ADR-042) + cross-domain spot-checks |

### Retired flags

| Flag | Status | Replacement |
|------|--------|-------------|
| `--blitz` | **Retired** | Default behavior (autonomous) |
| `--muster` | **Retired** | Default behavior (full roster) |
| `--infinity` | **Retired** | Default for `/gauntlet` (maximum intensity) |

### New flags (opt-out)

| Flag | What It Does | When to Use |
|------|-------------|-------------|
| `--light` | Standard agents only, no cross-domain, no muster roster | Quick checks, small changes, prototypes |
| `--interactive` | Pause for human confirmation at mission briefs and between phases | When you want to review each step before proceeding |
| `--solo` | Lead agent only, zero sub-agents | Fastest possible — for when you just want a quick answer |

### Backward compatibility

`--blitz` and `--muster` are still accepted silently (they're already the default — no behavior change). `--blitz --muster` becomes a no-op. This avoids breaking existing muscle memory or documented workflows.

## Consequences

**Enables:**
- Zero flags for maximum quality: `/campaign`, `/architect`, `/gauntlet` — just the command
- New users get the best experience by default, not the reduced one
- Flags communicate intent: "I want LESS" is a deliberate choice, "I want MORE" shouldn't need to be
- Simpler mental model: the default is always "do your best"

**Requires:**
- Update CLAUDE.md Flag Taxonomy (Tier 1-3 tables)
- Update all 28 command files (remove --blitz/--muster from arguments, add --light/--interactive/--solo)
- Update MUSTER.md (muster is now default, not a flag)
- Update CAMPAIGN.md (blitz behavior is now default)
- Update GAUNTLET.md (infinity is now default)
- Update ASSEMBLER.md (full roster is now default)
- Update marketing site /commands pages
- All existing `/campaign --blitz --muster` examples in docs become just `/campaign`

**Trade-offs:**
- Higher default context consumption (more agents = more tokens per command)
- Slower default execution (Muster is expensive — 30-50 agent launches)
- Users who want a quick answer need to type `--light` or `--solo`
- Mitigated by ADR-042 (content-driven selection means agents only deploy when relevant)

## Alternatives Considered

1. **Keep current flags, add `--max` as a shorthand for `--blitz --muster`.** Rejected because this still defaults to less. The user shouldn't need to ask for quality.

2. **Make `--blitz` the default but keep `--muster` as opt-in.** Rejected because it's inconsistent — why would autonomous execution be default but full analysis not be? Either the default is maximum or it isn't.

3. **Per-project config file for default flags.** Considered but unnecessary — if the default is max, there's nothing to configure. Users who want less can type `--light`.
