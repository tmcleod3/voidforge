# VoidForge — Compatibility

**Version:** 15.2.1
**Node Engines:** `>=20.11.0 <25.0.0`

## Claude Code Platform Floor (ADR-065)

VoidForge runs *inside* Claude Code and depends on platform features — a floor separate from the Node.js one below.

| Feature | Used for | Maturity | Min Claude Code |
|---------|----------|----------|-----------------|
| `PreToolUse` hooks | Silver Surfer gate (ADR-051/060/064) | GA | **baseline (load-bearing)** |
| Subagents / Agent tool | all multi-agent commands (ADR-044) | GA | **baseline (load-bearing)** |
| `Workflow` tool | gate matcher (ADR-064); optional command re-platforming | GA | v2.1.154+ — *only if* a command is workflow-orchestrated |
| `effort` levels | per-agent spend tuning (ADR-054 — policy only, not yet enforced) | GA | verify before fleet adoption |

**Baseline floor:** the load-bearing features (hooks + subagents) require a Claude Code version where both are GA, recorded as the informational, non-enforced `claudeCodeFloor` field in `packages/methodology/package.json`. **Operator-confirm the exact baseline version** — it is set conservatively pending confirmation (AGENT_INVENTED per `/architect` Step 4.5).

**Semver rule (ADR-065):** raising the platform floor is a **breaking change** — bump MAJOR, or flag the MINOR with a `⚠ raises Claude Code floor` CHANGELOG banner. A beta/preview platform feature must never become load-bearing in a GA scaffold-tier release; keep it Full-tier / opt-in until GA.

---

## Node.js

## Tested Versions

| Node.js | Status | Notes |
|---------|--------|-------|
| 20.x LTS | Supported | Minimum version |
| 22.x LTS | Supported | Recommended |
| 24.x | Supported (with caveats) | node-pty required v1.2.0-beta.12+ |
| 25.x | Untested | Update engines field when node-pty ships support |

## Known ABI-Breaking Changes

### Node.js v24 — node-pty ABI Break (v7.2→v7.3)

**Date:** 2026-03-16
**Impact:** Terminal sessions fail with "posix_spawnp failed" or "Session ended" immediately.
**Root cause:** `node-pty@1.1.0` prebuilt binary was incompatible with Node.js v24's native addon ABI.
**Fix:** Upgraded to `node-pty@1.2.0-beta.12` which ships prebuilt binaries for Node v24.
**Time to fix:** 8 commits, multiple hours of debugging. The Gauntlet (static analysis) passed 6/6 — this was invisible to code review.

### Node.js v24 — Custom WebSocket Handshake (v7.2→v7.3)

**Date:** 2026-03-16
**Impact:** WebSocket connections never established; `ws.onopen` never fired.
**Root cause:** Custom RFC 6455 handshake implementation was correct per spec but incompatible with Node v24's HTTP upgrade internals.
**Fix:** Replaced 200 lines of custom WebSocket code with `ws` library (2-line import).
**Lesson:** Never implement standard protocols manually. Use established libraries.

### Node.js v24 — IPv6 Resolution (v7.3)

**Date:** 2026-03-16
**Impact:** WebSocket still failing after ws migration.
**Root cause:** Server bound to `127.0.0.1` only; macOS resolves `localhost` to `::1` (IPv6) first.
**Fix:** Changed server bind from `127.0.0.1` to `::` (dual-stack).

## Engines Field Policy

The `engines` field in `package.json` defines the supported Node.js range:

```json
"engines": {
  "node": ">=20.11.0 <25.0.0"
}
```

### Dev Dependencies (v15.1+)

| Package | Purpose | Required? |
|---------|---------|-----------|
| `vitest` | Test framework (91 tests, --pool forks) | Dev only |
| `tsx` | TypeScript execution (no build step) | Dev only |
| `typescript` | Type checking (`npm run typecheck`) | Dev only |

**When to update:**
1. When node-pty and ws both ship prebuilt binaries for a new Node.js major version
2. Test: run `npx voidforge-build init`, open Avengers Tower, verify terminal works
3. Update the upper bound to include the new version
4. Update this document with the test results

**When NOT to update:**
- Don't bump the lower bound without a compelling reason (breaks existing installs)
- Don't include a Node.js version you haven't tested with PTY sessions
