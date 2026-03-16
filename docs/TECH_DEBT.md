# VoidForge — Tech Debt Catalog

**Version:** 2.7.0
**Last reviewed:** 2026-03-12

## Resolved

| Item | ADR | Resolved In |
|------|-----|-------------|
| No provision crash recovery | ADR-001 | v2.6.0 |
| Non-atomic vault writes | ADR-002 | v2.6.0 |
| Unvalidated API responses | ADR-003 | v2.7.0 |
| No SSE keepalive | ADR-004 | v2.7.0 |

## Current

| # | Item | Type | Impact | Effort | Urgency |
|---|------|------|--------|--------|---------|
| 1 | No truncated PRD detection | Missing check | Medium — user gets partial PRD without warning | Low | Next release |
| 2 | No project creation rollback | Missing check | Low — partial directory on disk full/permissions error | Low | Next release |
| 3 | `sendJson` duplicated in 6 API files | Missing abstraction | Low — maintenance | Low | Low |
| 4 | `.env` append logic duplicated across provisioners | Missing abstraction | Low — maintenance | Low | Low |
| 5 | `recordResourceCleaned` defined but never called | Dead code | Low — confusion | Trivial | Low |
| 6 | Fallback model ID `claude-sonnet-4-5-20241022` | Deferred decision | Low — used only when models API unreachable | Trivial | Check periodically |
| 7 | Flat vault namespace (no multi-project isolation) | Wrong abstraction | Medium — all projects share credentials | Medium | Later |
| 8 | No vault schema versioning | Deferred decision | Medium — blocks schema changes | Low | Later |
| 9 | Raw HTTPS vs AWS SDK inconsistency | Dependency debt | Low — two HTTP patterns to maintain | High | Later |
| 10 | PBKDF2 vs Argon2id for key derivation | Deferred decision | Low — PBKDF2 is still safe at 100k iterations | Medium | Much later |
| 11 | Native module updates require manual server restart | Missing capability | High — npm install updates disk but running process keeps old binary in memory. User must manually kill + restart. Terminal shows "Session ended" with no explanation. | Medium | v8.0 |
| 12 | Stale PTY sessions not cleaned on page reload | Missing cleanup | Medium — old dead sessions count against MAX_SESSIONS limit and show "Session ended" in Tower. No auto-cleanup or "Retry" button. | Low | Next release |

## Recommended Next Actions

1. **#1 — Truncated PRD:** If SSE stream ends without `[DONE]` or content is suspiciously short (<500 chars), show a warning banner.
2. **#2 — Project rollback:** On creation failure, attempt to delete the partially created directory.
3. **#5 — Dead code:** Either call `recordResourceCleaned` during cleanup, or remove it.
4. **#11 — Server auto-restart:** Detect when native modules change on disk (compare mtime of .node files at startup vs current). If mismatch, show banner in Lobby: "VoidForge updated — restart required. [Restart Now]". The restart button calls a server endpoint that executes graceful shutdown + re-exec (kills PTY sessions, then `process.execve()` to replace the process).
5. **#12 — Stale session cleanup:** Tower `init()` should check if the auto-created session actually connected successfully. If "Session ended" appears within 2 seconds of creation, auto-close the tab and try again once. After 2 failures, show: "Terminal failed to start. The VoidForge server may need to restart." with a link to the Lobby.
