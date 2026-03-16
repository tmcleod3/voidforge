# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

---

## [7.4.0] - 2026-03-16

### Added
- **Runtime smoke test** in Gauntlet Round 2 — start server, hit endpoints, test WebSocket lifecycle. Catches what static analysis misses. (Field report #30)
- **First-run scenario checklist** in QA — fresh install, server restart, project import, dependency update transitions. (Field report #30)
- **Restart resilience checklist** in DevOps — inventory in-memory state, define recovery paths. (Field report #30)
- **Campaign-mode assemble pipeline** — reduced phases (arch + build + 1 review + security if needed) for multi-mission campaigns. Full pipeline deferred to Victory Gauntlet. (Field report #26)
- **Lightweight inline debrief** option for blitz — 3-line summary to log file when full `/debrief --submit` is too heavy. (Field report #26)
- **Minimum 1 review round guarantee** — even `--fast` gets 1 review, never 0. (Field report #28)

### Changed
- **Direct-ID entity access** is now High severity minimum in security audit — never defer. (Field report #28)
- **Role enforcement** must cover ALL write routes, not just CRUD — batch, merge, import/export, admin utilities. (Field report #28)
- **Admin self-referential case** added to UX checklist — disable destructive actions on own user row. (Field report #28)
- **SQL fragment builders** must accept alias parameter from day 1 — breaks in JOINs without it. (Field report #28)
- **Per-item processing** for unreliable inputs — individual items with timeouts, not batch. (Field report #27)
- **Cache AI agent outputs** — reuse cached intermediate results to prevent cross-generation drift. (Field report #27)
- **Server components for content pages** — "use client" on marketing pages kills SEO. (Field report #27)
- **Background operations need visible progress** — loading state, progress indicator, completion notification. (Field report #27)
- **Mode instructions must replace, not append** — each mode needs complete spec, not a footnote. (Field report #27)
- **Platform networking** — bind `::` (dual-stack) not `127.0.0.1`. macOS resolves localhost to IPv6. (Field report #30)
- **Tailwind v4 deployment guide** — pin versions, restrict source scanning, avoid `attr()` in CSS. (Field report #29)
- **Don't interleave debugging with syncs** — sync first, verify, THEN debug separately. (Field report #29)
- **Infrastructure dependency exception** — zero-dep policy applies to business logic, not protocol infrastructure (ws, node-pty). (Field report #30)

---

## [7.3.2] - 2026-03-16

### Changed
- **Blitz debrief is now a blocking gate** — `/debrief --submit` must complete before the campaign loop continues. Previously it was a suggestion that agents skipped in velocity mode. Now it blocks progression. (Field reports #24, #25)
- **Blitz per-mission checklist** added to campaign command header — 5 mandatory items (assemble, git, debrief, state update, proceed) that must be verified before each loop-back.
- **Blitz mode documented in CAMPAIGN.md method doc** — full section under "Two Modes" explaining what blitz changes, what it preserves, and that `--blitz ≠ --fast`. (Field report #25)
- **Debrief issue tracking** in campaign state — mission table now includes debrief issue number column.
- **Blitz privacy exception** in FIELD_MEDIC.md — user opted into autonomous mode, so auto-submit is permitted without review. (Field report #25)
- **Blitz checkpoint enforcement** — explicit mission counter instruction in Step 4.5 with mandatory logging. (Field report #23)
- **"No questions in blitz"** rule — all decisions autonomous, choose quality-preserving option when uncertain. (Field report #23)
- **Tier enforcement extended to UI components** — QA now greps `.tsx`/`.jsx` for hardcoded tier comparisons. (Field report #22)
- **Action inventory before hiding containers** — UX redesigns must list all primary AND secondary actions before collapsing/hiding a component. (Field report #22)
- **Test schema vs. production schema** check — verify test fixtures create all tables from migration runner. (Field report #21)
- **Timestamp format enforcement** — QA greps for non-canonical `strftime`/format calls. (Field report #21)
- **Auth retrofit audit** — when adding auth to a router, audit ALL existing endpoints in that file. (Field report #21)

---

## [7.3.1] - 2026-03-16

### Changed
- **`/campaign --blitz` now auto-debriefs after every mission.** In blitz mode, `/debrief --submit` runs automatically after each mission completes, filing a GitHub field report with learnings while context is fresh. No user review needed — blitz trusts the output. Run `/debrief --inbox` on the upstream repo later to triage accumulated reports. This is the missing feedback loop for autonomous builds: every mission's failures, patterns, and methodology gaps are captured even when nobody is watching.

---

## [7.3.0] - 2026-03-16

### Added
- **`/campaign --blitz`** — Fully autonomous campaign mode. Skips mission confirmation prompts, implies `--fast`, auto-continues between missions. Victory Gauntlet still mandatory. Use when you want to click "Start Building" and walk away.
- **Lobby build-state indicator** — Project cards show contextual buttons: "Start Building" (Phase 0), "Resume Build" (Phase 1-12), "Open Room" (built/deployed). Color-coded badge shows current state.
- **Tower vault unlock form** — When the vault is locked (server restart, import), the Tower shows an inline password form instead of a cryptic error. Unlock → auto-retries terminal creation.
- **Tower auto-send countdown** — After Claude Code launches, a 3-second countdown auto-types the command (e.g., `/campaign --blitz`). Cancel button available.

### Fixed
- **WebSocket terminal connection** — Replaced custom WebSocket implementation with the `ws` library (same as VS Code). The custom handshake was incompatible with Node.js v24's HTTP internals, causing `code 1006` connection failures in all browsers.
- **IPv6 localhost binding** — Server now binds to `::` (dual-stack) in local mode. macOS resolves `localhost` to `::1` (IPv6 first); binding to `127.0.0.1` broke WebSocket connections.
- **PTY Enter key** — Auto-send used `\n` (line feed) instead of `\r` (carriage return). PTY terminals require `\r` to simulate the Enter key.
- **Build status "Live" false positive** — Projects with a `deployUrl` set during wizard setup (intended domain) showed as "Live" even at Phase 0. Now requires both `deployUrl` AND `lastDeployAt` to confirm actual deployment.
- **Static file caching** — Added `Cache-Control: no-cache, must-revalidate` to static file responses. Prevents browsers from serving stale JS after server updates.
- **CSP connect-src** — Added `https://cdn.jsdelivr.net` to allow xterm.js source map fetching.

### Changed
- **Claude Code in Tower** now launches with `--dangerously-skip-permissions` for autonomous operation.
- **`ws` + `@types/ws`** added as dependencies (replaces 200+ lines of custom WebSocket code).

---

## [7.2.1] - 2026-03-15

### Fixed
- **Avengers Tower terminal crash on Node.js v24** — `posix_spawnp failed` error when opening terminal. Upgraded `node-pty` from 1.1.0 to 1.2.0-beta.12 which includes prebuilds compatible with Node v24's ABI.

---

## [7.2.0] - 2026-03-15

### Added
- **Third-party script loading pattern** — Three-state pattern (loading/ready/error) for external script dependencies (`docs/patterns/third-party-script.ts`)
- **v8.0-v9.0+ roadmap** — The Hive Mind (Agent Memory, Conflict Prediction, `/prd`), The Evolution (Self-Improving Methodology, Agent Specialization), The Autonomy (`/campaign --autonomous`), The Horizon (Pattern Evolution, Cross-Project, Multi-Language)
- **7 enchantment animations** — Forge-lit pulse on vault unlock, streaming cursor for PRD generation, success icon pop, directional step transitions, primary button gradient glow, subtitle delayed fade-in, status message slide-in

### Changed
- **Vault password minimum raised to 8 characters** — was 4, now consistent with security best practices (server + client)
- **TOTP validation enforces exactly 6 digits** — rejects alphabetic and short/long codes per RFC 6238
- **Provisioning concurrency lock** — check-and-set is now synchronous (same event loop tick), preventing TOCTOU race on concurrent requests
- **Manifest writes serialized** — all mutation functions in provision-manifest.ts now use write queue, preventing race conditions
- **PTY cols/rows clamped before spawnOptions** — consistent with resize clamping, prevents oversized terminal dimensions
- **ANTHROPIC_API_KEY excluded from remote PTY** — operator's API key no longer leaks to deployer-role terminal sessions
- **11 methodology fixes** from 5 field reports: execution order verification (Gauntlet), Node.js mutex pattern (Backend), symlink resolution (Security), CSS animation replay (Frontend), cross-file flow tracing (Assembler), VERSION.md content checks (Forge Keeper + void), .claude/settings.json in /void "Never touch" list

### Security
- **HSTS header** in remote mode (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- **Vault cache timing-safe comparison** — uses `timingSafeEqual` instead of `===` for password check
- **UUID validation on manifest runId** — prevents path traversal via crafted cleanup requests
- **Symlink resolution** in project import — `fs.realpath()` prevents symlink attacks pointing outside project directory

### Fixed
- **Skip navigation link** added for keyboard/screen reader users (WCAG 2.1 AA)
- **ARIA tab linkage** — PRD tabs have ids, aria-controls, and aria-labelledby
- **Section aria-labelledby** — all wizard step sections linked to their headings
- **noscript fallback** — shows clear message when JavaScript is disabled
- **--text-muted contrast** raised from #767676 to #8a8a8a (5.76:1 ratio, WCAG AA compliant)
- **Heading "Describe Your Vision"** replaces "Product Requirements" — matches PRD three-act language
- **Backward animation direction** — navigating from step 5 to 4b now plays slide-left (not slide-right)
- **Forge-lit animation replay** — vault unlock pulse replays correctly on repeated attempts via reflow trick

---

## [7.1.0] - 2026-03-15

### Added
- **Operations menu** — Act 3 presents expandable cards: Deploy Target, Cloud Credentials, Domain & Hostname, Resilience Pack. Pick what you need, skip the rest.
- **Resilience Pack** — 10 opt-in toggles for operational hardening: multi-env, preview deploys, auto-rollback, migrations, backups, health check, graceful shutdown, error boundaries, rate limiting, dead letter queue.
- **Live header** — Shows "Gandalf — [Project Name]" as you type.

### Changed
- **Three-act wizard flow** — "Secure Your Forge" (vault → API key) → "Describe Your Vision" (project → PRD) → "Equip Your Project" (operations menu). Vault and API key split into separate focused screens. Domain/hostname moved to operations menu.
- **Act-based progress labels** — "Act 1 — Secure Your Forge" instead of "Step 3 of 7".

### Removed
- **Simple/Advanced toggle** — Eliminated. Every user gets the same flow; configure depth via the operations menu.

---

## [7.0.1] - 2026-03-15

### Changed
- **Gandalf wizard redesigned as Three-Act Flow** — identity (vault + key), vision (name + PRD), operations (menu of cards). Eliminates simple/advanced toggle. Éowyn's enchantment notes woven into each act.
- **v4.3 reclassified as "The Resilience Pack"** — opt-in card in Gandalf's Act 3 operations menu with 10 toggles (5 deploy + 5 runtime resilience). Smart defaults based on deploy target and framework.
- **v7.1 "The Redesign" added to ROADMAP** — implementation plan for the wizard UX overhaul.

### Fixed
- **SSRF bypass checklist** added to Kenobi's security audit — octal IPs, decimal IPs, IPv6, DNS rebinding, URL scheme bypass (field report #12).
- **AI output sanitization checklist** added — nested structure handling, secure fallback paths, isolated-vm requirement, sandbox escape test (field report #11).
- **"Grep for siblings" rule** added to Batman's QA Pass 2 and Gauntlet fix batches — fix ALL instances of a pattern, not just the one reported (field reports #11 + #12).
- **Encoding variant check** added to Gauntlet fix batch protocol — verify security filters handle all name encodings (field report #12).
- **Enum consumer sweep** added to Build Protocol Phase 5 — grep all consumers when adding new enum values (field report #11).
- **Cross-surface consistency sweep** added to Build Protocol Phase 8 — search all surfaces when changing pricing/tiers/counts (field report #11).
- **Kusanagi added to Gauntlet Round 1** — infrastructure issues discovered earlier, not deferred to Round 3 (field report #11).
- **Whitelist-over-blocklist** documented as general security principle in Kenobi's method doc (field report #12).

---

## [7.0.0] - 2026-03-15

### Added
- **The Penthouse — Multi-User RBAC** — Three roles (admin, deployer, viewer) with invitation-only user creation. TOTP mandatory. ROUTE_ROLES middleware enforces role hierarchy on every API endpoint.
  - `wizard/lib/user-manager.ts` — User CRUD, invitation system (24h tokens, single-use, timing-safe comparison), `hasRole()` hierarchy, `hasProjectAccess()` per-project checks.
  - `wizard/api/users.ts` — User management endpoints: list, invite, complete-invite, remove, role change. All admin-gated with defense-in-depth.
- **Per-Project Access Control** — Project ownership and access lists. Each project has an owner and a list of `{ username, role }` entries. Queries filtered by access — users only see projects they own or have been granted access to.
  - `grantAccess()`, `revokeAccess()`, `getProjectsForUser()`, `checkProjectAccess()` in project-registry.
  - Access management modal in Lobby UI with focus trap, Escape handler, DOM-safe event binding.
  - Role badges on project cards (Owner/Deployer/Viewer).
- **Linked Services** — Bidirectional project linking for monorepo orchestration. BFS group resolution with cycle detection. Coordinated deploy checks across linked services.
  - `wizard/lib/deploy-coordinator.ts` — `checkDeployNeeded()`, `getDeployPlan()` with audit.
  - Link/unlink API endpoints with dual-ownership verification.
  - Link management modal in Lobby UI.
- **Rollback Dashboard** — Deploy history panel in Avengers Tower with collapsible sidebar, keyboard navigation (Escape to close), `aria-expanded`/`aria-controls`.
  - `wizard/ui/rollback.js` — viewer-gated deploy history display.
- **Cost Tracker** — Aggregate monthly costs across all accessible projects via existing `monthlyCost` field. NaN/negative guard on writes.
  - `wizard/lib/cost-tracker.ts` — `getAggregateCosts()`, `setProjectCost()`.
  - Lobby Penthouse footer fetches real cost data from API.
- **Agent Memory** — Cross-project lesson storage for methodology learning. 1000-entry cap with oldest-eviction. Serialized writes, atomic file ops.
  - `wizard/lib/agent-memory.ts` — `addLesson()`, `getLessons()`, `getRelevantLessons()`.
  - `~/.voidforge/lessons.json` (0600 permissions).
- 4 Architecture Decision Records: ADR-028 (RBAC), ADR-029 (per-project access), ADR-030 (linked services), ADR-031 (observatory features).

### Changed
- `tower-auth.ts` — Extended for multi-user: `UserRole` type, `SessionInfo` return from `validateSession()`, role in sessions, `createUser()` accepts role, `removeUser()`/`updateUserRole()`/`listUsers()`/`getUserRole()` added, legacy user migration (pre-v7.0 users get `role: 'admin'`), username character validation (`/^[a-zA-Z0-9._-]+$/`), X-Forwarded-For takes rightmost IP.
- `server.ts` — ROUTE_ROLES middleware maps API paths to minimum roles. WebSocket upgrade uses `hasRole()` (not hardcoded string). CSRF error format standardized. User context propagated to handlers.
- `project-registry.ts` — `owner`, `access`, `linkedProjects` fields. `removeProject()` cleans up linked references. `removeUserFromAllProjects()` clears ownership on user deletion. BFS `getLinkedGroup()`.
- `pty-manager.ts` — `username` field in PtySession for audit trail.
- `terminal.ts` — Per-project access checks, user context extraction, session list filtered by ownership, kill endpoint with ownership check.
- `lobby.js` — Role-aware UI: conditional buttons per role, access/link modals with focus traps, cost display from API.
- `lobby.html` — Access modal, link modal, role badge styling, linked badge styling.
- `tower.html` — Rollback panel with a11y attributes.

### Fixed
- Tailwind v4 content scanning check added to Galadriel's UX method (field report #10).
- Platform Build Gate added to Kusanagi's DevOps method (field report #10).

### Security
- ROUTE_ROLES enforces minimum role on all 45+ API endpoints (defense-in-depth with handler-level checks).
- Per-project access returns 404 (not 403) to prevent information leakage.
- Invite tokens: 256-bit, timing-safe comparison, 24h expiry, single-use with rollback on failure.
- Terminal sessions filtered by user — deployers can only see/kill their own sessions.
- Viewer blocked from terminals (WebSocket + REST), deploy metadata, and write operations.
- User removal clears project ownership to prevent privilege escalation via username reuse.
- Session cookie always sets Secure flag in remote mode (not header-dependent).
- `ProjectAccessEntry.role` tightened to `'deployer' | 'viewer'` (admin grants blocked at API).
- 52 security/quality findings resolved across 4 missions + 2 Gauntlet checkpoints.

---

## [6.5.1] - 2026-03-15

### Changed
- **The Arthurian Retcon** — All Arthurian legend references removed from the codebase. VoidForge's identity is rooted in its declared fictional universes (Tolkien, Marvel, DC, Star Wars, Star Trek, Dune, Anime). Arthurian legend was never one of them.
  - **Merlin → Gandalf** (Tolkien) — Setup wizard is now Gandalf. *"I'm looking for someone to share in an adventure."* The wizard who kicks off the journey.
  - **Gandalf → Radagast** (Tolkien) — UX edge-cases sub-agent renamed to free the name. Radagast notices things at the boundaries others overlook.
  - **Camelot → Avengers Tower** (Marvel) — Browser terminal / operations console. Stark's HQ. Every project gets a floor.
  - **Great Hall → The Lobby** (Marvel) — Multi-project dashboard. Where you see every floor at a glance.
  - **Round Table → The Penthouse** (Marvel) — v7.0 multi-user coordination. Where the team meets. Top floor.
- 39 files modified, 5 files renamed, ~180 replacements across code + docs.

---

## [6.5.0] - 2026-03-15

### Added
- **Avengers Tower Remote** — self-hosted VoidForge with 5-layer security. Access your forge from any browser, anywhere.
  - `wizard/lib/tower-auth.ts` — Full authentication engine: PBKDF2 password hashing (210k iterations, NIST SP 800-63B), TOTP 2FA (RFC 6238 with replay protection), session management (in-memory only, 8-hour TTL, IP binding, single active session), rate limiting (5/min, 10-consecutive lockout for 30 min), serialized writes, periodic cleanup.
  - `wizard/api/auth.ts` — Login, logout, session check, initial setup endpoints. Runtime type validation, field length caps, Cache-Control: no-store on auth responses.
  - `wizard/ui/login.html` + `wizard/ui/login.js` — Login page with setup flow (first-time TOTP enrollment) and auth flow (username + password + TOTP). Keyboard accessible, autofill-friendly.
  - `wizard/lib/audit-log.ts` — Append-only JSON lines audit trail at `~/.voidforge/audit.log`. Logs: login attempts, sessions, vault events, terminal sessions, deploys, credential access. 10MB rotation. Never crashes the server.
  - `wizard/lib/provisioners/self-deploy.ts` — VoidForge self-deploy provisioner: installs Node.js, Caddy, PM2, creates forge-user, generates Caddy HTTPS config, starts VoidForge as a managed service.
  - ADR-027: Avengers Tower Remote 5-Layer Security Architecture.

### Changed
- `wizard/server.ts` — Auth middleware gates all routes in remote mode (exempt: login/setup/static). WebSocket upgrade validates Avengers Tower session. CSP includes `wss://` for remote WebSocket. CORS expanded for remote domain. Binds to `0.0.0.0` in remote mode.
- `wizard/lib/pty-manager.ts` — Remote mode: 20 max sessions (vs. 5 local), audit log integration (terminal_start/terminal_end), forge-user sandboxing.
- `wizard/ui/lobby.html` + `wizard/ui/lobby.js` — Auth-aware: shows username, logout button, redirects to login when unauthenticated.
- `scripts/voidforge.ts` — `--remote` flag (remote mode), `--self` flag (self-deploy), `--host` flag (domain name).

### Security
- Two-password architecture: login password (bcrypt/PBKDF2) ≠ vault password (AES-256-GCM). Compromised session cannot read credentials.
- TOTP replay protection: lastTotpStep tracked per user, codes rejected at or before last used step.
- Rate limiting with memory cleanup: periodic eviction of expired sessions and stale rate-limit entries.
- Setup endpoint rate-limited and serialized to prevent race-to-setup attacks.
- X-Forwarded-For only trusted in remote mode (behind Caddy reverse proxy).
- Auth store throws on corruption (prevents silent re-setup attack vector).
- Shell injection prevention in self-deploy: input validation + shell escaping.
- IP binding on sessions: mismatch invalidates session entirely.

---

## [6.0.0] - 2026-03-15

### Added
- **Avengers Tower Multi — The Lobby** — multi-project operations console. Dashboard shows all VoidForge projects with health status, deploy URL, framework badge, cost, and quick actions.
  - `wizard/lib/project-registry.ts` — CRUD for `~/.voidforge/projects.json`. Serialized writes (vault pattern), atomic file ops (temp + fsync + rename), backup before overwrite, field validation on read, MUTABLE_FIELDS allowlist on update.
  - `wizard/api/projects.ts` — REST API: list all, get by ID, import existing project, delete from registry. Runtime type validation on all inputs, path canonicalization via `resolve()`.
  - `wizard/ui/lobby.html` + `wizard/ui/lobby.js` — The Lobby dashboard with project cards, health indicators (color + text labels for WCAG 1.4.1), import modal with focus trap, keyboard-navigable cards, 30-second polling.
  - `wizard/lib/health-poller.ts` — Background health checks every 5 minutes. Parallel via `Promise.allSettled`, 5-second timeout per project, SSRF protection (private IP blocklist, redirect blocking, hex/octal/IPv6 coverage).
- **Import Existing Project** — `POST /api/projects/import` scans a directory for CLAUDE.md, PRD frontmatter, .env, build-state, and auto-detects framework from package.json/requirements.txt/Gemfile.
- **Back-to-Lobby navigation** in Avengers Tower — "← Lobby" button with session persistence confirmation.
- ADR-026: Project Registry and The Lobby Architecture.

### Changed
- Server landing page changed from Gandalf (`/index.html`) to The Lobby (`/lobby.html`). Gandalf still accessible via direct URL and "New Project" buttons.
- `wizard/server.ts` — health poller lifecycle (start on listen, stop before PTY cleanup), double-shutdown guard, CORS fix (non-matching origins get no allow-origin header).
- `wizard/api/project.ts` — registers new projects in registry, runtime type validation on all body fields, .env template injection prevention (newline stripping).
- `wizard/ui/tower.html` — ARIA landmarks (`<main>`, `role="alert"`), `:focus-visible` on buttons, `prefers-reduced-motion` support.

### Security
- SSRF prevention in health poller: URL scheme validation, private IP blocklist (IPv4, IPv6, hex, octal, decimal, 0.0.0.0, metadata endpoints), `redirect: 'manual'` to prevent redirect-based SSRF.
- CORS hardened: non-matching origins no longer receive `Access-Control-Allow-Origin` header.
- .env injection prevention: newlines stripped from all template-interpolated fields (name, description, domain, hostname, deploy target).
- Runtime type validation on `/api/project/create` body fields (was unsafe `as` cast).
- Registry file backup before every write (data loss prevention).

### Fixed
- **Field Report #9:** Rex (Kenobi's security team) now checks build output HTML for inline scripts before tightening CSP. Gauntlet adds build-output verification gate after every fix batch. Prevents framework-generated inline scripts (Next.js, Nuxt, SvelteKit) from being blocked by CSP changes.

---

## [5.5.0] - 2026-03-15

### Added
- **Avengers Tower Local** — browser terminal with real Claude Code. Never leave the browser.
  - `wizard/lib/pty-manager.ts` — PTY lifecycle management using `node-pty`. Spawns real shell processes, manages multiple sessions per project, 30-min idle timeout, max 5 concurrent sessions.
  - `wizard/api/terminal.ts` — WebSocket ↔ PTY bridge (raw RFC 6455 implementation). REST endpoints for session CRUD. Vault password required to establish connections.
  - `wizard/ui/tower.html` + `wizard/ui/tower.js` — browser terminal UI using xterm.js. Tabbed interface: multiple terminals per project (Claude Code, Shell, SSH). Auto-launches Claude Code on open. Resize handling, session reconnection on navigate-back.
  - "Open in Avengers Tower" button on Gandalf's done screen — transitions directly from project creation to browser terminal.
  - WebSocket upgrade handler in `wizard/server.ts` — routes `/ws/terminal` to PTY bridge.
  - Graceful shutdown: `killAllSessions()` on SIGINT/SIGTERM.
- New dependency: `node-pty` (~2MB native module, same as VS Code terminal)
- CSP updated to allow xterm.js CDN and WebSocket connections

---

## [5.0.0] - 2026-03-15

### Added
- **Lessons integration** — Wong extracts learnings after every `/assemble` run and appends to `LESSONS.md`. Lessons confirmed across 2+ projects are flagged for promotion to method docs. `/build` Phase 0 now loads relevant lessons from prior projects to inform the current build.
- **Build analytics** — `wizard/lib/build-analytics.ts` tracks metrics across projects: phase findings, fix-to-finding ratios, framework-specific trends. Stored at `~/.voidforge/analytics.json`. `surfaceTrends()` generates human-readable insights.
- **Smart scoping** — `/campaign` now orders missions complexity-first within dependency tiers. Hardest features (most integrations, edge cases, schema relationships) built first when energy is fresh; polish and admin later.
- **Project templates** — 4 curated starters: SaaS (Next.js + Stripe + teams), REST API (Express + Postgres), Marketing Site (Next.js + Tailwind), Admin Dashboard (Next.js + shadcn/ui). `npx voidforge init --template saas` or select in Gandalf wizard. `npx voidforge templates` lists all available.
  - New file: `wizard/lib/templates.ts` — template definitions with frontmatter, suggested integrations, and PRD scaffolding
  - New API: `GET /api/prd/templates`, `GET /api/prd/templates/get?id=saas`
  - New CLI: `npx voidforge templates` command

---

## [4.6.0] - 2026-03-15

### Added
- **`/debrief --inbox`** — Bashir's inbox mode: fetches open `field-report` issues from GitHub, triages each one (accept/already-fixed/wontfix/needs-info), applies accepted fixes, comments on issues with triage results, closes resolved issues. Completes the feedback loop: downstream submits → upstream triages → `/void` propagates fixes.
- **`/imagine` retry logic** — 3 attempts with exponential backoff (1s, 3s, 9s) for DALL-E server errors (500/502/503). ~15% of requests hit transient failures; now handled automatically.
- **Global CSS conflict check** in `/ux` Step 1.5 — Galadriel checks for specificity conflicts between global stylesheets and component-level utilities (Tailwind, CSS modules). Common traps: `overflow: hidden` on parents, stacking context conflicts, `:focus-visible` bleed-through.

### Changed
- Count cross-referencing in `/qa` already existed (shipped in v4.4.0) — confirmed during field report triage, no changes needed.

---

## [4.5.0] - 2026-03-15

### Added
- **PRD-driven credential collection** — Gandalf Step 4.5: after pasting a PRD, the wizard parses the env var section and presents a dynamic form to collect project-specific API keys (WhatsApp, Mapbox, Google Places, etc.). All stored in the vault with AES-256-GCM encryption.
  - New API endpoint: `POST /api/prd/env-requirements` — parses PRD content for service-specific credentials
  - New API endpoint: `POST /api/credentials/env-batch` — stores multiple credentials in one call
  - New Gandalf step between PRD and Deploy Target with accordion-style credential groups
- **Headless deploy mode** — `npx voidforge deploy --headless` runs the full provisioner pipeline from the terminal without opening a browser. Uses vault credentials and PRD frontmatter. Progress output to stdout with colored status icons. Used by `/build` Phase 12 so you never leave Claude Code.
  - New file: `wizard/lib/headless-deploy.ts` — terminal adapter for provisioner pipeline
  - Updated `scripts/voidforge.ts` with `--headless` and `--dir` flags
  - Updated `/build` Phase 12 to reference headless deploy
- **PostgreSQL extension support** — VPS provisioner now detects `postgis` and `pg_trgm` from Prisma schema's `extensions` directive and generates install commands in `provision.sh`
  - Updated `wizard/lib/provisioners/scripts/provision-vps.ts` with extension block generator
  - Updated `wizard/api/deploy.ts` to parse Prisma schema for extensions

### Changed
- Gandalf navigation updated to handle Step 4b (project credentials) with proper back/forward flow
- HOLOCRON updated with headless deploy documentation
- `/build` Phase 12 now references `npx voidforge deploy --headless` as the primary deploy path

---

## [4.4.0] - 2026-03-15

### Added
- **`/imagine` command** — Celebrimbor's Forge: AI image generation from PRD visual descriptions. Scans PRD for illustrations, portraits, OG images, hero art. Derives style from brand section. Generates via OpenAI API with asset manifest for regeneration. Provider-abstracted.
  - New agent: **Celebrimbor** (Tolkien, Silmarillion) — "Hand of Silver," greatest elven smith
  - Sub-agents: **Nori** (asset scanner), **Ori** (prompt engineer), **Dori** (integration checker)
- **`/debrief` command** — Bashir's Field Reports: post-session analysis that identifies methodology gaps and proposes fixes in VoidForge's own language. Can submit structured post-mortems as GitHub issues on the upstream repo.
  - New agent: **Bashir** (Star Trek DS9) — chief medical officer, diagnostician
  - Sub-agents: **Ezri** (timeline), **O'Brien** (root cause), **Nog** (solutions), **Jake** (report)
- `wizard/lib/image-gen.ts` — Image generation provider abstraction with OpenAI support, asset manifest, cost estimation
- `wizard/lib/asset-scanner.ts` — PRD parser for visual asset requirements with brand style extraction
- `docs/methods/FORGE_ARTIST.md` — Celebrimbor's full method doc
- `docs/methods/FIELD_MEDIC.md` — Bashir's full method doc

### Changed
- Lead agent count: 11 → 13 (Celebrimbor + Bashir)
- Command count: 13 → 15 (`/imagine` + `/debrief`)
- NAMING_REGISTRY.md: 7 new character entries (Celebrimbor, Nori, Ori, Dori, Ezri, Nog, Jake)

---

## [4.2.0] - 2026-03-14

### Added
- **Prisma type generation** (ADR-025) — runs `prisma generate` and creates `types/index.ts` barrel export. Conditional on Prisma schema existing.
- **OpenAPI spec generation** (ADR-025) — generates starter `docs/api.yaml` with framework-aware defaults. Users fill in their endpoints.
- **Database ERD generation** (ADR-025) — parses Prisma schema and generates `docs/schema.md` with Mermaid entity-relationship diagram.
- **Database seeding** (ADR-025) — generates `prisma/seed.ts` with factory functions for all models. Run with `npx tsx prisma/seed.ts`.
- **Integration templates** (ADR-025) — pre-built client wrappers selected via PRD frontmatter:
  - `payments: stripe` → `lib/stripe.ts` (checkout, portal, webhooks)
  - `email: resend` → `lib/resend.ts` (transactional email)
  - `storage: s3` → `lib/s3-upload.ts` (signed URL upload/download)

### Security
- All integration templates validate required env vars at startup (fail-fast, not silent fallback)

---

## [4.1.0] - 2026-03-14

### Added
- **Structured deploy logs** (ADR-021) — every successful provision is persisted to `~/.voidforge/deploys/` with timestamp, target, URL, resources, and sanitized outputs. New `/api/deploys` endpoint to query deploy history.
- **AWS cost estimation** (ADR-022) — before provisioning AWS targets (VPS/S3), emits an estimated monthly cost based on instance type, RDS, and ElastiCache selections. Informational only, does not block.
- **Post-deploy health monitoring** (ADR-023) — VPS: generates `infra/healthcheck.sh` cron script (curl every 5 minutes, log failures). Platforms: emits direct links to Vercel Analytics, Railway Metrics, or Cloudflare dashboard.
- **Sentry error tracking** (ADR-024) — optional integration. When `sentry-dsn` exists in vault, generates framework-specific Sentry SDK initialization code (`sentry.ts`, `sentry.client.config.ts`, or `sentry_config.py`). Writes DSN to `.env`. Non-fatal — works without it.

### Security
- Deploy log outputs are sanitized (password/secret/token keys stripped) before persisting to disk — same logic as SSE output sanitizer.
- Health check script sanitizes projectName and deployUrl to prevent shell injection in generated bash.

---

## [4.0.0] - 2026-03-14

### Added
- **Pre-deploy build step** (ADR-016) — framework-aware build runs BEFORE any deploy action. Detects build command and output directory per framework (Node, Django, Rails). Installs dependencies automatically. Skips if output already exists or no package.json found.
- **GitHub Actions CI/CD generation** (ADR-017) — generates `ci.yml` (test + lint on PR) and `deploy.yml` (deploy on merge to main) during GitHub pre-step. Framework-aware test/lint/build commands. Deploy target-specific workflows (Vercel, Cloudflare, Railway, VPS, S3). Required secrets documented in generated files.
- **Environment validation script** (ADR-018) — generates `validate-env.js` or `validate_env.py` that checks all required env vars at startup. Detects placeholder values. Works in both CommonJS and ESM projects.
- **Credential scoping** (ADR-020) — each provisioner only receives the vault keys it needs, not the full vault. Extends the cleanup scoping pattern from v3.8.0 to the provisioning phase. Internal `_`-prefixed keys (GitHub metadata) pass through.

### Changed
- **Railway API migration** (ADR-019) — replaced deprecated `pluginCreate` GraphQL mutation with `templateDeploy` for database/Redis provisioning. Falls back to `serviceCreate` if templates unavailable. Fixed custom domain ordering (now created after service). Deploy polling queries by service ID to target the correct service.
- `provision.ts` — framework value normalized to lowercase at boundary. Build failure message clarified. Fatal error now includes sanitized detail. Hostname validation includes format example. keepaliveTimer moved into finally block.
- `github.ts` — accepts framework/deployTarget params for CI/CD generation. Second commit/push for workflow files after initial push.
- S3 deploy uses framework-aware output directory via `getBuildOutputDir()` instead of hardcoded `dist`.

### Architecture
- 5 new ADRs: 016 (build step), 017 (CI/CD), 018 (env validation), 019 (Railway templates), 020 (credential scoping)

---

## [3.9.1] - 2026-03-14

### Added
- **ROADMAP.md** — 5-version strategic roadmap (v4.0 Reliability → v5.0 Intelligence)
- **PRD-VOIDFORGE.md** — VoidForge's own product requirements document (root-level, not synced to user projects via /void)
- **`/campaign --plan`** — planning mode: update PRD and ROADMAP with new ideas without building. Dax analyzes where it fits, Odo checks dependencies, presents changes for review.

### Changed
- `/campaign` PRD discovery: checks `/PRD-VOIDFORGE.md` at root first, falls back to `/docs/PRD.md`. User projects unaffected.

---

## [3.9.0] - 2026-03-14

### Added
- **/campaign command** — Sisko's War Room: read the PRD, pick the next mission, finish the fight, repeat until done. Autonomous campaign execution with mission scoping, dependency ordering, and The Prophecy Board for tracking progress across sessions.
- **Sisko** (Benjamin Sisko, DS9) promoted to 11th lead agent. Star Trek now has two leads: Picard (architecture) and Sisko (campaign). Sub-agents: Kira (ops), Dax (strategy), Odo (prerequisites).
- `docs/methods/CAMPAIGN.md` — full operating rules, 6-step sequence, session management, victory condition.
- Flags: `--resume` (continue mid-campaign), `--fast` (skip Crossfire+Council in each mission), `--mission "Name"` (jump to specific PRD section).

### Changed
- Command count updated to 13, lead count to 11 across CLAUDE.md, HOLOCRON.md, README.md, and NAMING_REGISTRY.md.

---

## [3.8.0] - 2026-03-14

### Added
- **Haku's Last Mile** — every deploy target is now fully automated end-to-end. Run `npm run deploy` and get a live URL, not a manual checklist.
- **GitHub integration** — new cloud provider in Gandalf. Collects PAT, creates repos, pushes code. Used by Vercel, Cloudflare Pages, and Railway for auto-deploy on push.
- **SSH deploy module** — provisions EC2 servers remotely (provision.sh), deploys via release-directory strategy with atomic symlink swap, health checks, and automatic rollback on failure.
- **S3 deploy via SDK** — uploads build directory to S3 with correct MIME types and cache-control headers. No AWS CLI dependency (ADR-014).
- **Shared exec utility** — child process wrapper with timeout, abort signal, and streaming (ADR-013). Used by GitHub and SSH modules.
- **Shared env-writer** — extracted .env append logic from 5 copy-pasted provisioner implementations.
- **Deploy polling** — Vercel, Cloudflare Pages, and Railway provisioners poll deployment status after git push, reporting progress until the app is live.
- **DEPLOY_URL** and **GITHUB_REPO_URL** displayed as clickable links on the Haku Done screen.
- 5 Architecture Decision Records: ADR-011 (GitHub pre-step), ADR-012 (no GitHub cleanup), ADR-013 (exec utility), ADR-014 (S3 via SDK), ADR-015 (platform auto-deploy).

### Changed
- **Vercel provisioner** — links GitHub repo, sets env vars via API, polls deploy. Re-runs (409) now fetch the existing project ID so all steps execute.
- **Cloudflare provisioner** — includes GitHub source at project creation (required by Cloudflare API). Re-runs set CF_PROJECT_URL. Next.js destination dir corrected to `out`.
- **Railway provisioner** — creates service with GitHub source, sets env vars using Railway's `${{Plugin.VAR}}` syntax. Deprecated `pluginCreate` gets clear fallback guidance.
- **AWS VPS provisioner** — uses shared slugify and env-writer. Error messages now include resource IDs and console URLs instead of generic "Check AWS Console."
- **GitHub org repos** — uses `/orgs/{owner}/repos` endpoint when owner is explicitly set, with fallback to `/user/repos`.

### Security
- **Token never touches disk** — git push uses `http.extraheader` via environment variables instead of embedding PAT in the URL. No reflog persistence (ADR-011).
- **Triple token sanitization** — error messages scrubbed with 3 regexes covering URL-embedded tokens, Base64 Authorization headers, and GIT_CONFIG env vars.
- **projectDir validation** — rejects paths with `..` segments or non-absolute paths to prevent directory traversal.
- **Credential scoping** — in-memory cleanup credentials store only target-specific keys, not the full vault.
- **Auth gate on /incomplete** — orphaned run enumeration now requires vault unlock.
- **.gitignore defense-in-depth** — verifies `.env` and `.ssh/` are protected before `git add -A`.
- **Secret stripping loop** — SSE output deletes any key containing "password", "secret", or "token" (case-insensitive).

### Fixed
- Vercel 409 (project exists) now fetches project ID — re-runs no longer silently skip linking, env vars, and deploy.
- Cloudflare 409 now sets `CF_PROJECT_URL` — re-runs show the deploy URL on the Done screen.
- Removed duplicate `slugify` from aws-vps.ts (diverged from shared implementation).
- Removed unused `httpsPut` import from vercel.ts.
- `.env` value parser strips surrounding quotes before uploading to Vercel.
- `npm ci --omit=dev` replaces `--ignore-scripts` in SSH deploy (fixes native deps like bcrypt, sharp).
- Null safety on all `safeJsonParse` casts in Cloudflare provisioner (8/8 now include `| null`).

---

## [3.7.0] - 2026-03-14

### Added
- **/assemble command** — Fury's Initiative: 13-phase full pipeline (architect → build → 3x review → UX → 2x security → devops → QA → test → crossfire → council). Calls every agent from every universe. Convergence loop, session checkpointing, --resume/--fast/--skip-build flags.
- **Fury** promoted to 10th lead agent (Marvel → The Initiative). Hill added to Marvel pool.
- **/thumper command** — Chani's Worm Rider: drive Claude Code via Telegram from anywhere. Gom Jabbar passphrase authentication with PBKDF2 hashing, message deletion, 60-minute idle timeout, 3-attempt lockout. Five bash scripts, zero dependencies.
- **Dune universe** — Chani as lead (Worm Rider) with 20 named characters. Sub-agents: Stilgar (security), Thufir Hawat (parsing), Duncan Idaho (relay), Reverend Mother Mohiam (authentication).
- **Transport auto-detection** — TMUX_SENDKEYS (cross-platform), PTY_INJECT (headless Linux), OSASCRIPT (macOS Terminal.app/iTerm2). Explicit guidance for VS Code, Warp, Alacritty, Kitty users. Windows Git Bash gets "use WSL" message.
- **Water Rings stop hook** — automatic task completion notifications to Telegram.
- **LESSONS.md** — first entries from Kongo.io Sprint 4 post-mortem.

### Changed
- **/review** — mandatory integration tracing (follow URLs/keys to consumers) and error path verification (verify UI displays specific server errors).
- **/ux** — mandatory error state testing with intentionally invalid/conflicting input.
- **/qa** — Step 2.5 smoke tests: hit the running server after build, verify cross-module paths at runtime.
- **/test** — Step 3.5 cross-module integration tests: at least one test per feature crossing module boundaries.
- **/security** — Maul executes actual HTTP exploitation attempts. Ahsoka traces the full auth middleware chain.
- **/build** — Phase 4/5/6 gates define "works manually" explicitly: error paths, cross-module integration, generated URLs.
- **/devops** — post-deploy smoke tests verify application behavior (not just infrastructure health).
- CLAUDE.md, HOLOCRON.md, README.md — 12 commands, 10 agents, 7 universes, 170+ characters.

### Security
- Gom Jabbar: PBKDF2 hashing (100k iterations), Telegram message deletion with fail-secure invalidation, idle timeout, lockout.
- Control character sanitization strips terminal-dangerous bytes from all injected messages.
- Root guard prevents /thumper from running as root.
- Empty hash bypass prevention refuses auth when hashing tools unavailable.
- Config injection prevention via `printf '%q'` and umask 077.

### Fixed
- THUMPER.md rewritten — 10+ factual errors corrected (wrong timeouts, hash algo, flow description, nonexistent CLI flags).
- Script copy clarified — hostile lockout softened, ambiguous passphrase prompts made explicit, empty notifications made useful.

---

## [3.5.3] - 2026-03-14

### Changed
- **Renamed `/voice` to `/thumper`** — resolved conflict with Claude Code's built-in `/voice` skill. A thumper is the Fremen device that summons the sandworm — plant it, the worm comes, you ride it.
- **Renamed "Remote Bridge" to "Worm Rider"** — proper Dune universe domain name for Chani's role. Worm riding is the quintessential Fremen skill.
- All files renamed: `scripts/voice/` → `scripts/thumper/`, `voice.sh` → `thumper.sh`, `VOICE.md` → `THUMPER.md`, `.voidforge/voice/` → `.voidforge/thumper/`.
- `/security` — Maul now executes actual HTTP exploitation attempts, not just conceptual red-teaming. Ahsoka traces the full auth middleware chain.
- `/build` — Phase 4/5/6 gates now define "works manually" explicitly: must test error paths and cross-module integration at runtime.
- `/devops` — Post-deploy smoke tests verify application behavior, not just infrastructure health.
- Kongo.io lessons applied across `/review`, `/ux`, `/qa`, `/test` — integration tracing, error path verification, smoke tests, cross-module tests.

---

## [3.5.0] - 2026-03-14

### Added
- **/voice command** — Chani's remote bridge: drive Claude Code sessions via Telegram from anywhere. Environment-aware setup auto-detects tmux, headless Linux, and macOS terminals.
- **Gom Jabbar authentication** — passphrase-based session gate with PBKDF2 hashing, Telegram message deletion, 60-minute idle timeout, and 3-attempt lockout. Passphrase is erased from chat history; session invalidated if deletion fails.
- **Dune universe** — 9th agent lead (Chani) with 20 named characters from Arrakis. Sub-agents: Stilgar (security), Thufir (parsing), Idaho (relay), Mohiam (authentication).
- **Water Rings stop hook** — automatic task completion notifications to Telegram when Claude Code finishes responding.
- **Transport vectors** — three injection methods: TMUX_SENDKEYS (cross-platform), PTY_INJECT (headless Linux), OSASCRIPT (macOS Terminal.app/iTerm2). Auto-detection with manual override.

### Security
- Control character sanitization strips terminal-dangerous bytes (Ctrl+C, ESC, ANSI sequences) from all incoming messages before injection.
- Root guard prevents /voice from running as root (unspoofable `id -u` check).
- Config injection prevention via `printf '%q'` escaping and umask 077 subshells.
- Empty hash bypass prevention — refuses authentication when hashing tools are unavailable.
- Credentials stored in chmod 600 sietch vault, directory chmod 700, gitignored via `.voidforge/`.

### Changed
- CLAUDE.md updated with /voice command, Chani in Team table, VOICE.md in Docs Reference.
- HOLOCRON.md updated to 11 commands, 9 agents, 7 universes, 170+ characters. Full /voice Arsenal entry with Gom Jabbar explanation.
- README.md updated with /voice in commands table, Chani in agent leads, voice/ in structure tree.
- NAMING_REGISTRY.md expanded with full Dune universe section (Chani lead + 20 pool characters).
- Environment detection improved: VS Code, Warp, Alacritty, Kitty on macOS now get explicit guidance instead of silent OSASCRIPT failure. Windows Git Bash/MSYS2 gets explicit "use WSL" message.

---

## [3.4.0] - 2026-03-13

### Added
- **/test command** — Batman's test-writing mode: coverage gap analysis, test architecture review, write missing unit/integration/component tests. Different from /qa (which finds bugs).
- **/review command** — Picard's code review: pattern compliance (Spock), code quality (Seven), maintainability (Data). Parallel analysis with re-verification pass.
- **Deathstroke** (DC) — adversarial tester added to Batman's QA team. Penetration-style probing, bypasses validations, chains unexpected interactions.
- **Constantine** (DC) — cursed code hunter added to Batman's QA team. Finds dead branches, impossible conditions, logic that only works by accident.
- **Maul** (Star Wars) — red-team attacker added to Kenobi's Security team. Thinks like an attacker, chains vulnerabilities, re-probes after remediation.
- **Double-pass review pattern** — all review phases (QA, UX, Security) now use find → fix → re-verify. Catches fix-induced regressions before they ship.

### Changed
- **Context thresholds for 1M** — checkpoint trigger raised from 15 files/30 tool calls to 50 files/100 tool calls. Pre-load active domain's methodology at session start instead of on-demand only.
- **Picard's architecture review parallelized** — Spock + Uhura run in parallel (independent), then La Forge + Data run in parallel. ~30% faster wall-clock time.
- **Stark's backend audit parallelized** — Rogers + Banner analysis in parallel, then Barton + Romanoff + Thor in parallel. Fury validates all findings.
- **Security audit restructured** — aligned method doc and command to 4 clear phases: parallel scans → sequential audits → remediate → Maul re-verifies.
- **Build protocol phases 9-11** — merged into a unified double-pass review cycle. All three agents (Batman, Galadriel, Kenobi) find issues in parallel, fixes are batched, then all three re-verify.
- **Galadriel's UX pass** — added Samwise + Gandalf re-verification after fixes to catch a11y regressions.
- **Session boundaries expanded** — small-to-medium projects can complete phases 0-8 in a single session with 1M context.
- **SUB_AGENTS.md** — added Coulson and Bombadil to the full roster table, fixed phantom anime character references.

---

## [3.3.1] - 2026-03-13

### Fixed
- **PRD generation silently truncating** — output was hard-coded to 8192 max tokens, causing complex PRDs to cut off mid-stream with no warning. Now uses each model's full output capacity (Opus 32K, Sonnet 16K, Haiku 8K).
- **No truncation feedback** — server now tracks `stop_reason` from the Claude API `message_delta` event and forwards a `truncated` signal to the client, which displays a visible warning instead of silently accepting incomplete output.

---

## [3.3.0] - 2026-03-13

### Added
- **Async resource polling** — Haku now waits for RDS (up to 15min) and ElastiCache (up to 5min) to become available, extracts real endpoints (`DB_HOST`, `REDIS_HOST`), and writes them to `.env`. No more "check the AWS Console." (ADR-009)
- **Domain registration via Cloudflare Registrar** — buy a domain through Haku as a pre-DNS step. Registration creates the zone, then DNS records are created in it. Includes availability check, price display, and non-refundable purchase confirmation gate. (ADR-010)
- **Cloudflare Account ID** field in Cloud Providers — required for domain registration, validated as 32-char hex on save
- **Post-failure registration verification** — if the registration API times out, Haku re-checks availability to detect masked successes before reporting failure

### Changed
- **Partial success UI** — if infrastructure provisions but domain/DNS fails, Haku shows "partial success" with guidance instead of binary pass/fail
- **Output display** — infra details on the Done page are now grouped logically (server → DB → cache → platform → domain → DNS) with human-readable date formatting for domain expiry
- **AbortController integration** — polling loops cancel cleanly when the client disconnects instead of running for up to 15 minutes server-side
- **HTTP client** — single retry on transient errors (ECONNRESET, ETIMEDOUT) with 2s delay; per-call timeout override (60s for registration)
- **Polling jitter** — random interval variation prevents API throttling under concurrent use
- **ADR-009** corrected to reflect actual AbortController implementation
- **Cloudflare DNS** accepts `pending` zones from fresh domain registrations (previously required `active`)

### Fixed
- **Terminal failure detection** — RDS/ElastiCache polling breaks immediately on `failed`/`deleted`/`create-failed` states instead of waiting for timeout
- **Cleanup handling** — resources in "creating" state get a manual-cleanup warning instead of a silent deletion failure
- **Asymmetric token check** — all combinations of missing Cloudflare credentials now emit clear skip messages
- **404 availability fallback** — notes that availability is unconfirmed when domain is simply absent from the account
- **Registration row** hidden for Docker (local) deploys and invalid hostnames
- **`state.deployCmd`** declared in initial state object

### Security
- **CSRF protection** — `X-VoidForge-Request` custom header required on all POST requests; triggers CORS preflight to block cross-origin form submissions
- **DB_PASSWORD stripped from SSE** — password stays in `.env` only, never sent to the browser
- **AWS error sanitization** — ARNs, account IDs, and internal identifiers no longer leak to the client
- **`.env` file permissions** — `chmod 600` applied after generation, matching SSH key protection
- **Provisioning concurrency lock** — returns 429 if a run is already in progress
- **`encodeURIComponent(accountId)`** on all Cloudflare API URL interpolations — prevents path injection
- **Domain + Account ID validation** at client, server, and registrar layers
- **Random password suffix** replaces static `A1!` — uppercase + digit + special char now randomized
- **Hostname allowlist** documented in HTTP client module

---

## [3.2.0] - 2026-03-13

### Added
- **`/void` slash command** — Bombadil's Forge Sync. Self-update mechanism that fetches the latest VoidForge methodology from the scaffold branch, compares every shared file, shows a human-readable update plan, and applies changes while preserving project-specific customizations (PRD, logs, code, CLAUDE.md project section). Works on all three tiers.
- **Forge Keeper method doc** (`docs/methods/FORGE_KEEPER.md`) — Bombadil's protocol with 5-step update sequence, sub-agent roster (Goldberry, Treebeard, Radagast), shared file manifest, edge cases, and rollback guidance
- **Bombadil** (Tolkien) as 8th lead agent — Tom Bombadil, the Forge Keeper. Ancient, joyful, sings while he works. Tends the forge itself while others forge applications.
- **Goldberry** added to Tolkien character pool — River-daughter, upstream change detection
- ADR-008 (scaffold branch as update source for /void)

### Changed
- **Command count** updated from 7 to 8 across CLAUDE.md, README, and Holocron
- **`.claude/settings.json` excluded from Bombadil's sync scope** — user permissions and hooks are never overwritten (Picard's architecture review finding)
- **Semver comparison** in `/void` uses integer parsing, not string comparison — prevents incorrect results for versions like 3.10.x vs 3.9.x (Picard's architecture review finding)

---

## [3.1.0] - 2026-03-13

### Added
- **PRD-driven EC2 instance type selection** — PRD frontmatter `instance_type` field recommends t3.micro/small/medium/large based on project scope (database, cache, workers, payments, framework). Haku wizard shows the recommendation with cost estimates and allows override. RDS and ElastiCache sizes match automatically. (ADR-005)
- **Cloudflare DNS wiring** — new `hostname` field in Gandalf wizard and PRD frontmatter. After Haku provisions infrastructure, it auto-creates Cloudflare DNS records (A for VPS, CNAME for platforms) pointing your domain at the provisioned resource. Works with all deploy targets. Non-fatal — infrastructure still succeeds if DNS fails. (ADR-006)
- **Platform custom domain registration** — Haku now registers your hostname directly with Vercel, Railway, and Cloudflare Pages via their APIs, so the platform expects traffic on your domain
- **Caddyfile auto-HTTPS** — when hostname is set, generated Caddyfile uses the domain instead of `:80`, enabling automatic Let's Encrypt SSL via Caddy
- **Instance sizing module** (`wizard/lib/instance-sizing.ts`) — scoring heuristic with `recommendInstanceType()`, RDS/ElastiCache size mapping, swap scaling
- **DNS module** (`wizard/lib/dns/`) — Cloudflare zone lookup, record CRUD, post-provision orchestration, cleanup support
- ADRs 005 (instance type selection), 006 (DNS as post-provision step), 007 (hostname vs domain naming)

### Changed
- **Provision script swap size** scales with instance type (2GB for micro/small, 1GB for medium, none for large)
- **Cloudflare help text** updated to recommend Zone:DNS:Edit token permission for DNS wiring
- **Architecture doc** updated with DNS in system diagram and new ADR references

---

## [3.0.0] - 2026-03-12

### Added
- **The VoidForge Holocron** (`HOLOCRON.md`) — comprehensive 9-chapter user guide covering setup, first project walkthrough, build protocol, agent system, slash commands, code patterns, build journal, troubleshooting, and evolution. Named after the Star Wars knowledge devices.
- **Three-tier distribution** — VoidForge now ships on three branches: `main` (full wizard), `scaffold` (methodology only), `core` (ultra-light drop-in). Each has its own README, release, and install path.
- **Branch sync rules** in CLAUDE.md — shared methodology files (agents, methods, patterns, commands) must propagate across all three branches.

### Changed
- **README restructured** — stripped down to pure system reference (architecture, components, tables). All walkthrough and guide content moved to the Holocron.
- **Semver rules updated** — MAJOR now includes distribution model changes.
- **VoidForge is now designed for external adoption** — three install paths, comprehensive guide, clean separation between system reference and user guide.

---

## [2.8.0] - 2026-03-12

### Added
- **Wizard split into Gandalf (setup) and Haku (deploy)** — `npx voidforge init` launches the setup wizard, `npx voidforge deploy` launches the deploy wizard. Provisioning moved from Gandalf to Haku for cleaner separation of concerns.
- **Architecture docs** — `ARCHITECTURE.md` (system overview + diagram), `SCALING.md` (three-tier assessment), `TECH_DEBT.md` (prioritized catalog), `FAILURE_MODES.md` (component failure analysis with recovery procedures)
- **Security checklist** — `SECURITY_CHECKLIST.md`, reusable pre-deploy verification list covering secrets, vault, server, AWS provisioning, generated infrastructure, input validation, and dependencies

### Changed
- **Gandalf UI simplified** — removed provisioning steps (now in Haku). Gandalf focuses on vault, credentials, project setup, PRD, and scaffold creation.

### Fixed
- **QA fixes** for Gandalf/Haku restructure
- **UX polish** for Haku deploy wizard

### Security
- **DB/Redis security group ports** restricted from `0.0.0.0/0` (internet-open) to self-referencing security group (SG-only). Prevents database and Redis exposure to the internet.
- **Security headers** added to local server: `X-Frame-Options: DENY`, `Content-Security-Policy`, `Referrer-Policy`, `Permissions-Policy`
- **Error message sanitization** — API error responses no longer leak internal details (file paths, stack traces). Real errors logged server-side only.

---

## [2.7.0] - 2026-03-12

### Added
- **Real API provisioning** for all deploy targets — Vercel creates projects, Railway creates projects with database/Redis services, Cloudflare creates Pages projects with D1 databases, Static S3 creates buckets with website hosting. All verified with live infrastructure.
- **Shared HTTP client** for provisioner API calls with safe JSON parsing and slug generation
- **Crash recovery cleanup** — orphaned resources from process crashes can now be cleaned up after server restart via disk-persisted manifests
- **SSE keepalive** on provisioning and PRD generation streams — prevents proxy/VPN/browser timeouts with 15-second heartbeats and event IDs
- **VoidForge favicon** — purple void portal icon

### Changed
- **Generated deploy scripts** use release-directory strategy with atomic symlink swap, post-deploy health check, and automatic rollback on failure. Keeps last 5 releases.
- **Generated provision scripts** include fail2ban, SSH hardening (no root/password), unattended security updates, 2GB swap, and log rotation
- **Generated Caddyfile** includes HSTS, Content-Security-Policy, and Permissions-Policy headers
- **Generated Dockerfiles** include HEALTHCHECK instructions. Build errors no longer silenced.
- **Generated docker-compose** uses env var DB passwords (not hardcoded), internal-only ports for DB/Redis, and app health checks
- **Generated PM2 config** includes crash-loop protection and graceful reload timeouts
- **Done page** shows target-specific deploy commands, human-readable labels, clickable URLs, and free tier/cost info
- **Railway** terminology updated from "plugins" to "services"

### Fixed
- Safe JSON parsing on all external API responses — no more crashes on HTML error pages
- S3 cleanup paginates object listing — handles buckets with more than 1000 objects
- Slugify strips leading/trailing hyphens and provides fallback for empty slugs
- Cloudflare D1 database only created for SQLite projects, not Postgres
- Railway token validation works with API tokens (not just user sessions)
- Help button now expands provider accordion when collapsed
- Vercel and Cloudflare 409 (project exists) paths track resources for cleanup

### Security
- Generated Caddyfile: HSTS, CSP, Permissions-Policy headers
- Generated provision.sh: fail2ban, SSH hardening, firewall lock-down-first
- Generated docker-compose: DB passwords from environment variables, database/Redis ports internal-only
- All 4 ADRs now implemented: provision manifest, atomic vault writes, API response validation, SSE keepalive

---

## [2.6.0] - 2026-03-12

### Added
- **Auto-provisioning system** — wizard steps 8 + 9. After project creation, provision infrastructure for your chosen deploy target with live SSE-streamed progress.
- **Docker provisioner** — generates Dockerfile (multi-stage per framework), docker-compose.yml (with optional Postgres/MySQL/Redis services), and .dockerignore
- **AWS VPS provisioner** — full EC2 + security group + SSH key pair provisioning, with optional RDS (Postgres/MySQL) and ElastiCache (Redis). Generates deploy scripts (provision.sh, deploy.sh, rollback.sh), Caddyfile, and PM2 ecosystem config.
- **Config-only provisioners** — Vercel (vercel.json), Railway (railway.toml), Cloudflare (wrangler.toml), Static S3 (deploy-s3.sh)
- **Provisioning API** — `POST /api/provision/start` (SSE-streamed), `POST /api/provision/cleanup`, `GET /api/provision/incomplete` for crash recovery
- **Provision manifest** (ADR-001) — write-ahead resource tracking at `~/.voidforge/runs/` prevents orphaned AWS resources on crash
- **Pre-provisioning confirmation gate** — users see what will be created (and AWS cost warning) before clicking "Start Provisioning"
- **4 Architecture Decision Records** — provision manifest, atomic vault writes, API response validation, SSE keepalive
- **QA regression checklist** — 24-item checklist covering all provisioning flows, a11y, and mobile

### Changed
- **Vault writes are now atomic** (ADR-002) — write-to-temp + fsync + rename prevents credential loss on crash
- **Wizard expanded to 9 steps** — step 8 (provision with confirmation gate) and step 9 (done with infra details)
- **User-controlled transitions** — replaced auto-advance with explicit "Continue" button for a11y
- **Advanced setup card** — updated copy from "Infrastructure provisioning in future phases" to "Automatic infrastructure provisioning"

### Fixed
- **JS injection** in PM2 config via project names containing quotes — now uses `JSON.stringify`
- **S3 deploy script** — added missing `--exclude '*'` before `--include` flags
- **RDS/EC2 networking** — RDS instance now shares security group with EC2; DB/Redis ports added to SG
- **RDS password** — generated with `crypto.randomBytes` instead of predictable slug-based derivation
- **Skip provisioning** — now aborts in-flight fetch via AbortController
- **Cleanup race condition** — resources tracked per run ID instead of global mutable state
- **Security group cleanup** — retry loop with 10s intervals instead of insufficient 5s sleep
- **Empty SSH key** — validates AWS returns key material before writing file
- **Rollback script** — framework-aware restart commands (Django/Rails) instead of hardcoded npm/PM2

### Security
- **Atomic vault writes** prevent credential file corruption
- **DB password masked** on wizard done page (shown as bullet characters)
- **`.ssh/` added to .gitignore** — prevents accidental deploy key commits

---

## [2.5.0] - 2026-03-12

### Added
- **`/git` slash command** (`.claude/commands/git.md`) — Coulson's version & release management. 7-step flow: orient, analyze diffs, determine semver bump, write changelog, craft commit, verify consistency, optional push. 5 Marvel sub-agents (Vision, Friday, Wong, Rogers, Barton).
- **Release Manager protocol** (`docs/methods/RELEASE_MANAGER.md`) — Coulson's method doc with semver rules, changelog writing guidelines, commit message format, and verification checklist. Works for VoidForge and generic projects.
- **Coulson** (Marvel) as 7th lead agent — S.H.I.E.L.D.'s meticulous record-keeper for version management
- **Friday** added to Marvel character pool in NAMING_REGISTRY.md — AI assistant for versioning and automation

### Changed
- **CLAUDE.md** — added `/git` to Slash Commands table, Coulson to The Team table, Release Manager to Docs Reference
- **README.md** — added `/git` to commands table, Coulson to leads table, updated command count to 7, added git.md and RELEASE_MANAGER.md to repo structure
- **NAMING_REGISTRY.md** — added Coulson as Marvel lead (release), Friday to Marvel pool, updated rules and reserved list

---

## [2.4.0] - 2026-03-12

### Added
- **Cloud provider management** — new credential validation and storage for AWS, Vercel, Railway, and Cloudflare. Live API validation (STS, GraphQL, token verify) with vault-encrypted storage.
- **Deploy target selection** in wizard — choose deployment platform based on which providers have valid credentials. Docker always available.
- **Deploy target in `.env`** — scaffolded projects include `DEPLOY_TARGET` when a platform is selected

### Changed
- **Wizard UI overhaul** — redesigned credential step with provider cards, inline help, validation feedback. Expanded wizard flow with cloud and deploy target integration.
- **Vault concurrency** — all vault operations now serialized through a write queue to prevent race conditions on concurrent requests
- **Async key derivation** — PBKDF2 moved from sync to async to avoid blocking the event loop during encryption/decryption

### Fixed
- **Command injection** in browser launcher — replaced `exec` with `execFile` to prevent shell interpretation of URLs
- **Directory traversal** in static file server — replaced naive `..` stripping with `resolve()` + prefix check
- **SSE crash on client disconnect** — PRD generation stream now safely no-ops when the client has disconnected
- **CORS wildcard** — scoped `Access-Control-Allow-Origin` to the wizard's actual origin instead of `*`
- **Error detail leaking** — API error responses no longer include internal error bodies or stack traces
- **Password length cap** — vault unlock rejects passwords over 256 characters (DoS prevention)

### Removed
- **`claude` dependency** — removed unused package from dependencies

---

## [2.3.0] - 2026-03-12

### Added
- **Interactive setup wizard** (`wizard/`) — browser-based onboarding launched via `npm run wizard`. 5-step flow: credential vault, project setup, PRD creation, review, create.
- **Encrypted credential vault** (`wizard/lib/vault.ts`) — AES-256-GCM with PBKDF2 key derivation, stored at `~/.voidforge/vault.enc`. Cross-platform (macOS, Linux, Windows). Users manage the password however they like.
- **PRD generation with Claude** — streams a full PRD from a product idea using the best available model (auto-resolved via `/v1/models` API). Primary path in the wizard.
- **Bring Your Own PRD** tab — copy the generator prompt to clipboard for use with any AI (ChatGPT, Gemini, etc.), paste the result back with frontmatter validation.
- **Project scaffolding** — TypeScript port of `new-project.sh` logic with git init, CLAUDE.md substitution, .env generation.
- **CLI entry point** (`scripts/voidforge.ts`) — `npx voidforge init` launches the wizard.
- **Dynamic model resolution** (`wizard/lib/anthropic.ts`) — fetches available models from Anthropic API, picks newest Opus > Sonnet > Haiku. No hardcoded model IDs.
- **Frontmatter parser** (`wizard/lib/frontmatter.ts`) — YAML frontmatter extraction and validation for PRD documents.
- `tsconfig.json`, TypeScript and tsx dev dependencies.

### Changed
- **README.md** — wizard is now the primary Quick Start path. Manual setup is an alternative section. Repository structure updated to include `wizard/` and `scripts/voidforge.ts`.
- **`new-project.sh`** — comment noting `wizard/` exclusion from project copies.
- **`package.json`** — added `bin` field, `wizard` and `typecheck` scripts, `type: "module"`.

---

## [2.2.0] - 2026-03-12

### Changed
- **Project renamed to VoidForge** — "from nothing, everything." Replaced all references to `claude-scaffold` across README, scripts, package files, patterns, and version docs

---

## [2.1.1] - 2026-03-12

### Fixed
- **PostToolUse hook format** in `.claude/settings.json` — migrated from flat `command` field to nested `hooks` array structure per current Claude Code schema

---

## [2.1.0] - 2026-03-10

### Added
- **Build Journal system** (`docs/methods/BUILD_JOURNAL.md`) — persistent logging protocol for decisions, phase state, handoffs, errors. Every agent produces structured output in `/logs/`. Agents read journal files to recover state across sessions.
- **Context Window Management** (`docs/methods/CONTEXT_MANAGEMENT.md`) — session scoping guide, load-on-demand protocol, file size discipline, context checkpointing, emergency recovery.
- **Job queue pattern** (`docs/patterns/job-queue.ts`) — background jobs with idempotency keys, exponential backoff retry, dead letter queue, graceful shutdown. Includes BullMQ, Celery (Django), and Sidekiq (Rails) implementations.
- **Multi-tenancy pattern** (`docs/patterns/multi-tenant.ts`) — workspace scoping middleware, tenant-scoped services, role-based access control. Includes Next.js, Django, and Rails implementations.
- **Error handling pattern** (`docs/patterns/error-handling.ts`) — canonical error strategy: custom error types, global handler, response shape, operational vs programmer errors. Includes Express, Django, and Rails implementations.
- **Regression checklist template** in QA_ENGINEER.md — concrete table format with example entries, growth rules (2-3 items per feature, by launch: 30-50 items)
- **First-deploy pre-flight checklist** in `/devops` command — env vars, secrets, DB seeding, DNS, SSL, health check, rollback test, monitoring, security review
- **Phase rollback strategy** in BUILD_PROTOCOL.md and TROUBLESHOOTING.md — identify, revert, verify, isolate, fix, re-apply, log
- **Test execution timeline** in BUILD_PROTOCOL.md — authoritative table of which tests are written in which phase, all marked as breaking gates
- **Frontmatter validation table** in BUILD_PROTOCOL.md — valid values for each PRD field, defaults when missing
- **Parallel phase marking** in BUILD_PROTOCOL.md — each phase marked as parallelizable or strictly sequential
- **Multi-agent conflict resolution** in SUB_AGENTS.md — escalation protocol: check PRD, present trade-offs to user, document as ADR. Common conflict patterns with resolutions.
- **Framework-to-test-runner mapping** in TESTING.md — table covering Next.js, Express, Django, Rails, Go, Spring Boot
- **Batman scope clarification** — explicitly cross-cutting investigator + validator

### Changed
- **CLAUDE.md** — added build journal and context management references, "small batches" defined (max ~200 lines), error-handling.ts as canonical source, deduped from README
- **BUILD_PROTOCOL.md** — rewritten with specific verification gates (manual + automated criteria per phase), test execution timeline, rollback strategy, frontmatter validation, parallel phase marking, small batch definition (~200 lines), logging integrated at every phase
- **All 6 slash commands** — rewritten from pointers to self-contained executable sequences with inline steps, context setup, parallel analysis phases, logging instructions, and handoff protocols
- **SUB_AGENTS.md** — Agent tool section clarified (parallel analysis, not parallel coding), git coordination for multi-session, conflict resolution expanded with tiebreaker protocol
- **QA_ENGINEER.md** — added Scope section clarifying cross-cutting role, regression checklist template with format and rules
- **TESTING.md** — added framework-to-test-runner mapping table at top
- **TROUBLESHOOTING.md** — added phase rollback protocol section
- **All 4 original pattern files** — added framework adaptation notes (Express, Django, Rails, Vue, Svelte)
- **patterns/README.md** — updated table with all 7 patterns, framework columns
- **new-project.sh** — creates `/logs/` directory, copies all new files
- **DevOps slash command** — adapts based on PRD `deploy` target (vps/vercel/railway/docker/static), includes first-deploy checklist

---

## [2.0.0] - 2026-03-10

### Added
- Slash commands (`.claude/commands/`) — `/build`, `/qa`, `/security`, `/ux`, `/devops`, `/architect`
- Claude Code settings (`.claude/settings.json`) — permissions, deny list, quality gate hooks
- Testing protocol (`docs/methods/TESTING.md`) — automated testing pyramid
- Troubleshooting guide (`docs/methods/TROUBLESHOOTING.md`) — error recovery per phase
- MCP integration guide (`docs/methods/MCP_INTEGRATION.md`)
- Code patterns (`docs/patterns/`) — api-route, service, component, middleware
- Feedback loop (`docs/LESSONS.md`)
- PRD frontmatter, conditional build phases, project sizing profiles
- Phase verification gates, single-session parallelism in SUB_AGENTS.md
- Per-directory CLAUDE.md convention
- Behavioral directives on all 6 agent method docs

### Changed
- CLAUDE.md restructured to dense operational instructions
- QA_ENGINEER.md integrated automated testing
- BUILD_PROTOCOL.md added conditional skip rules and verification gates

---

## [1.1.0] - 2026-03-10

### Changed
- Renamed DevOps lead from Motoko to Kusanagi across all files

---

## [1.0.0] - 2026-03-10

### Added
- Root context file (`CLAUDE.md`), 13-phase Build Protocol
- 6 specialist agent protocols (Galadriel, Stark, Batman, Kenobi, Picard, Kusanagi)
- 150+ named characters across 6 universes
- Sub-Agent Orchestrator, PRD Generator, PRD template, QA state file
- Project initialization script
