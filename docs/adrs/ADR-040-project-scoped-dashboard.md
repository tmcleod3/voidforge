# ADR-040: Project-Scoped Dashboard Architecture

## Status: Accepted

## Context

The v21.0 extraction made the wizard a standalone multi-project application. But the UI still assumes a single-project model:

- Danger Room reads from `import.meta.dirname` (npm package, not a project)
- Danger Room button is in the Lobby top nav (global, not project-scoped)
- War Room is global, not per-project
- Financial paths (TREASURY_DIR, SPEND_LOG, REVENUE_LOG) are global at `~/.voidforge/treasury/` — multiple projects collide
- Dashboard functions accept no `projectDir` parameter
- The server has no concept of "current project"

The daemon-aggregator (Campaign 26 Mission 6) already models the correct architecture: it discovers projects from the registry, connects to per-project sockets, and aggregates. But the UI doesn't reflect this.

## Decision

### 1. Everything is project-scoped

The navigation model flips from global-first to project-first:

```
Lobby (project list + aggregated KPIs)
  └── Project Dashboard (per-project)
        ├── Overview (build state, git status, version)
        ├── Tower (terminal — already project-scoped)
        ├── Danger Room (THIS project's health, campaigns, heartbeat)
        ├── War Room (THIS project's campaign proposals)
        └── Deploy (THIS project's deploy target)
```

The Lobby still shows an "All Projects" aggregated view (total spend, combined ROAS, online/offline daemon count) using the daemon-aggregator. But clicking into a project enters a project-scoped context where all data comes from THAT project's directory.

### 2. Financial data moves to per-project paths

**Before (global):**
```
~/.voidforge/treasury/
  spend-log.jsonl      ← ALL projects mixed
  revenue-log.jsonl    ← ALL projects mixed
  campaigns/           ← ALL campaigns mixed
```

**After (per-project):**
```
~/Projects/my-app/cultivation/treasury/
  spend-log.jsonl      ← Only this project
  revenue-log.jsonl    ← Only this project
  campaigns/           ← Only this project's campaigns
```

This is where the extension installer ALREADY creates the directory (Campaign 26 Mission 4). The data just needs to be written there instead of `~/.voidforge/`.

### 3. Daemon files are per-project (already correct)

The daemon-aggregator already looks for sockets at `project/cultivation/heartbeat.sock`. The fix: make the heartbeat daemon WRITE its state there too, not to `~/.voidforge/`.

### 4. Global vault stays global

Credentials (API keys, platform tokens) are user-scoped, not project-scoped. One Stripe account, one Google Ads account. The vault at `~/.voidforge/vault.enc` stays global. Per-project vault encryption deferred to v22.0 (Kenobi's HKDF proposal from the original PRD).

### 5. Server context: active project

The server needs to know which project is "active" for the dashboard. Two approaches:

**A. URL-based routing** (recommended): `/api/projects/:id/danger-room/campaign`
- Clean, RESTful, supports multiple tabs viewing different projects
- The project ID comes from the `.voidforge` marker or registry

**B. Session-based context** (simpler): Server stores "active project" and all API calls use it
- Simpler but only one project viewable at a time
- Switching projects in the Lobby changes the server context

Decision: **URL-based routing** — it's more work but correct for a multi-project tool.

## Consequences

**Enables:**
- Multiple projects visible simultaneously
- Per-project financial isolation (no data collision)
- Danger Room shows real project data, not npm package files
- War Room proposals scoped to one project's campaigns
- Clean URL structure for bookmarking/sharing project views

**Requires:**
- Refactor all dashboard-data.ts functions to accept projectDir
- Refactor all API routes to use project ID routing
- Move financial constants from global to per-project
- Update Lobby UI to show project cards with drill-down
- Update Danger Room UI to receive project context
- Migrate any existing global financial data to per-project dirs

**Trade-offs:**
- Existing `~/.voidforge/treasury/` data needs migration
- More complex API surface (project ID in every route)
- Lobby aggregation requires the daemon-aggregator (already built)

## Alternatives Considered

1. **Keep global dashboard, filter by project:** Rejected because the data paths are wrong (npm package, not project). Even with filtering, the reads come from the wrong directory.

2. **Session-based project context:** Rejected because it prevents viewing two projects simultaneously and creates confusing state (which project am I looking at?).

3. **Defer to v22.0:** Rejected because the Danger Room is completely non-functional in v21.0 — it reads from the npm package. This is not a nice-to-have; it's broken.
