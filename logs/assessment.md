# State of the Codebase — VoidForge v23.0

## Date: 2026-04-09 (post-Campaign 32)
## Assessors: Picard (Architecture), Thanos (Assessment Gauntlet), Spock (Dead Code), Troi (Cross-Reference)

## Architecture Summary

VoidForge is a monorepo: runtime wizard (`packages/voidforge/`, 231 TS files) + methodology (263 agents, 28 commands, 29 method docs, 37 code patterns).

**Runtime:** Vanilla Node.js HTTP server with custom parameterized router, WebSocket upgrade, PTY terminal, static file serving. 7 runtime dependencies (5 AWS SDK, node-pty, ws). TypeScript strict mode. 0 type errors. 2 `any` usages total.

**Methodology:** 263 subagent definitions in `.claude/agents/` with 3-tier model routing (Opus/Sonnet/Haiku) and 4-category tool restrictions. 28 slash commands with `subagent_type:` references. Description-driven dynamic dispatch (ADR-044).

**Tests:** 741/741 passing across 56 unit + 4 E2E test files. Vitest + Playwright.

## Agent Layer Status: LIVE

- 263 `.claude/agents/*.md` files with valid Claude Code frontmatter
- 122 `subagent_type:` references across 18 command files — all resolve
- Zero old-style inline prompts remain — migration complete
- Model distribution: 20 inherit (Opus) + 205 sonnet + 38 haiku = 263
- Tool restrictions enforced: Builder (20 leads), Reviewer (208), Scout (35)
- Distribution: prepack, copy-assets, new-project all include agents

## Root Causes (grouped)

### RC-1: File Size Violations (MEDIUM)
33+ source files exceed ~300-line guideline. Worst: treasury-heartbeat.ts (1,444), heartbeat.ts (1,051), projects.ts (769), aws-vps.ts (663), provision.ts (642). Organic growth across v20-v22.

### RC-2: Test Coverage Gaps (HIGH)
48 source modules lack test coverage: server.ts, router.ts, all 13 API route handlers, treasury-heartbeat.ts, heartbeat.ts, deep-current.ts, all provisioners, financial adapters. Coverage ratio: ~36%.

### RC-3: Orphaned Source Files (MEDIUM)
11 files (2,271 lines) never imported by production code: natural-language-deploy.ts, desktop-notify.ts, anomaly-detection.ts, correlation-engine.ts, build-analytics.ts, service-install.ts, asset-scanner.ts, daemon-aggregator.ts, autonomy-controller.ts, image-gen.ts, project-vault.ts.

### RC-4: Pattern File Throws (MEDIUM)
3 `throw new Error('Implementation requires...')` in ad-billing-adapter.ts pattern (Google/Meta adapters). Reference pattern, not production, but would throw if instantiated.

### RC-5: Context Endpoint Project Validation (LOW)
war-room/context and danger-room/context skip resolveProject(). Return global stats regardless of :id. Auth-protected but inconsistent.

## Remediation Plan

| Priority | Root Cause | Recommended Action |
|----------|-----------|-------------------|
| HIGH | RC-2: Test gaps | v23.1: Test coverage campaign — API routes, treasury-heartbeat, provisioners |
| MEDIUM | RC-1: File size | v23.2: Refactor treasury-heartbeat.ts into focused modules |
| MEDIUM | RC-3: Orphaned files | v23.1: Audit + delete or re-wire |
| MEDIUM | RC-4: Pattern throws | Add runtime guard or remove constructors |
| LOW | RC-5: Context endpoints | Add resolveProject() or remove :id |
| DONE | CLAUDE.md Team table | Missing Haku + Gandalf — **FIXED** |

## Recommendation

**Ready to ship v23.0.** The agent layer is live and consistent. HIGH finding (test coverage) is pre-existing debt from v20-v22, not introduced by v23.0. Recommend v23.1 focus on test coverage.
