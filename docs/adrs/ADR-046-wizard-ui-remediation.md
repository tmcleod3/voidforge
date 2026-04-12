# ADR-046: Wizard UI Remediation

## Status: Accepted

## Context

A combined architecture + UX audit of all 21 wizard UI files (9 HTML, 11 JS, 1 CSS) revealed 25 findings across 4 severity levels. The wizard UI has accumulated technical debt over 100+ versions — feature descriptions, numeric claims, API endpoints, and accessibility patterns have not kept pace with the server-side evolution.

Three critical findings affect production functionality:
1. `danger-room.js` and `war-room.js` still use legacy `/api/danger-room/*` and `/api/war-room/*` endpoints that 404 in remote/LAN mode (v22.0 migrated to project-scoped `/api/projects/:id/danger-room/*`)
2. The freeze button (`/api/danger-room/freeze`) has no legacy shim — it always 404s
3. Both standalone dashboard pages are already deprecated with banners pointing to the project dashboard

Four high-severity accessibility violations affect WCAG compliance:
1. Step 3 validation uses color-only error indication (no text, no aria-invalid)
2. PRD tabs lack arrow key keyboard navigation (WAI-ARIA Tabs pattern)
3. Three different tab implementations with inconsistent keyboard support
4. Deploy wizard lacks consistent footer navigation

## Decision

Remediate the wizard UI in a single campaign (v23.4) with 6 missions:

**M1: Critical API fixes** — Remove standalone danger-room.js/war-room.js legacy API calls. Since both pages show deprecation banners directing to project.html, redirect the standalone pages to the project dashboard instead of maintaining broken legacy endpoints.

**M2: --blitz retirement** — Remove retired `--blitz` flag from all 5 UI locations. Replace with the default behavior (just `/campaign`).

**M3: WCAG compliance** — Fix all 4 high-severity a11y issues: validation error messages, tab keyboard navigation, deploy wizard navigation.

**M4: Content accuracy** — Fix stale counts in CLAUDE.md (35→37 patterns), ROADMAP.md (741→1340 tests), stale step label, cultivation command inconsistency, dead GitHub link.

**M5: UX improvements** — Fix medium-severity UX issues: blueprint dismiss, lobby error vs empty state, Tower CDN retry, showStatus consistency.

**M6: Victory Gauntlet** — Full test suite, a11y verification, cross-page navigation audit.

## Consequences

- Standalone danger-room.html and war-room.html become redirects to project.html (breaking change for bookmarks, but pages were already deprecated)
- All tab interactions become keyboard-accessible
- Form validation becomes WCAG 2.1 AA compliant
- No more stale numeric claims in UI copy

## Alternatives

1. **Fix legacy endpoints instead of redirecting** — Rejected. Maintaining two API surfaces (legacy + project-scoped) doubles the bug surface. The deprecation banners already tell users to migrate.
2. **Leave standalone pages as-is since they're deprecated** — Rejected. The freeze button being broken is a safety concern. Redirecting is safer than leaving broken safety controls accessible.
3. **Split into multiple versions** — Rejected. All fixes are in the same UI files. One atomic version avoids partial-fix states.
