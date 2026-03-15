# VoidForge Roadmap

> The plan for the plan-maker.

**Current:** v4.2.0 (2026-03-14)
**Status:** DX release shipped. Prisma types, OpenAPI docs, ERD, integration templates, database seeding.

---

## v4.0 — The Reliability Release

*What breaks most often for users today.*

### Pre-deploy build step
Every platform deploy assumes `dist/` exists. If the user hasn't built, they get a confusing error after infrastructure is already provisioned. Add a framework-aware build step (`npm run build`, `python manage.py collectstatic`, `bundle exec rails assets:precompile`) before any upload/push. Detect the build output directory from the framework (`dist/`, `out/`, `.next/`, `build/`, `public/`).

### GitHub Actions CI/CD generation
Users get auto-deploy on push via platform webhooks, but no test-on-PR, no lint-on-push. Generate `.github/workflows/ci.yml` (test + lint on PR) and `.github/workflows/deploy.yml` (deploy on merge to main) as part of the GitHub pre-step. Framework-aware: Node runs `npm test`, Django runs `pytest`, Rails runs `rspec`.

### Environment validation
Generate a startup validation script that checks all required env vars exist before the app boots. Read from the generated `.env` template — any key with a placeholder value (`# pending`, empty) triggers a clear error at startup instead of a cryptic runtime crash.

### Railway API migration
Replace deprecated `pluginCreate` GraphQL mutation with Railway's current template service API. Database and Redis provisioning is silently failing for new Railway accounts.

### Credential scoping per provisioner
The full vault is passed to every provisioner via `ctx.credentials`. Scope it so each provisioner only receives the keys it needs. Currently only cleanup credentials are scoped (v3.8.0 fix) — extend to the provisioning phase.

---

## v4.1 — The Observability Release

*What happens after deploy is a black box.*

### Post-deploy health monitoring
After the initial health check passes, generate a simple cron-based uptime monitor for VPS (`curl` every 5 minutes, alert on failure). For platform targets, add monitoring dashboard links to the Done screen (Vercel Analytics, Railway Metrics, Cloudflare Analytics).

### Error tracking integration
Add Sentry as an optional integration in the Merlin wizard. If enabled, generate the Sentry SDK initialization code, configure source maps, and inject the DSN as an env var. Non-fatal — works without it.

### Structured deploy logs
Store deploy results to `~/.voidforge/deploys/` with timestamps, targets, URLs, and resource IDs. Users can run `voidforge deploys` to see their deploy history. Strange's Done screen links to the log.

### Cost estimation
Before AWS provisioning, estimate the monthly cost based on instance type, RDS, and ElastiCache choices. Display in the Strange confirm screen. Rough but useful: "Estimated: ~$45/month (t3.micro + db.t3.micro + cache.t3.micro)."

---

## v4.2 — The DX Release

*Developer ergonomics that save 10 minutes per session.*

### Type generation from schema
After Prisma schema changes, auto-run `npx prisma generate` and generate a barrel export (`types/index.ts`). Components and services import from one place.

### API documentation generation
Generate OpenAPI/Swagger spec from Express/Next.js routes. Write to `docs/api.yaml`. Optionally serve Swagger UI at `/api/docs` in development.

### Database ERD generation
Auto-generate a Mermaid entity-relationship diagram from the Prisma schema. Write to `docs/schema.md`. Picard references it during architecture reviews.

### Integration templates
Pre-built client wrappers for common services:
- **Stripe** — checkout session, webhook handler, customer portal
- **Resend** — transactional email with templates
- **S3** — file upload with signed URLs
- **Sentry** — error tracking initialization

Selected via PRD frontmatter (`payments: stripe`, `email: resend`). Generated during Phase 6 (Integrations).

### Database seeding
Generate `seed.ts` with factory functions for all schema models. Used by tests and local development. Run via `npm run seed`.

---

## v4.3 — The Resilience Release

*From "it works" to "it stays working."*

### Multi-environment support
Generate separate `.env.development`, `.env.staging`, `.env.production`. Strange wizard asks which environment to deploy. Platform deploys scope env vars per environment (Vercel already supports this — extend to Railway/Cloudflare).

### Preview deployments
For Vercel and Cloudflare Pages, configure PR preview deployments automatically. Each pull request gets a unique URL. Links posted as PR comments via GitHub API.

### Platform rollback
Vercel, Railway, and Cloudflare all support rollback via API. Add a `/api/provision/rollback` endpoint that reverts to the previous deployment. Surface in the Strange UI as a "Rollback" button on the Done screen.

### Database migration automation
Run `prisma migrate deploy` (or `rails db:migrate`, `python manage.py migrate`) as part of the deploy step. For VPS, include in the SSH deploy sequence before the symlink swap. For platforms, add as a build step.

### Backup automation
For VPS + RDS: generate a daily backup cron (`pg_dump` to S3). For Railway/Cloudflare D1: document the platform's built-in backup features. For S3 static: enable versioning on the bucket.

---

## v4.4 — The Imagination Release

*The forge creates images. The forge learns from its users.*

### `/imagine` command — Celebrimbor's Image Generation
New slash command and agent for AI image generation. Celebrimbor (Tolkien — greatest elven smith) reads the PRD for visual asset requirements (illustrations, portraits, OG images, hero art), derives a style prompt from the brand section, and generates images via OpenAI's image API. Manages an asset manifest for regeneration and auditing. Provider-abstracted (OpenAI default, extensible to Replicate/others).

Sub-agents: Nori (asset scanner), Ori (prompt engineer), Dori (integration checker) — dwarves from The Hobbit.

Command: `/imagine` (not `/forge` — avoids collision with VoidForge/Bombadil naming). Flags: `--scan`, `--asset "name"`, `--regen "name"`, `--style "override"`, `--provider model`.

### Wizard integration — OpenAI API key in Merlin
Add OpenAI API key as an optional credential in Merlin's Step 2 (Cloud Providers). Same vault, same AES-256-GCM encryption, same UX. Key name: `openai-api-key`. If not provided in wizard, `/imagine` prompts on first use. Non-blocking — projects work fine without it.

### Pipeline integration
- `/assemble` Phase 2b: Celebrimbor generates assets after build, before review
- `/build` Phase 8 (Marketing): Celebrimbor runs if PRD has visual asset requirements
- `/campaign` Step 1: Dax classifies image requirements as "Asset — via /imagine" instead of BLOCKED
- Galadriel verifies generated images match brand during `/ux` pass

### Files to create
- `.claude/commands/imagine.md` — slash command
- `docs/methods/FORGE_ARTIST.md` — Celebrimbor's method doc
- `wizard/lib/image-gen.ts` — provider abstraction + generation
- `wizard/lib/asset-scanner.ts` — PRD parsing for image requirements
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`, `wizard/ui/app.js`

### `/debrief` command — Bashir's Field Reports
New slash command for post-session analysis and upstream feedback. Bashir (Star Trek DS9 — chief medical officer, diagnostician) reads the session's build logs, assemble state, campaign state, and git history, then produces a structured post-mortem that identifies methodology gaps and proposes fixes in VoidForge's own language.

The key innovation: the report can be **submitted as a GitHub issue** on the VoidForge upstream repo (`tmcleod3/voidforge`), labeled `field-report`. Users become contributors just by running `/debrief --submit` after a rough session. Upstream maintainers get structured, actionable feedback written in VoidForge's agent/command vocabulary.

Sub-agents: Ezri (session timeline reconstruction — joined Trill, multiple lifetimes of perspective), O'Brien (root cause investigation — "the bloody EPS conduits again"), Nog (solution proposals within VoidForge's framework — first Ferengi in Starfleet, creative and resourceful), Jake (report writing — Sisko's son, aspiring journalist).

Command: `/debrief`. Flags: `--submit` (create GitHub issue), `--campaign` (analyze full campaign), `--session` (just this session), `--dry-run` (generate without submitting).

**The feedback loop:**
- `/void` (Bombadil) pulls updates DOWN from upstream
- `/debrief` (Bashir) pushes learnings BACK UP to upstream
- When `/void` next runs, Bombadil can note: "Your field report was incorporated into v4.5"

**Privacy:** Reports contain timeline, root causes, and proposed fixes — NOT source code, credentials, or personal data. User reviews and approves every word before submission.

**Integration:**
- `/campaign` Step 6: After victory, Sisko offers debrief
- `/assemble` completion: If 3+ Must Fix items found, Fury suggests debrief
- Standalone: run `/debrief` anytime after a session with interesting findings

### Files to create
- `.claude/commands/debrief.md` — slash command
- `docs/methods/FIELD_MEDIC.md` — Bashir's method doc
- Update: `NAMING_REGISTRY.md`, `CLAUDE.md`, `HOLOCRON.md`

---

## v5.0 — The Intelligence Release

*VoidForge gets smarter with use.*

### Lessons integration
After every `/assemble` run, auto-extract learnings (what broke, what patterns emerged, what was slow) and append to `LESSONS.md`. Feed lessons back into future builds — if a pattern caused bugs in project A, flag it when seen in project B.

### Build analytics
Track build metrics across projects: phase durations, finding counts, fix-to-finding ratios, most common security issues. Surface trends: "Your projects consistently fail on auth edge cases — consider adding the auth integration test template."

### Smart scoping
`/campaign` currently scopes missions by PRD section order. Teach Dax to scope by complexity and risk — build the hardest features first (when energy is high), save polishing for later.

### Template marketplace
Curated project starters (SaaS, API, marketing site, admin dashboard) with pre-filled PRDs, pre-configured integrations, and pre-written seed data. `voidforge init --template saas` gets you 80% of the way before `/build` even starts.

---

## Versioning Rules

- **MINOR** (4.0, 4.1, 4.2...) — new capabilities, new integrations, new commands
- **PATCH** (4.0.1, 4.0.2...) — bug fixes, doc improvements, methodology refinements
- **MAJOR** (5.0) — new paradigms, breaking changes to methodology structure

## Prioritization Principles

1. **Fix what breaks first.** Pre-deploy build step > fancy features.
2. **The user's next 5 minutes.** Each version should save the user time on their very next build.
3. **Methodology over tooling.** A new method doc that changes how Claude thinks is worth more than a new wizard screen.
4. **Ship small, ship often.** Each version should be shippable in 1-2 sessions.
