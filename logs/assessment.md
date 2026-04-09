# State of the Codebase — VoidForge v22.0 "The Scope"

## Date: 2026-04-09
## Assessors: Picard (Architecture), Thanos (Assessment Gauntlet R1-R2)
## Previous: v19.2.0 assessment (6 findings, 0 Critical). This is the post-v22.0 delta.
## Campaign: 28 (7 missions, 8 commits, 20 files, +1337/-385 lines)

---

## Architecture Summary

v22.0 successfully migrated the wizard from global to per-project scoping. The core infrastructure is architecturally sound — routing, access control, financial path parameterization, UI navigation, and WebSocket subscription rooms are all in place.

| Component | Status | Files |
|-----------|--------|-------|
| Router (param matching) | Production-ready | router.ts |
| ProjectContext + resolveProject() | Production-ready | project-scope.ts |
| Dashboard data (10 functions) | Production-ready | dashboard-data.ts |
| Danger Room (13 routes) | Production-ready | danger-room.ts |
| War Room (7 routes) | Production-ready | war-room.ts |
| Treasury reader (extracted) | Production-ready | treasury-reader.ts |
| Financial path functions | Production-ready | financial-transaction.ts, financial-core.ts |
| Daemon configurePaths() | **Declared, not wired** | daemon-process.ts |
| WebSocket subscription rooms | Production-ready (mechanism) | dashboard-ws.ts |
| Project dashboard UI | Production-ready | project.html, project.js |
| LAN WebSocket auth fix | Production-ready | server.ts |
| Dual-daemon guard | Production-ready | heartbeat.ts |

**Type safety:** 0 errors. **Tests:** 675/675 passing.

---

## Root Causes (grouped)

### RC-1: Declared-But-Not-Wired Daemon Integration (CRITICAL)

Three exported functions are never called at runtime:

| Function | File | Impact |
|----------|------|--------|
| `setDaemonProjectId()` | heartbeat.ts:1000 | Daemon logs 'global' as projectId |
| `setDaemonProjectDir()` | heartbeat.ts:1004 | Daemon writes to global `~/.voidforge/` paths |
| `configurePaths()` | daemon-process.ts:338 | PID/socket/state stay at global paths |

**Root cause:** M2 built the functions but the CLI entry point (`voidforge.ts` heartbeat command) was not updated to parse `--project-dir` and call them before `startHeartbeat()`. Per-project daemon infrastructure exists but the ignition key is missing.

### RC-2: Deferred Items Marked Complete (HIGH)

5 items from the ROADMAP were not implemented but campaign state shows 7/7 COMPLETE:

| Item | Mission | Gap |
|------|---------|-----|
| Unit tests for dashboard-data.ts | M1 | 0 tests (10 functions untested) |
| Treasury summary file | M3 | Not implemented (still O(n) JSONL scan) |
| Migration CLI | M3 | No `migrate treasury --project=<id>` command |
| Remove old WebSocket paths | M5 | `/ws/danger-room` and `/ws/war-room` still active |
| Integration tests | M6 | No cross-project isolation tests |

### RC-3: WebSocket Project Scoping Incomplete (MEDIUM)

- Subscription rooms work (`broadcast(data, projectId?)` filters correctly)
- But no code extracts `projectId` from the WS upgrade URL and passes it to `handleUpgrade()`
- Old global paths still active — clients connecting to `/ws/danger-room` receive all broadcasts
- Agent activity watcher broadcasts globally without `projectId`

### RC-4: Pre-existing Pattern Stubs (LOW — unchanged)

6 stub throws in `ad-billing-adapter.ts` (Google/Meta HTTP implementation placeholders). Pre-existing, documented, not v22.0 scope.

---

## PRD Alignment

Against ROADMAP.md v22.0 section (25 bullet points):

| Category | Count | % |
|----------|-------|---|
| Fully implemented | 18 | 72% |
| Partially implemented | 2 | 8% |
| Not implemented | 5 | 20% |

The 72% covers all architecturally significant work. The 20% gap is testing, migration tooling, and WebSocket cleanup — important but not structural.

---

## Remediation Plan

| Priority | Root Cause | Impact | Action | Effort |
|----------|-----------|--------|--------|--------|
| **P0** | RC-1: CLI --project-dir wiring | Per-project daemons write to wrong paths | Wire `configurePaths()` + `setDaemonProjectDir()` + `setDaemonProjectId()` into heartbeat start command | Small (1 file) |
| **P1** | RC-3: WebSocket project extraction | Cross-project data leakage | Extract projectId from WS upgrade URL, pass to handleUpgrade(), remove old global paths | Medium (2 files) |
| **P1** | RC-2: Zero dashboard-data.ts tests | No safety net for 10 critical functions | Write unit tests | Medium (1 new file) |
| **P2** | RC-2: Migration CLI | Existing users can't migrate treasury | Implement `migrate treasury --project=<id>` | Medium (1 new command) |
| **P2** | RC-2: Treasury summary file | O(n) scan per poll (Torres P0) | Daemon writes treasury-summary.json | Small (heartbeat.ts) |
| **P3** | RC-3: Activity broadcast unscoped | Operational info cross-project | Add projectId to broadcasts | Small |
| **P3** | RC-2: Integration tests | No E2E verification | Write cross-project isolation tests | Large (new test file) |

---

## Severity Summary

| Severity | Count | Notes |
|----------|-------|-------|
| Critical | 1 | RC-1: Daemon CLI wiring (functions exist but never called) |
| High | 1 | RC-2: 5 deferred items marked complete |
| Medium | 1 | RC-3: WebSocket project scoping incomplete |
| Low | 1 | RC-4: Pre-existing pattern stubs (not v22.0) |
| **Total** | **4** | |

---

## Recommendation

**Needs remediation first (Phase 0).**

The v22.0 architecture is sound and 72% of planned work is production-ready. But **P0 (daemon CLI wiring) is a hard blocker** — without it, per-project daemons silently write to global paths, defeating the entire point of financial isolation.

**Suggested release path:**
1. **P0 fix** — wire `--project-dir` into CLI heartbeat command (~30 min)
2. **P1 fixes** — WebSocket paths + dashboard-data tests (~2 hours)
3. **Ship v22.0.0**
4. **P2-P3** as v22.0.1-v22.0.3 patches
