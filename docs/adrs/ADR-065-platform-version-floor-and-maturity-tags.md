# ADR-065: Claude Code platform version floor + feature maturity tags

## Status: Accepted (decision); Implementation: Proposed — to be implemented in the platform-alignment campaign

## Context

VoidForge already ships **load-bearing dependencies on Claude Code platform features** — the `PreToolUse` Silver Surfer gate (ADR-051), subagent dispatch (ADR-044), the Workflow tool (used in production since v23.13.x) — with **no documented minimum Claude Code version**. `COMPATIBILITY.md` documents only a Node.js floor. The methodology package distributes to consumers via npm with no signal of which platform features it assumes.

The `/architect --plan` platform review (2026-06) flagged two consequences:
- **Silent breakage downstream (Bombadil/Coulson):** adopting Workflows / skills / Routines / effort levels will ship methodology text that references features a consumer's older Claude Code cannot run — the consumer gets a no-op or an error with no explanation.
- **Beta churn becoming load-bearing (Coulson/Breeze):** some platform primitives are behind dated beta headers (e.g. Routines, Managed Agents). Wiring a beta primitive into a GA methodology release couples VoidForge's stability to a moving target.

## Decision

1. **Declare a platform floor.** Add a `claudeCode` minimum-version field to the methodology package manifest (or a `PLATFORM_FLOOR` constant) and a **Claude Code version row** to `COMPATIBILITY.md`. State the minimum version each load-bearing feature requires (hooks, subagents, and — once adopted — Workflow tool / effort levels).
2. **Semver rule:** **raising the platform floor is a breaking change.** A methodology release that requires a newer Claude Code than the prior release bumps MAJOR (or, if the team prefers, a clearly-flagged MINOR with a `⚠ raises platform floor` banner in the CHANGELOG). A consumer must never silently land on a methodology version their CLI can't run.
3. **Per-feature maturity tags.** Each platform feature VoidForge depends on carries a maturity tag in the docs: **GA** (safe for the scaffold/GA tier), **beta** / **preview** (Full-tier or opt-in only, never load-bearing in a GA release). This operationalizes the existing "keep the GA scaffold tier on GA primitives" instinct (see ADR-064's choice to gate workflows but not adopt Routines).
4. **Release gate.** `/git` (`RELEASE_MANAGER.md` Verification Checklist + `git.md`) gains: *"Platform floor unchanged since last release? If raised, flag as breaking and add the CHANGELOG banner; confirm every newly-referenced platform feature is tagged GA or explicitly Full-tier/opt-in."*
5. **Optional runtime warning.** A `SessionStart` hook MAY warn when the running CLI reports a version below the declared floor (best-effort, non-blocking — hooks are not a security boundary).

## Consequences

- Consumers get an explicit, machine-checkable signal of what their CLI needs; "it silently did nothing" stops being a support category.
- The team gains a discipline that prevents a beta primitive from quietly becoming GA-load-bearing.
- Cost: every release now answers "did the floor move?" — cheap, and it piggybacks on the existing checklist.

## Alternatives

- **Document the floor in prose only** — rejected: prose drifts (cf. the stale model-IDs this same release fixed); a manifest field + checklist item is mechanical.
- **No floor; assume latest** — rejected: VoidForge is npm-distributed to heterogeneous installs, and the project's platform-agnostic posture (user memory) means consumers run a range of CLI versions.

## Implementation Scope

- **Reality anchor:** NO — does not exist at HEAD. Proposed for the campaign.
- **Deliverables:** `claudeCode` floor field in `packages/methodology/package.json` (or a `PLATFORM_FLOOR.md`); a Claude Code version row in `COMPATIBILITY.md`; maturity tags in the relevant method docs; `RELEASE_MANAGER.md` + `git.md` checklist items; (optional) a `SessionStart` floor-warning hook.
- **Verification gate (Fixture Bindability):** a release-checklist test that fails if a method doc references a platform feature tagged `beta`/`preview` while the package is on the GA scaffold tier with no opt-in marker. (Pairs with ADR-066's collision tracker — both are "platform-reality vs methodology-claim" gates.)
