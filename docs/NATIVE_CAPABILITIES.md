# Native Capabilities Tracker (ADR-066)

The standing audit ADR-050 deferred and never created. It records every VoidForge slash command against the current Claude Code **native** skill/command set, the surface(s) where a native capability could shadow ours, and the **disposition** for each. Re-audit at every release (see `RELEASE_MANAGER.md`).

> **Why this matters.** On surfaces with project-local command resolution (the CLI in a VoidForge repo) a same-named `.claude/commands/*.md` wins. On surfaces *without* it (claude.ai web, some IDE extensions) a colliding **native** skill can win instead — running ungated and without VoidForge's semantics. ADR-050 renamed `/review`→`/engage` and `/security`→`/sentinel` for exactly this reason.

**Audited:** 2026-06-13 against the mid-2026 native set (`/init`, `/review`, `/security-review`, `/code-review`, `/test`, `/qa`-class, `/commit`, `/debug`, `/deep-research`, plus built-ins).

## Dispositions

| VoidForge command | Native collision | Disposition | Notes |
|---|---|---|---|
| `/engage` (was `/review`) | native `/review`, `/code-review` | **rename+alias (done, ADR-050)** | `/review` kept as a permanent alias to `/engage` |
| `/sentinel` (was `/security`) | native `/security-review` | **rename+alias (done, ADR-050)** | `/security` kept as a permanent alias to `/sentinel` |
| `/qa` | native `/qa`-class (regression) | **coexist + document** | Batman's multi-round review ≠ native regression skill. CLI project-local resolution wins; on web/IDE invoke the gated flow explicitly. Rename deferred (iconic; high churn) — recorded as an option if web-surface confusion is reported. |
| `/test` | native `/test` (coverage/test-writing) | **coexist + document** | Batman's test-architecture mode. Same surface caveat as `/qa`. Rename deferred. |
| `/git` | native `/commit` | **keep (coexist)** | Native `/commit` is narrower than Coulson's full release management (version/changelog/tag/publish/branch-sync). Low collision; no rename. |
| `/deploy`, `/devops` | — | keep | no native equivalent |
| `/build`, `/assemble`, `/campaign`, `/gauntlet` | — | keep | VoidForge-specific orchestration |
| `/architect`, `/assess`, `/prd`, `/blueprint` | — | keep | no native collision |
| `/debrief`, `/audit-docs`, `/vault`, `/ai`, `/imagine` | — | keep | no native collision |
| `/void`, `/thumper`, `/dangerroom`, `/cultivation`, `/grow`, `/current`, `/treasury`, `/portfolio`, `/ux` | — | keep | no native collision |

**Coverage rule (ADR-066 verification gate):** every command in `.claude/commands/*.md` must appear in this table with a disposition. A newly-added command without a row fails the audit. (Aliases `/review`, `/security` resolve to their canonical rows above.)

## Re-audit checklist (each release)

1. List the current native bundled skills/commands (platform docs).
2. Diff against this table; any **new** native collision with a VoidForge command requires a recorded disposition before ship.
3. Confirm every `.claude/commands/*.md` has a row.

## Related

- **ADR-050** — Native Claude Code coexistence (the `/review`→`/engage`, `/security`→`/sentinel` renames; deferred this tracker).
- **ADR-065** — platform version floor + maturity tags (sibling "platform-reality vs methodology-claim" discipline).
