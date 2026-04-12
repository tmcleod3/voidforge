# ADR-049: Agent Heraldings — Personality Announcements for All Agents

## Status: Accepted

## Context

The Silver Surfer (ADR-048) has a "Cosmic Heraldings" section — 14 third-person announcement lines that the orchestrator speaks when launching the Herald. Example: *"Norrin Radd soars ahead. The Power Cosmic reads your code before any mortal agent touches it."*

No other agent has this. When Opus launches Batman, there's no announcement — Batman just starts working. When Fury deploys 15 agents in parallel, there's no theater. The agent personality system (9 universes, 264 characters) has rich identities encoded in their markdown files, but none of that personality surfaces during deployment.

VoidForge's identity is its characters. The agents, the universes, the personality — these ship in every package. Adding heraldings transforms agent deployment from a silent function call into a narrative moment.

## Decision

Add a `heralding` field to every agent's YAML frontmatter. This is a single one-liner (max 120 chars) that the orchestrator MAY announce when deploying that agent.

### Format

```yaml
---
name: Batman
description: "QA and bug hunting: ..."
heralding: "The Dark Knight descends on your codebase. No bug escapes the night."
model: inherit
tools: [...]
---
```

### Rules

1. **One line per agent.** Not a list like Silver Surfer — the Surfer's multi-line heraldings are unique to the Herald role (it's the first thing users see). Other agents get a single signature line.
2. **Third person, present tense.** The orchestrator speaks about the agent, not as the agent. "The Dark Knight descends..." not "I am the night."
3. **Character-authentic.** Reference the character's source material, powers, catchphrases, or narrative role. Samwise's heralding should feel like Tolkien, not Marvel.
4. **Domain-relevant.** Tie the character's fiction to their VoidForge domain. Loki's chaos maps to chaos testing. Spock's logic maps to schema design.
5. **Distinct from the blockquote.** The `>` blockquote is the agent's own voice (first person). The heralding is the orchestrator's voice (third person). Never duplicate.
6. **Optional to announce.** Orchestrators MAY display heraldings. `--quiet` or `--solo` modes can suppress them. The field exists for tooling that wants personality.

### Silver Surfer Special Case

Silver Surfer keeps its existing multi-line `## Cosmic Heraldings` section. It also gets the single-line `heralding` YAML field for consistency with the registry. The multi-line section is for the Herald's unique role as the first agent launched — picked at random each session. Other agents don't need this.

## Consequences

- All 264 agent files get a `heralding` field in YAML frontmatter
- The Herald runtime (`agent-registry.ts`) can expose heraldings in the agent registry
- Future wizard UI can display heraldings during agent deployment animations
- The `--light`/`--quiet` modes already suppress sub-agent output, so heraldings add zero noise when unwanted
- Adds ~1 line per file (264 lines total across the codebase)

## Alternatives

1. **Multi-line heraldings for everyone (like Silver Surfer).** Rejected: 264 agents x 10 lines = 2,640 lines of announcement text. Excessive. The Surfer's multi-line format is special because it's the FIRST agent launched — it's the opening crawl. Other agents are the cast.
2. **Add heraldings to AGENT_CLASSIFICATION.md instead of YAML.** Rejected: the YAML frontmatter is the single source of truth for agent metadata. The registry loader already parses it. Adding a second location creates drift.
3. **Generate heraldings dynamically via LLM.** Rejected: heraldings should be stable — the same agent should have the same announcement every time. LLM generation would vary per session and couldn't be reviewed/committed.

## Implementation Scope

Fully implemented in this session. All 264 agent files updated.
