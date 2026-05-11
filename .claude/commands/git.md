# /git — Coulson's Version & Release Management

## Context Setup
1. Read `/docs/methods/RELEASE_MANAGER.md`
2. Read `VERSION.md` (~25 lines — semver rules + version history)

## Step 0 — Orient (Coulson)
Scope the changes:
1. Run `git status` — identify staged, unstaged, and untracked files
2. Run `git diff --stat` — get a summary of what changed
3. If there are unstaged changes, ask the user: "Stage everything, or should I be selective?"
4. If there are no changes at all, stop: "Nothing to version. Working tree is clean."

## Step 1 — Analyze (Vision)
Read the actual diffs and classify every change:
1. Run `git diff --cached` (staged) and `git diff` (unstaged) — read the content
2. Classify each change into exactly one category:
   - **Added** — new files, new features, new commands, new agents
   - **Changed** — modifications to existing features, refactors, improvements
   - **Fixed** — bug fixes, corrections
   - **Removed** — deleted files, removed features
   - **Security** — security-related changes (auth, encryption, headers, secrets)
3. Flag any **breaking changes** (deleted/renamed exports, changed method doc structure, changed build phases, changed agent naming)
4. Present the classification to the user for review before proceeding

## Step 2 — Version (Friday)
Determine the version bump:
1. Read current version from `VERSION.md`
2. Check for user override arguments (`--major`, `--minor`, `--patch`)
3. If no override, apply the priority cascade:
   - **MAJOR** — Breaking changes: deleted/renamed exports, changed method doc structure, changed build phases, changed agent naming
   - **MINOR** — New files (not tests), new features, new commands, new agents, new method docs
   - **PATCH** — Bug fixes, typos, refactors, dependency updates, test-only changes
4. Present recommendation: "Recommend **vX.Y.Z** (MINOR — new command, new method doc). Override? [enter to accept]"
5. User confirms or overrides

## Step 3 — Chronicle (Wong)

**Disambiguation: project changelog vs methodology changelog.**

If `PROJECT_VERSION.md` exists at repo root, it is the project's changelog (version history). The repo's `CHANGELOG.md` is voidforge-methodology-scoped (versions match the methodology package, not the project) — do NOT edit it for project work. Update `PROJECT_VERSION.md`'s "Current" / "In Progress" / "Next" lines and add a row to the Version History table instead.

If only `CHANGELOG.md` exists, follow the standard flow — that's a methodology repo or a single-version-history project.

If both files exist and the project is a downstream consumer of VoidForge, the project's history goes in `PROJECT_VERSION.md` and the methodology's bundled CHANGELOG is read-only (Bombadil owns it via `/void` sync). Field report #320 §5 documents the confusion this caused before the disambiguation was written.

Update all version files:
1. Read the top of the **active changelog** (PROJECT_VERSION.md if present at repo root, else CHANGELOG.md) — ~30 lines for format reference.
2. Write the new entry at the top (after the header), using the categories from Step 1:
   - User-facing language, not file-level details
   - Group by Added/Changed/Fixed/Removed/Security
   - Include today's date
3. Update `VERSION.md`:
   - Change "**Current:** X.Y.Z" to the new version
   - Add a row to the Version History table with date and one-line summary
4. Update `package.json` version field

## Step 4 — Commit (Rogers)
Stage and commit:
1. Stage all modified version files: `VERSION.md`, `CHANGELOG.md`, `package.json`
2. Stage any other files that are part of this release (from Step 0)
3. Craft commit message in the format: `vX.Y.Z: One-line summary`
   - If elaboration needed, add a blank line then details
   - Match the style of existing commits (check `git log --oneline -10`)
4. Present the full commit message and staged file list to the user
5. On user approval, execute the commit

## Step 5 — Verify (Barton)
Confirm everything is consistent:
1. Run `git log -1 --format="%H %s"` — verify the commit exists and message is correct
2. Check version consistency:
   - `VERSION.md` current version matches
   - `package.json` version matches
   - The **active changelog** (PROJECT_VERSION.md if present, else CHANGELOG.md) has an entry for this version
   - Commit message starts with the correct version tag
   - **ROADMAP.md cross-check (field report #309 Fix 4):** if `ROADMAP.md` exists, grep it for the new version string. If milestones in ROADMAP.md reference a higher version than `package.json`, that's drift — surface it and offer to bump. If ROADMAP claims a milestone is "DONE" at a version that doesn't match the just-committed bump, surface that too. Drift between ROADMAP and package.json typically goes unnoticed for weeks.
3. Run `git status` — verify working tree is clean (no forgotten files)
4. If any inconsistency found, flag it and offer to fix

## Step 6 — Push (Coulson) [Optional]
Only if the user explicitly requests:
1. Check remote: `git remote -v`
2. Check if branch tracks upstream: `git status -sb`
3. Push: `git push`
4. Verify: `git log --oneline -1` matches remote

## Step 5.5 — Command↔Doc Sync Check (Friday)
If any `docs/methods/*.md` file was modified, verify the paired `.claude/commands/*.md` file reflects the same additions:

| Method Doc | Command File |
|-----------|-------------|
| GAUNTLET.md | gauntlet.md |
| CAMPAIGN.md | campaign.md |
| FORGE_KEEPER.md | void.md |
| ASSEMBLER.md | assemble.md |
| FIELD_MEDIC.md | debrief.md |
| BUILD_PROTOCOL.md | build.md |
| QA_ENGINEER.md | qa.md |
| SECURITY_AUDITOR.md | security.md |
| PRODUCT_DESIGN_FRONTEND.md | ux.md |
| SYSTEMS_ARCHITECT.md | architect.md |
| DEVOPS_ENGINEER.md | devops.md |
| RELEASE_MANAGER.md | git.md |
| THUMPER.md | thumper.md |

If a method doc gained a new section, flag, or checklist item — flag it: "Method doc X changed but command file Y may need matching update." The user decides whether the command file needs updating.

## Arguments
- `--dry-run` → Show version bump, changelog entry, and commit message without executing.

## Handoffs
- If changes include security fixes → note for Kenobi (`/sentinel`)
- If changes include infrastructure → note for Kusanagi (`/devops`)
- If version is MAJOR → recommend Picard review (`/architect`)
