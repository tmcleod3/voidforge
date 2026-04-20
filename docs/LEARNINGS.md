# Project Operational Learnings

Persistent knowledge from live operations. Things code reviews can't catch.
Updated: 2026-04-20 | Entries: 8/50

---

## API Behavior

### Kongo API covers all VoidForge integration needs without custom endpoints
The PRD assumed 6 new Kongo endpoints were needed (from-prd, bulk variants, batch-status, bandit lifecycle, growth-signal, 4 webhook events). None were needed. Existing endpoints handle everything: `POST /engine/pages` with `brief` field replaces from-prd, `POST /campaigns/:id/variants/generate` replaces bulk variants, campaign analytics + client-side z-test replaces growth-signal. Only `page.completed` and `page.failed` webhooks exist.

- **category:** api-behavior
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/ (entire integration)
- **evidence:** Read actual API docs at kongo.io/docs/api. Compared against PRD-kongo-integration.md Section 6 endpoint table. All 6 "TO BUILD" endpoints had existing alternatives.
- **context:** User owns Kongo — API is malleable if custom endpoints are ever needed. But the current surface is sufficient for the full seed-to-conversion closed loop.

### Kongo uses API keys, not OAuth
Keys use `ke_live_` prefix, created at kongo.io/dashboard/api. No OAuth provider exists. API key management endpoints (`/api-keys`) require session auth (dashboard login), not API key auth. Webhook signing secrets are shown once at key creation and cannot be retrieved again.

- **category:** api-behavior
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/provisioner.ts
- **evidence:** Read Kongo API docs "API Key Management" and "Authentication" sections. Confirmed `ke_live_` prefix in all example requests.
- **context:** PRD originally specified OAuth provisioning (ADR-036). Changed to manual API key entry during build. Provisioner validates prefix, verifies connection, stores in financial vault.

## Root Causes

### Statistical code passes tests but is mathematically wrong when tests validate buggy behavior
The growth signal z-test shipped with 3 Critical bugs: (1) control = worst variant instead of first by creation order, (2) normalCdf used as confidence instead of computing 1-pValue, (3) poll timeout 120s for 2-10 min generation. All tests passed because they asserted the buggy output. Only adversarial Gauntlet agents (Stark/Spock) caught the issues by reasoning about the math, not running tests.

- **category:** root-cause
- **verified:** 2026-04-01
- **scope:** wizard/lib/kongo/analytics.ts — computeGrowthSignal, twoProportionZTest
- **evidence:** Gauntlet R1 findings CODE-R1-001, CODE-R1-002, ARCH-R1-016. Fixed in commit dd00790.
- **context:** Statistical code needs review by an agent that understands the math, not just code quality. Tests are necessary but insufficient — a test that asserts `expect(brokenResult).toBe(brokenResult)` passes perfectly.

---

### Destructive git operations on multi-branch repos require branch verification
The v20.2 scaffold cleanup was correct in analysis (274 files should not be on scaffold) but wrong in execution — `git rm -r wizard/` ran on main instead of scaffold. No step verified `git branch --show-current` before deleting. The error went undetected for 10+ commits because subsequent work (/void, /debrief --inbox, /review) is methodology-only and never imports wizard modules. Caught only when the user asked to modify wizard/lib/kongo/seed.ts. Required full 272-file restoration from origin/main.

- **category:** root-cause
- **verified:** 2026-04-03
- **scope:** Multi-branch repos (main/scaffold/core) where branch-specific cleanup is needed
- **evidence:** Commit 33109f6 (scaffold cleanup on main), commit c88d532 (restoration). 10 commits between error and detection.
- **context:** Always run `git branch --show-current` before any destructive git operation. In multi-branch workflows, the working branch may not be the intended target. This is the git equivalent of "Verify Before Transact" for financial operations.

## Tooling Gotchas

### LRN-1: Claude Code caches agent definitions at session start
The Agent tool resolves `.claude/agents/*.md` frontmatter (including the `name:` field) once at session boot and does not re-read mid-session. A rename committed during a session will fail to dispatch under the new name — the tool returns `Agent type 'WandaSeldon' not found. Available agents: ...Wanda Seldon` even though disk shows `name: WandaSeldon`. Rename validation must happen in a fresh session before the rename is declared shipped.

- **category:** tooling-gotcha
- **verified:** 2026-04-20
- **scope:** `.claude/agents/*.md` frontmatter changes, especially `name:` renames
- **evidence:** WandaSeldon rename attempt mid-session; Agent tool rejected dispatch with cached-name error despite on-disk frontmatter already updated. Field report #306.
- **context:** Any rename touching the `name:` field requires a fresh-session validation step before merge/release. Related: ADR-055.

## Bash Patterns

### LRN-2: Shell-escape fixes at the destination corrupt legitimate input
A `tr -d '\\'` added to strip a default-sentinel artifact in `record-roster.sh` also stripped legitimate JSON escapes (`\u0041`, `\"`, `\n`) from orchestrator-supplied roster input. The regression chain spanned v23.8.16 → v23.8.17. The correct fix is at the SOURCE of the artifact — the default construction — not at the DESTINATION as a post-hoc strip on all input. Prefer `printf '%s'` with a literal default over any construct that produces characters you then have to remove.

- **category:** bash-pattern-antipattern
- **verified:** 2026-04-20
- **scope:** `scripts/surfer-gate/record-roster.sh` and any shell helper that sanitizes stdin/args
- **evidence:** v23.8.16 introduced `tr -d '\\'`; v23.8.17 rolled forward with JSON input corruption reported by orchestrator. Root cause traced to post-hoc stripping rather than fixing the default producer.
- **context:** When you catch yourself writing a sanitizer at the destination, walk back to the source that created the artifact and fix it there. Destination-side strips are a class of bug that silently mutate valid input.

## Docs Maintenance

### LRN-3: Sibling docs drift after ADR schema changes
ADR-056 amended the Gate event schema, but the old field name `roster_json` persisted in sibling docs for 3 releases while the code emitted `roster` / `roster_text` / `roster_parsed`. The ghost field also lived at `BUILD_JOURNAL.md:46`. "Reconciled" means re-reading the ADR end-to-end and `grep -rn '<old_field>' docs/` across the entire docs tree — not patching individual sentences that look wrong.

- **category:** docs-maintenance
- **verified:** 2026-04-20
- **scope:** Entire `docs/` tree after any ADR schema amendment; common drift sites: `BUILD_JOURNAL.md`, `HOLOCRON.md`, `CLAUDE.md`
- **evidence:** ADR-056 `roster_json` ghost persisted 3 releases; code shipped `roster` / `roster_text` / `roster_parsed`. Ghost also present at `BUILD_JOURNAL.md:46`.
- **context:** Every ADR schema amendment requires a repo-wide grep for the old field name(s) as part of the reconciliation step. No reconciliation claim is valid without that grep being clean.

## Distribution Gotchas

### LRN-4: Published npm package name must match install instructions
`package.json` declared `thevoidforge` / `thevoidforge-methodology` (published to npm since v21.0) while docs canonicalized `voidforge` / `@voidforge/methodology`. `npx voidforge init` resolved to a squatted `voidforge@0.0.1` or ENOTFOUND for 23 consecutive releases. `require.resolve('@voidforge/methodology/package.json')` was silently broken in every production install during that window.

- **category:** distribution-gotcha
- **verified:** 2026-04-20
- **scope:** `package.json` (both `packages/voidforge/` and `packages/methodology/`) vs. every doc that includes an install command
- **evidence:** Gauntlet 41 surfaced the drift. Docs said `npx voidforge init`; published manifests said `thevoidforge`. Resolved in ADR-061 / v23.9.0.
- **context:** Keep ONE canonical install command location (CLAUDE.md Distribution section) and link everywhere else — do not copy install commands across 20+ docs. Every name change in docs requires `package.json` diff verification before `npm publish`. Related: ADR-061.

## Decisions

<!-- "We chose X over Y because Z" — prevents re-evaluation -->

## Environment Quirks

<!-- Platform, hosting, tooling behaviors specific to this project -->

## Vendor

<!-- Third-party service behaviors, gotchas, workarounds -->

## Workflow

<!-- Process discoveries, agent coordination patterns, build order dependencies -->

## Archived

<!-- Entries stale for 180+ days or no longer relevant. Kept for historical reference. -->
