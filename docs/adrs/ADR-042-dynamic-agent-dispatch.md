# ADR-042: Dynamic Agent Dispatch — Cross-Domain Spot-Checks and Content-Driven Selection

## Status: Accepted

## Context

VoidForge's agent system has 259 named agents across 9 universes, but the dispatch model is static. Each command has a hardcoded agent manifest in its method doc:

- `/architect` always deploys Spock, Uhura, Worf (Star Trek)
- `/qa` always deploys Oracle, Red Hood, Alfred (DC)
- `/security` always deploys Leia, Chewie, Rex (Star Wars)

This creates three problems:

1. **No cross-domain coverage.** When `/review` finds security-adjacent code (auth middleware, encryption, input validation), it logs a handoff for `/security` instead of deploying Kenobi inline. In `--blitz` campaigns, nobody runs the handoff manually — the finding gets lost.

2. **Static manifests ignore the actual code.** `/architect` always deploys Spock (schema) even when the change has no schema impact. It never deploys Vin (analytics) even when the change is entirely statistical. The manifest matches the command's domain, not the code's domain.

3. **High-value agents are under-deployed.** Troi (PRD compliance) only runs in Gauntlet Council. Riker (trade-off challenges) only runs in `/architect`. Vin (statistical review) only runs in Musters. These agents have expertise that's valuable in non-Muster contexts but the static manifests never activate them.

The `--muster` flag is the only dispatch model that evaluates agents dynamically based on the actual task. But Muster is expensive (30-50 agent launches) and intended for major decisions, not routine commands.

## Decision

### 1. Cross-Domain Spot-Checks

When a command's primary agents identify code that crosses into another domain, the command should automatically deploy a spot-check agent from that domain — not log a handoff.

**Trigger conditions:**

| Primary Command | Detects | Auto-Deploy |
|----------------|---------|-------------|
| `/review` | Auth/encryption code | **Kenobi** or **Ahsoka** (security spot-check) |
| `/review` | Database queries/schema | **Spock** (schema spot-check) |
| `/review` | CSS/ARIA/a11y patterns | **Samwise** (accessibility spot-check) |
| `/qa` | API endpoint edge cases | **Kim** (API design spot-check) |
| `/qa` | Financial calculations | **Vin** (statistical spot-check) |
| `/security` | Architecture implications | **Picard** (architecture spot-check) |
| `/architect` | Implementation feasibility | **Stark** (code review spot-check) |
| `/build` | PRD deviation detected | **Troi** (compliance spot-check) |

**Implementation:** Each method doc gains a "Cross-Domain Triggers" section listing what patterns trigger which spot-check agents. The lead agent reads the code diff, checks for trigger patterns, and deploys spot-check agents as sub-processes when matched.

### 2. Content-Driven Agent Selection

Instead of hardcoded manifests, commands should scan the actual code being reviewed and select agents based on what's in the diff.

**Selection rules:**

| Code Contains | Deploy |
|--------------|--------|
| Database schema, migrations, SQL | **Spock** (schema) |
| API routes, HTTP handlers | **Kim** (API design) |
| Auth, sessions, tokens, encryption | **Tuvok** (security architecture) |
| CSS, ARIA, a11y attributes | **Samwise** (accessibility) |
| Statistical code, z-tests, confidence intervals | **Vin** (statistical review) |
| Financial transactions, currency, billing | **Dockson** (treasury) + **Steris** (budget) |
| WebSocket, real-time, SSE | **Scotty** (service architecture) |
| Deploy scripts, CI/CD, Docker | **Kusanagi** (DevOps) |
| AI/LLM prompts, model calls, tool schemas | **Hari Seldon** (AI intelligence) |
| Performance-critical paths, caching, indexing | **Torres** (performance) |

**Implementation:** The lead agent reads `git diff --stat` at the start of the command, matches file paths and content against the selection rules, and adds matching agents to the dispatch list. This supplements (not replaces) the base manifest — the command's core agents always run, and content-driven agents are added.

### 3. Promoted High-Frequency Agents

These agents are too valuable to be Muster-only. Promote them to run on every invocation of their associated commands:

| Agent | Current | Promoted To | Rationale |
|-------|---------|-------------|-----------|
| **Troi** (PRD compliance) | Gauntlet Council only | Every `/build` mission completion | Catches PRD drift before it compounds |
| **Riker** (trade-off challenges) | `/architect` only | Every ADR written in any command | Prevents rubber-stamped decisions |
| **Vin** (statistical review) | Muster only | Any `/review` or `/qa` touching math | Statistical bugs pass tests (field report #265) |
| **Worf** (security implications) | `/architect` only | Every `/review` that touches auth code | Security-by-design, not security-after-build |
| **Torres** (performance) | `/architect` only | Every `/review` touching DB queries or API routes | N+1 queries caught at review, not in production |
| **Constantine** (cursed code) | Gauntlet Crossfire only | Every `/qa` final pass | Finds code that works by accident |

## Consequences

**Enables:**
- Security issues caught during `/review` instead of logged as handoffs
- Statistical bugs caught by Vin during routine reviews, not just Musters
- PRD compliance checked after every build mission, not just at Victory Gauntlet
- Performance issues identified at review time, not post-deployment
- Dynamic agent selection means agent coverage scales with code complexity

**Requires:**
- Updates to 8+ method docs (adding "Cross-Domain Triggers" sections)
- Updates to 8+ command files (adding content-scanning preamble)
- No runtime code changes — this is purely methodology

**Trade-offs:**
- More agent launches per command (estimated 2-4 additional spot-checks per invocation)
- More context consumed per command (each spot-check agent reads relevant code)
- Partially mitigated by the spot-check being targeted (one file/function, not full codebase)

**Does NOT change:**
- The Muster protocol — still deploys every viable agent for major decisions
- The Gauntlet — still runs all 30+ agents across all domains
- Lead agent assignments — Picard still leads architecture, Batman still leads QA

## Alternatives Considered

1. **Keep static manifests, improve handoffs.** Rejected because handoffs in `--blitz` mode are never executed — the finding is logged but nobody acts on it until the Victory Gauntlet, where it costs more to fix.

2. **Make every command a mini-Muster.** Rejected because deploying 30-50 agents for a `/review` of a 20-line change is wasteful. Content-driven selection is targeted — deploy 2-4 extra agents, not 50.

3. **Auto-run `/security` after every `/review`.** Rejected because it's the wrong granularity — running the full security protocol after every review is expensive and redundant. A spot-check from Kenobi on the specific security-adjacent code is enough; the full `/security` pass runs in `/assemble` and `/gauntlet`.
