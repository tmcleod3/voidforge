# /seal — Session Closeout Ritual

> *Seal the session: ship the work, file the field report, preserve the intelligence, hand off the baton.*

`/seal` is a thin orchestration command. It runs no new persona of its own — it conducts three existing agents in sequence and always ends by printing the copy-paste prompt that boots the next session:

```
/git (commit)  →  /git (push)  →  /debrief --submit  →  /vault --seal  →  HANDOFF PROMPT
   Coulson          Coulson          Bashir               Seldon            (always printed)
```

The ordering is deliberate: commit and push first so the field report and vault describe the *final* committed state; run `/debrief` before `/vault` because `/vault` Step 1.5 folds the debrief's approved learnings into the briefing; emit the handoff prompt last so it is the final thing on screen.

## Context Setup
1. Read this file fully before acting — `/seal` is a pipeline with short-circuit rules; running stages out of order ships a misleading release.
2. The three stages have their own method docs — load on demand: `RELEASE_MANAGER.md` (`/git`), `FIELD_MEDIC.md` (`/debrief`), `TIME_VAULT.md` (`/vault`).

## Step 0 — Preflight (decide which stages apply)
1. `git status` + `git diff --stat` — is there anything to commit?
   - **Working tree clean:** there is no release to ship. Skip Stages 1–2 (commit + push), tell the user "Nothing to ship — sealing without a release," and proceed to Stage 3 (debrief) + Stage 4 (vault). A clean tree is not an error.
2. **Unrelated / pre-existing-change detection (field report #384 RC-1).** Run the same split `/git` Step 0 does — separate session-authored changes from changes that were already in the tree or fall outside this session's scope, giving **dependency manifests / lockfiles** (`package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `requirements.txt`, `Cargo.lock`, `go.sum`, …) special scrutiny via their dependency-level diff. This is exactly the vigilance that caught the v23.20.0 `vercel` near-miss by hand; doing it at Preflight surfaces it as part of the plan disclosure (step 3) instead of relying on the operator noticing mid-commit. Surface any pre-existing/out-of-scope change for an explicit include/exclude decision; **never let the downstream `/git` stage `git add -A` a release without this split.**
3. `git rev-parse --abbrev-ref HEAD` — confirm the branch. If on the default branch and a release is being cut, that is fine for this repo's flow; just surface it.
4. Echo the plan the user is about to authorize: the stages that will run, whether a push will happen, whether a GitHub field report will be filed, **and any pre-existing/out-of-scope changes detected in step 2 (with the include/exclude call)**. This single up-front disclosure is the contract — do not re-ask before each stage (the operator already authorized the whole ritual by invoking `/seal`).
5. **Arm the gate bypass for Stage 3.** `/debrief --submit` deploys sub-agents (Ezri / O'Brien / Nog / Jake), and the Silver Surfer PreToolUse hook gates *every* Agent launch — `/debrief` is an analysis command, not a Surfer review roster, so it takes the documented bypass (field report #366-F4). Run, existence-guarded:
   `[ -x scripts/surfer-gate/bypass.sh ] && bash scripts/surfer-gate/bypass.sh --light || true`
   **Stale-pointer self-repair (#384 RC-3):** `bypass.sh` now reads the live session id from `CLAUDE_CODE_SESSION_ID` and, when the repo pointer is stale (left by a `/clear`ed or crashed session), repoints it to the live session automatically — the bypass lands correctly on the first try. On older Claude Code builds without that env var the legacy behavior applies: if Stage 3's first Agent call is still blocked despite the bypass, re-run the same `bypass.sh --light` line once (the blocked `check.sh` fire repoints the pointer), then retry. Do not fight the gate beyond one re-run; if it still blocks, fall back to `/debrief --solo` for this stage.

## Step 1 — Ship (Coulson · `/git`)
Run the full `/git` release flow (version bump → changelog → commit → tag → verify). Pass through `--major` / `--minor` / `--patch` / `--no-tag` if supplied.

**Gate (do not skip):** `/git` Step 5 runs the test suite. **If the suite fails, HALT the pipeline here.** Do not push, do not file a field report (you would be reporting success on a broken build — field report #363). Jump straight to Stage 4 and seal a vault that records the failing state, so the next session resumes by fixing it. Report the failure plainly.

By default `/seal` pauses **once** — at `/git`'s version-bump + commit-message confirmation — because a commit (and the tag it arms) is consequential. `--yes` removes that pause and accepts `/git`'s recommended bump.

## Step 2 — Push (Coulson · `/git` Step 6)
Push the branch and the version tag. `/git` Step 6 is opt-in by design; invoking `/seal` *is* the opt-in. Skip this stage if `--no-push` was passed (a local-only seal). A failed push (no upstream, rejected non-fast-forward) HALTS before Stage 3 — surface it; a field report and vault that claim a pushed release would be wrong.

## Step 3 — Debrief (Bashir · `/debrief --submit`)
Run `/debrief --submit`: reconstruct the session timeline, root-cause any failures, and file the field report upstream to `tmcleod3/voidforge`. `--submit` presents the full report before it goes out (the review obligation) and then auto-proceeds — do not re-prompt.

Degrade gracefully, never fail the seal:
- **No `gh` auth / GitHub unreachable:** take `/debrief`'s `[save]` path — write the report to `/logs/debrief-YYYY-MM-DD.md` — and continue. Note that it was saved locally, not filed.
- **`--no-submit`:** run the debrief but stop at the local save; do not file upstream.
- **`--no-debrief`:** skip this stage entirely.

## Step 4 — Vault (Seldon · `/vault --seal`)
Run `/vault --seal` to write `/logs/vault-YYYY-MM-DD.md` and generate the pickup prompt. `--seal` auto-confirms the write (no review pause) — appropriate here because the operator already authorized the closeout. `/vault` Step 1.5 will pick up any learnings the debrief just approved instead of re-extracting them.

This stage always runs (even on a Stage-1 test failure or a clean tree) — the vault is the handoff artifact, and a session that ended blocked is exactly the one whose next pickup needs the most context.

## Step 5 — Handoff (always)
Print `/vault`'s **Artifact 2: Pickup Prompt** as the final output, in a fenced block, prominently, so the user can copy it verbatim into the next session. This is `/seal`'s signature deliverable and must appear even if an earlier stage halted — in that case the prompt's "Resume from:" line names the thing that blocked (e.g. "fix the 3 failing tests in X before re-sealing").

Then print a one-line ledger of what actually happened, so the outcome is unambiguous:
```
Sealed: vX.Y.Z committed ✓  pushed ✓  field report #NN filed ✓  vault sealed ✓
```
Mark any stage that was skipped or halted (`— skipped (clean tree)`, `— HALTED (tests failing)`, `— saved locally (no gh auth)`) rather than implying success.

## Arguments
| Flag | Effect |
|------|--------|
| (none) | Run all stages; pause once at the `/git` commit confirmation; file the field report upstream. |
| `--dry-run` | Show what each stage *would* do — proposed version bump, changelog entry, commit message, whether it would push, whether a field report would file, and the vault outline — without executing any of it. |
| `--yes` | Full autonomy: accept `/git`'s recommended bump + commit with no pause. (Outward-facing actions — push, upstream field report — still happen; use `--no-push` / `--no-submit` to suppress them.) |
| `--no-push` | Commit locally but do not push (Stages 1, 3, 4 only). |
| `--no-submit` | Run the debrief but save it locally; do not file the GitHub field report. |
| `--no-debrief` | Skip Stage 3 entirely. |
| `--major` / `--minor` / `--patch` / `--no-tag` | Passed through to `/git`. |

## Short-circuit summary
| Condition | Behavior |
|-----------|----------|
| Clean working tree | Skip commit + push; still debrief + vault. |
| `/git` test suite fails | HALT pipeline; skip push + submit; seal a vault recording the failure; print a "resume by fixing tests" handoff. |
| Push fails | HALT before debrief; surface the push error. |
| No `gh` auth | Save the debrief locally; continue to vault. |

## Handoffs
- `--npm` publishing is **not** part of `/seal` — it is irreversible and broadcasts to every consumer. If this release should publish, run `/git --npm` deliberately, separately.
- If the debrief surfaces a MAJOR breaking change → recommend `/architect` before the next session resumes.
