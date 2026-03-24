# VoidForge — Tech Debt Catalog

**Version:** 15.2.1
**Last reviewed:** 2026-03-23

## Resolved (since v2.7.0)

| Item | Resolved In | How |
|------|-------------|-----|
| No provision crash recovery | v2.6.0 | ADR-001: provision manifests |
| Non-atomic vault writes | v2.6.0 | ADR-002: temp+fsync+rename |
| Unvalidated API responses | v2.7.0 | ADR-003: response validation |
| No SSE keepalive | v2.7.0 | ADR-004: keepalive timer |
| `sendJson` duplicated in 10 API files | v15.1.0 | Consolidated to http-helpers.ts |
| Fallback model ID stale | v7.6.0 | Updated to claude-sonnet-4-6 |
| Flat vault namespace | v7.5.0 | `env:` prefix scoping |
| Native module restart detection | v7.7.0 | Mtime detection + restart banner |
| Stale PTY session cleanup | v7.6.0 | Auto-cleanup on <2s failure |
| Provisioner registry duplicated | v15.1.0 | provisioner-registry.ts |
| tower-auth.ts God module (636 lines) | v15.2.0 | Split into 3 modules (424+149+87) |
| No vault brute-force protection | v15.1.0 | Rate limiting (5/min, lockout after 10) |
| Terminal HMAC keyed with vault password | v15.1.0 | Per-boot random 32-byte key |
| Production code importing from docs/patterns/ | v15.1.0 | 6 proxy modules in wizard/lib/ |
| experiment.ts no write serialization | v15.1.0 | serialized() queue + fsync |
| provision-manifest.ts no atomic writes | v15.1.0 | atomicWriteManifest helper |
| autonomy-controller.ts no atomic writes | v15.1.0 | temp+fsync+rename + serialization |

## Current

| # | Item | Type | Impact | Effort | Urgency |
|---|------|------|--------|--------|---------|
| 1 | No truncated PRD detection | Missing check | Medium — user gets partial PRD | Low | Low |
| 2 | No project creation rollback | Missing check | Low — partial directory on error | Low | Low |
| 3 | `.env` append logic duplicated | Missing abstraction | Low — maintenance | Low | Low |
| 4 | `recordResourceCleaned` never called | Dead code | Low — confusion | Trivial | Low |
| 5 | No vault schema versioning | Deferred decision | Medium — blocks schema changes | Low | Later |
| 6 | Raw HTTPS vs AWS SDK inconsistency | Dependency debt | Low — two HTTP patterns | High | Later |
| 7 | PBKDF2 100k iterations (vault) vs 210k (auth) | Inconsistency | Low — both safe, but vault is weaker | Low | Later |
| 8 | heartbeat.ts handlers are stubs | Incomplete feature | Low — returns hardcoded 200 OK | High | When growth features are wired |
| 9 | 8 ad platform adapters are stubs | Incomplete feature | Low — methods throw "not implemented" | High | When ad platforms are connected |
| 10 | ARCHITECTURE.md stuck at v8.0.0 | Documentation debt | Medium — misleads contributors | Low | This version |
| 11 | FAILURE_MODES.md stuck at v8.0.0 | Documentation debt | Medium — missing v11-v15 systems | Low | This version |

## Recommended Next Actions

1. **#10, #11** — Documentation refresh is in progress (Campaign 19).
2. **#7** — Consider raising vault PBKDF2 from 100k to 210k iterations with vault version migration.
3. **#8, #9** — Leave as stubs until real platform integrations are needed. Testing stubs is waste.
