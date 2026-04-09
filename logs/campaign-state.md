# Campaign State — VoidForge Campaign 30 (v22.1 The Migration)

## Campaign Info

**Version:** v22.1
**Codename:** The Migration
**Mode:** `--blitz --muster`
**Source:** `ROADMAP.md` v22.1 section
**Architecture:** ADR-040 (project scoping), ADR-041 (Muster amendments)
**Started:** 2026-04-09
**Status:** COMPLETE

## Mission Plan

| # | Mission | Scope | Status | Debrief |
|---|---------|-------|--------|---------|
| M1 | Treasury Migration CLI | `voidforge migrate treasury --project=<id>` — pre-flight, archive, genesis, manifest, permissions, hash validation | **COMPLETE** | 10 tests |
| M2 | Treasury Summary File | Daemon writes treasury-summary.json (O(1) reads). Reader checks cache first, JSONL fallback. | **COMPLETE** | 10 tests |
| M3 | Per-Project Vault HKDF | HKDF-SHA256 key derivation per project. Project isolation, session cache, atomic writes. | **COMPLETE** | 25 tests |

Missions completed: 3/3.

## Results

- 3/3 missions: COMPLETE
- 741/741 tests passing (45 new tests)
- 0 TypeScript errors
- 4 Playwright E2E collection errors (pre-existing cosmetic noise)

## Files Created

- `packages/voidforge/wizard/lib/treasury-migrator.ts` — Migration CLI logic (pre-flight, archive, genesis, manifest)
- `packages/voidforge/wizard/lib/project-vault.ts` — Per-project HKDF vault (derive, encrypt, decrypt, cache)
- `packages/voidforge/wizard/__tests__/treasury-migrator.test.ts` — 10 tests
- `packages/voidforge/wizard/__tests__/treasury-summary-cache.test.ts` — 10 tests
- `packages/voidforge/wizard/__tests__/project-vault.test.ts` — 25 tests

## Files Modified

- `packages/voidforge/scripts/voidforge.ts` — Added `migrate treasury` subcommand routing + cmdMigrateTreasury()
- `packages/voidforge/wizard/lib/treasury-reader.ts` — O(1) summary cache read with O(n) JSONL fallback
- `packages/voidforge/wizard/lib/heartbeat.ts` — writeTreasurySummaryFile() called from writeCurrentState()
