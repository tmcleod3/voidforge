# ADR-064: Silver Surfer Gate ↔ Dynamic Workflow interop

## Status: Accepted (decision); Implementation: Proposed — to be implemented in v23.15.x

## Context

ADR-048/051 establish the Silver Surfer gate as VoidForge's **permanent enforcement mechanism**: a `PreToolUse` hook (`scripts/surfer-gate/check.sh`) on the **Agent** tool blocks any sub-agent launch that isn't the Surfer itself unless a roster has been recorded or a bypass flag is set. CLAUDE.md calls the hook "the intended permanent mechanism" and the prose "a backstop."

The Claude Code **Dynamic Workflow** tool (GA mid-2026, v2.1.154+) spawns sub-agents through a *separate runtime path* — `agent()`/`parallel()`/`pipeline()` calls inside a workflow script, not the `Agent` tool. The gate predates this primitive.

**Empirically confirmed this session (2026-06-13, session `f3c6d9db`)** that the gate does **not** fire for Workflow-spawned agents:

- **Static:** `check.sh:99` — `if [ "$TOOL_NAME" != "Agent" ]; then exit 0` (allow). `.claude/settings.json` `PreToolUse` matcher is `"Agent"` only.
- **Historical:** ~60+ Workflow-spawned agents ran this session (inbox investigators, 16 appliers, debrief analysts, the 16-agent architect analysis). The gate's session audit trail (`logs/surfer-gate-events.jsonl`) contains exactly **two** events: `ALLOW: Silver Surfer self-launch` and `ROSTER_RECEIVED`. Zero workflow agents.
- **Controlled probe:** snapshotted the session's gate-event count (2), ran a one-agent Workflow probe (`gate-probe`, agent replied `GATE_PROBE_AGENT_RAN_OK`), re-counted — still **2**. The workflow-spawned agent produced no gate event.

**Therefore: any command re-platformed onto the Workflow tool (ADR-aligned re-platforming of `/gauntlet`, `/assemble`) silently routes around ADR-051.** This converts the framework's single highest-leverage opportunity (Workflow re-platforming) into its highest-stakes regression unless closed first.

## Decision

Extend the gate to cover the Workflow tool **at the launch boundary**:

1. **`.claude/settings.json`** — change the `PreToolUse` matcher from `"Agent"` to `"Agent|Workflow"`.
2. **`scripts/surfer-gate/check.sh`** — when `TOOL_NAME == "Workflow"`, enforce the same roster-present-or-bypass check that `Agent` gets. The Workflow tool's `tool_input` carries no `subagent_type` (it has `script`/`name`/`args`), so the Surfer-self-launch rule (Rule 1) and roster-name logic are skipped for Workflow calls; only Rules 2–4 (bypass flag / fresh roster / else block) apply. A Workflow launched with **no recorded roster and no bypass → block (exit 2)**, forcing the lead to muster the Surfer first; with a roster or `--light`/`--solo` bypass → allow.
3. **`scripts/surfer-gate/test.sh`** — add Workflow-tool cases (no-roster→exit 2, roster-present→exit 0, bypass→exit 0), per the threshold/behavior-coupled-test discipline (field report #363 F2: a gate behavior change must update its own test in the same commit).
4. **CLAUDE.md** — document that a Workflow launch is gated like an Agent launch: muster the Surfer + record a roster before invoking a Workflow that fans out a review roster, or set a `--light`/`--solo` bypass for build/apply/research workflows.

**Scope of enforcement:** gating the Workflow *launch* (not each internal `agent()` call) is sufficient. The gate's purpose is "a roster was mustered for this review, not cherry-picked" — that invariant is satisfied at the launch boundary. Individual workflow-internal agents remain ungated by design (they are the *contents* of an already-authorized roster, analogous to how the Agent-tool gate authorizes a launch, not each tool the sub-agent then uses).

## Consequences

- **Closes the bypass.** ADR-051's "permanent enforcement mechanism" becomes true for the Workflow path; re-platforming heavy commands onto Workflows no longer defeats the gate.
- **Every Workflow launch now requires a roster or a bypass** — the same discipline already applied to Agent launches. Build/apply/research workflows (not review rosters) must record a roster or set `--light`/`--solo`. This is the intended tightening, consistent with the existing model; it must be called out in CLAUDE.md so legitimate non-review workflows aren't surprised by a block.
- **Fail-open philosophy preserved:** infra errors still exit 0; only the no-roster-no-bypass case blocks.
- **Unblocks** the Workflow re-platforming of `/gauntlet` and `/assemble` (their own ADR) once this lands.

## Alternatives

- **(a) Workflow self-records the roster as its first `phase()`** — rejected as the *primary* mechanism: it relies on every workflow script remembering to self-gate and fails open if one forgets, which is exactly the prose-backstop weakness ADR-051 replaced with a hook. **Retained as a documented complement** for workflows that legitimately run a Surfer-selected roster end-to-end inside the script.
- **(b) Leave it (document the exemption)** — rejected: it makes ADR-051 advisory for the most expensive commands, the opposite of its stated goal.
- **(c) Gate every internal `agent()` call** — not possible from a `PreToolUse` hook (the runtime does not surface workflow-internal launches as `Agent` events, per the empirical finding) and unnecessary (see Scope above).

## Implementation Scope

- **Reality anchor:** NO — the matcher/check.sh/test changes do not exist at HEAD. "Proposed — to be implemented in v23.15.x." Decision is Accepted; code is pending.
- **Deliverables (each with an existence/behavior check):**
  - `.claude/settings.json` matcher `Agent|Workflow` — `grep -q '"Agent|Workflow"' .claude/settings.json`
  - `scripts/surfer-gate/check.sh` Workflow branch — a `Workflow` case in the tool-name handling
  - `scripts/surfer-gate/test.sh` Workflow cases — `grep -q Workflow scripts/surfer-gate/test.sh`
  - CLAUDE.md gate-section note on Workflow launches
  - ADR-051 amendment cross-referencing this ADR
  - Mirror to `packages/methodology/scripts/surfer-gate/` (tracked copies, per the v23.13.x mirror discipline)
- **Verification gate (Fixture Bindability — must be able to fail):** a `test.sh` case that pipes a `{"tool_name":"Workflow",...}` stdin with **no** roster recorded and asserts `exit 2`; and one with a fresh roster asserting `exit 0`. Before the matcher/branch change, the first case returns `exit 0` (gate blind) — proving the test actually exercises the gap. After, it returns `exit 2`.

## Evidence

Session `f3c6d9db` (2026-06-13): `check.sh:99` static read; `logs/surfer-gate-events.jsonl` showing 2 events against 60+ workflow agents; controlled `gate-probe` workflow (BEFORE=2 / AFTER=2 gate events). Surfaced by the `/architect --plan` 12-agent platform-evolution review (Picard, Fury, Seldon, Gaal, Hober, Chakotay, Troi, Breeze all independently flagged the gap).
