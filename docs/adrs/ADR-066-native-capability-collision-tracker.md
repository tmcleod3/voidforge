# ADR-066: Native-capability collision tracker (completes ADR-050's deferred follow-up)

## Status: Accepted (decision); Implementation: Proposed — to be implemented in the platform-alignment campaign

## Context

ADR-050 (Native Claude Code coexistence, 2026-04) renamed `/review`→`/engage` and `/security`→`/sentinel` (with permanent aliases) to avoid shadowing native Claude Code commands, and listed the remaining VoidForge commands as "no known collisions" — explicitly **deferring a standing "Native Capabilities Tracker" follow-up ADR that was never created.**

The `/architect --plan` platform review (2026-06, Troi) found the platform now ships bundled **skills** (`/test`, `/qa`-class, `/commit`/`/git`-class, `/debug`, `/code-review`, `/deep-research`) that **directly collide** with VoidForge's Silver-Surfer-gated `/qa` (Batman), `/test` (Batman test-mode), and `/git` (Coulson). The shadowing risk that justified ADR-050 for `/review`/`/security` now exists for these three — and is worse on surfaces without project-local command resolution (claude.ai web, some IDE extensions): a user typing `/qa` there gets the **native** skill, ungated and with none of VoidForge's review semantics.

There is currently no place that records which VoidForge command names collide with native capabilities, or the decision for each.

## Decision

1. **Create the tracker** — `docs/NATIVE_CAPABILITIES.md` (and a pointer row in CLAUDE.md's Docs Reference). It audits **all** VoidForge slash commands against the current native skill/command set and records, per command: the native collision (if any), the surface(s) where it shadows, and an explicit **disposition**:
   - **keep** (no collision, or VoidForge's is unambiguously the project-local winner),
   - **rename + permanent alias** (the ADR-050 treatment — for genuine functional collisions like `/qa`, `/test`),
   - **accept coexistence** (document that on web/IDE surfaces the native one may win, and tell users to invoke the gated VoidForge flow explicitly).
2. **Decide the three live collisions** (`/qa`, `/test`, `/git`) in the campaign: evaluate rename+alias vs accept-coexistence for each. (`/git` is lower-risk — the native `/commit` is narrower than Coulson's release management — but the audit must state it, not assume it.)
3. **Make it a release gate** — `git.md` / `RELEASE_MANAGER.md` gains: *"Re-run the native-capability collision audit at each release; a new bundled native skill that collides with a VoidForge command requires a recorded disposition before ship."* This closes the "deferred and forgotten" failure mode that produced this very gap.

## Consequences

- The "no known collisions" claim becomes a living, re-audited record instead of a one-time snapshot that silently rots as the platform adds skills.
- Users on web/IDE surfaces get explicit guidance when a name is shadowed.
- Renames carry the ADR-050 cost (alias maintenance, muscle-memory churn) — which is exactly why the disposition is a deliberate per-command decision, not a blanket rename.

## Alternatives

- **Rename everything that collides immediately** — rejected: premature; `/git` coexistence may be fine, and renames are disruptive. The tracker forces a reasoned per-command call.
- **Leave it (rely on project-local resolution)** — rejected: project-local resolution does not cover claude.ai web / some IDE surfaces, which is exactly where the ungated-native-skill risk bites.

## Implementation Scope

- **Reality anchor:** NO — `docs/NATIVE_CAPABILITIES.md` does not exist at HEAD. Proposed for the campaign.
- **Deliverables:** `docs/NATIVE_CAPABILITIES.md` (full command×native-capability matrix with dispositions); CLAUDE.md Docs Reference pointer; per-command disposition decisions for `/qa`, `/test`, `/git` (rename+alias or coexistence, applied to the command files if renamed); `RELEASE_MANAGER.md`/`git.md` re-audit checklist item; update ADR-050 to reference this tracker as its realized follow-up.
- **Verification gate (Fixture Bindability):** a check that every command in `.claude/commands/*.md` appears in the tracker with a disposition; it fails if a command is missing — so a newly-added command can't silently skip the collision audit.
