# /git — Coulson's Version & Release Management

## Context Setup
1. Read `/docs/methods/RELEASE_MANAGER.md`
2. Read `VERSION.md` (~25 lines — semver rules + version history)

## Step 0 — Orient (Coulson)
Scope the changes:
1. Run `git status` — identify staged, unstaged, and untracked files
2. Run `git diff --stat` — get a summary of what changed
3. **Unrelated / pre-existing-change detection (field report #384 RC-1 — never `git add -A` blind).** Before staging, separate what this session authored from changes that were already in the working tree or fall outside the session's stated scope. Two mechanical checks:
   - **Dependency manifests get special scrutiny.** If any manifest or lockfile appears in the diff — `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `requirements.txt`, `pyproject.toml`, `Cargo.toml` / `Cargo.lock`, `go.mod` / `go.sum`, `Gemfile` / `Gemfile.lock` — read the actual dependency-level diff (`git diff -- <manifest>`), not just the filename. A dependency added / changed / removed that the session did not deliberately introduce is the exact bug this check exists for: the v23.20.0 `vercel` near-miss was a stray `npm install` that added `vercel` to root `dependencies` plus ~5,900 lockfile lines, and a naive `git add -A` would have shipped it into a methodology release. Flag every dependency change for an explicit include/exclude decision and honor "no new dependencies without justification" (CLAUDE.md Coding Standards).
   - **Scope diff.** Cross-check the full changed-file list against what this session actually touched. Anything you did not author this session — a leftover edit, a scratch/probe file, an untracked artifact — is surfaced for an explicit keep/drop decision.
   Present the split — *session-authored (stage these)* vs *pre-existing or out-of-scope (decide)* — and get the include/exclude decision BEFORE Step 4 staging. **Never `git add -A` / `git add .` a release without this split.**
4. If there are unstaged changes, ask the user: "Stage everything, or should I be selective?" — informed by step 3's split.
5. If there are no changes at all, stop: "Nothing to version. Working tree is clean."

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
4. Update the version in **every** versioned `package.json`. For a single-package repo that is the root `package.json`. For a workspaces/monorepo it is each non-private workspace package — VoidForge has **two**: `packages/voidforge/package.json` and `packages/methodology/package.json` (the root is `"private": true` with no version). **Also bump any internal dep pin:** when one workspace package depends on a sibling, set the range to `^<new-version>` — for VoidForge, `voidforge-build`'s `voidforge-build-methodology` dependency, per ADR-062. A bump that updates one package but not its sibling or the pin ships an inconsistent release (and the Step 7 publish skips any package whose version doesn't match).
5. **Re-sync tracked generated copies of release files.** If a source file changed this release has a tracked copy that is regenerated at publish, re-sync it so the in-repo copy doesn't go stale between releases. VoidForge: `packages/methodology/CLAUDE.md` is the root `CLAUDE.md` with the ADR-058 template block stripped — `sed '/<!-- REMOVE-FOR-NPM-PUBLISH/,/END-REMOVE-FOR-NPM-PUBLISH -->/d' CLAUDE.md > packages/methodology/CLAUDE.md`.

## Step 3.5 — Removal Sweep (Rogers)
If Step 1 classified any change as **Removed** — a deleted symbol, export, prop, env var, command, or any named artifact — sweep its name out of comments and user-facing copy before the commit lands. A green build and green tests confirm the code compiles without it; they say nothing about a comment that still describes it or a doc that still tells users to set it.

For each removed name, grep the **whole tree** — code AND comments AND user-facing copy (READMEs, docs, CLAUDE.md, command files, UI strings, help text) — not just source:

```bash
# NAME = the deleted symbol/export/prop/env-var/command
git grep -nI -- "$NAME" -- ':!CHANGELOG.md' ':!PROJECT_VERSION.md' ':!VERSION.md'
```

Every hit that is not the intentional "Removed" changelog line is either updated to the new reality or itself removed before committing. Field report #375: retiring `MONITOR_TOKEN` left ~8 stale comment sites plus user-facing copy ("set a monitor token") that a green build + 97 unit tests never caught — because none of the stale references were code.

## Step 4 — Commit (Rogers)
Stage and commit:
1. Stage all modified version files: `VERSION.md`, the active changelog (`CHANGELOG.md` or `PROJECT_VERSION.md`), **every** bumped `package.json` (all workspace packages, not just the root), and any generated copy re-synced in Step 3
2. Stage any other files that are part of this release — explicitly, from Step 0's *session-authored* split, including any prose fixed by the Step 3.5 removal sweep. Stage by path; do **not** `git add -A` / `git add .` (that re-admits the pre-existing/out-of-scope changes Step 0 just excluded — field report #384 RC-1)
3. Craft commit message in the format: `vX.Y.Z: One-line summary`
   - If elaboration needed, add a blank line then details
   - Match the style of existing commits (check `git log --oneline -10`)
4. Present the full commit message and staged file list to the user
5. On user approval, execute the commit

## Step 4.5 — Tag (Coulson)
Annotate the commit with the version tag (default-on; opt out via `--no-tag`):
1. Run `git tag -a vX.Y.Z -m "vX.Y.Z: <one-line summary>"` against HEAD
2. Verify: `git tag --list vX.Y.Z` returns the tag
3. If a tag with that name already exists on a different commit, stop and surface the conflict — do not force-overwrite without user instruction.

Tags are local until pushed (Step 6). Why default-on: a release commit without a tag is invisible to `git describe`, GitHub releases, and most release tooling. **Field report: v23.10.0 and v23.11.0 shipped without tags in May 2026, blocking npm publish discovery downstream — exactly the kind of silent omission this step prevents.**

## Step 5 — Verify (Barton)
Confirm everything is consistent:
1. **Run the project test suite** (`npm test` / `make test` / `pytest` / `cargo test` — whichever the repo uses). If it fails, **stop** — do not proceed to Step 6 (Push). A pushed tag arms an irreversible CI publish; a failure caught here costs zero, caught after push costs a patch release (field report #363).
2. Run `git log -1 --format="%H %s"` — verify the commit exists and message is correct
3. Check version consistency:
   - `VERSION.md` current version matches
   - **every** versioned `package.json` matches the new version (all workspace packages, not just the root), and any internal dep pin reads `^<new-version>` (ADR-062)
   - any tracked generated copy re-synced in Step 3 reflects this release (VoidForge: `packages/methodology/CLAUDE.md` diff against the stripped root `CLAUDE.md` is empty)
   - The **active changelog** (PROJECT_VERSION.md if present, else CHANGELOG.md) has an entry for this version
   - Commit message starts with the correct version tag
   - `git tag --list vX.Y.Z` returns the tag (unless `--no-tag` was used)
   - **ROADMAP.md cross-check (field report #309 Fix 4):** if `ROADMAP.md` exists, grep it for the new version string. If milestones in ROADMAP.md reference a higher version than `package.json`, that's drift — surface it and offer to bump. If ROADMAP claims a milestone is "DONE" at a version that doesn't match the just-committed bump, surface that too. Drift between ROADMAP and package.json typically goes unnoticed for weeks.
4. Run `git status` — verify working tree is clean (no forgotten files)
5. If any inconsistency found, flag it and offer to fix

## Step 6 — Push (Coulson) [Optional]
Only if the user explicitly requests:
1. Check remote: `git remote -v`
2. Check if branch tracks upstream: `git status -sb`
3. Push branch: `git push`
4. Push tags (if Step 4.5 ran): `git push origin vX.Y.Z` (or `git push --tags` if multiple new tags exist)
5. Verify: `git log --oneline -1` matches remote, `git ls-remote --tags origin vX.Y.Z` shows the tag on remote

## Step 7 — Publish to npm (Dockson) [--npm only]
Only runs when the user passes `--npm`. Publishing is irreversible (npm forbids re-using version numbers) and broadcasts to every consumer, so explicit opt-in is required.

**Read this first.** If `.github/workflows/publish.yml` (or equivalent) is configured to publish on tag push, the canonical publish path is the CI workflow — pushing the tag in Step 6 already triggers it. Use `--npm` when CI is unreachable, broken, or when you need a same-session publish without waiting for the workflow. Running both in parallel is safe (the workflow's "already published" check will skip the duplicate) but wastes a CI minute.

**Tag-push ordering caveat.** If you push multiple tags in one `git push --tags` call and CI publishes them in parallel, npm's `latest` dist-tag lands on whichever finished last — not the highest semver. After a multi-tag push, verify with `npm view <name> dist-tags` and run `npm dist-tag add <name>@vX.Y.Z latest` to repoint if needed. (This bit us when v23.10.0 + v23.11.0 were pushed together in May 2026.)

1. **Preflight.** Run `npm whoami` — if not logged in, stop and tell the user to run `npm login`. Run `git status` — if working tree is dirty, stop (publishing from a dirty tree creates packages that don't match the tagged commit).
2. **Discover publishable packages.** Build the list:
   - If `package.json` at repo root has no `"private": true`, include it.
   - If a workspaces array exists, walk each workspace package; include those without `"private": true`.
   - For monorepos without workspaces (e.g., `packages/*/package.json`), glob and filter the same way.
   - Skip any package whose `version` field doesn't match the version just committed in Step 4 — surface the mismatch instead of publishing inconsistent versions.
3. **Confirm.** Print the list (`name@version`) and the registry (`npm config get registry`), then ask for confirmation. Include a note when `publishConfig.access` is `public` vs scoped.
4. **Publish in dependency order.** If one package depends on another in the list, publish the dependency first. For VoidForge specifically: `voidforge-build-methodology` publishes before `voidforge-build`.
5. **Run `npm publish` per package** from each package's own directory. Surface the tarball summary line (`+ name@version`) on success. On `EPUBLISHCONFLICT` (version already published), stop — the user needs to bump and re-run.
6. **Verify.** For each published package, run `npm view <name> version` and confirm it returns the new version. There is sometimes a few-second registry propagation lag — retry once after 5s if mismatched.
7. **Final summary.** Print which packages were published and at what version. This is the line that closes the release.

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
- `--dry-run` → Show version bump, changelog entry, commit message, tag, and (if `--npm`) the package list that would publish — without executing any of it.
- `--major` / `--minor` / `--patch` → Override the Step 2 recommendation.
- `--no-tag` → Skip Step 4.5. Use sparingly; tagless release commits are the bug that produced this flag.
- `--npm` → Run Step 7 after push: publish every non-private package whose version matches the bump. Requires `npm whoami` to succeed. For monorepos, publishes all matching packages in dependency order.

## Handoffs
- If changes include security fixes → note for Kenobi (`/sentinel`)
- If changes include infrastructure → note for Kusanagi (`/devops`)
- If version is MAJOR → recommend Picard review (`/architect`)
- If `--npm` was used → the release is now public on npm; any rollback requires a new patch version (npm forbids unpublishing within 72h for security)
