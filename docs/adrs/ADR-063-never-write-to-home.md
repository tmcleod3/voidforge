# ADR-063: Never write to `$HOME`

- **Status:** Accepted (v23.11.3, 2026-05-12)
- **Deciders:** Thomas McLeod (owner), Picard (architect)
- **Related:** Issue #331 (the field report that surfaced this); ADR-060 (Surfer-gate state location — `$HOME/.voidforge/gate/` is the one and only sanctioned `$HOME` write, and it is owned by a different code path); FORGE_KEEPER Operating Rule #10 (predecessor — "never write to `~/.claude/`"); FORGE_KEEPER Operating Rule #11 (this ADR's codification).

---

## 1. Context

### 1.1 The incident (#331)

`npx voidforge-build update` overwrote a user's `~/CLAUDE.md` silently. Root cause: `findProjectRoot()` (in the wizard's `marker.ts`) walks upward from `process.cwd()` looking for a marker (`.voidforge`, `.git`, or the legacy CLAUDE.md heuristic). When invoked from a directory that has no such marker on the chain to the filesystem root, the walk continued past `$HOME` and either:

1. Resolved a marker that happened to exist above `$HOME` (e.g., an accidental `.git` in `/Users/<user>/`), OR
2. Returned the user's home directory itself as the "project root" because a `CLAUDE.md` file existed there for an unrelated reason (e.g., personal notes, a different tool's config).

The updater then proceeded to treat `$HOME` as the project root and overwrote `~/CLAUDE.md` with the methodology copy. No prompt. No diff. No backup. The user discovered it by reading the file later.

This is the same class of failure as Operating Rule #10 (writing to `~/.claude/`), which was a downstream symptom of the same root cause — the walk had no `$HOME` floor.

### 1.2 Scope of the failure mode

`findProjectRoot()` is called from many places: `update`, `init` (sub-paths), `correlation-engine`, daemon spawners, and several wizard internals. Any of them, invoked from a working directory without a clear project marker, can walk past `$HOME` and "find" something it shouldn't write to. The bug exists at the walker, not at any individual caller.

Adjacent risk surface (any code that writes a file path computed from a root-walk):

- `packages/voidforge/wizard/lib/updater.ts` — file overwrite (the #331 path).
- `packages/voidforge/wizard/lib/project-init.ts` — file creation in a directory the user did not ask for.
- `packages/voidforge/wizard/lib/correlation-engine.js` — log appends.
- Any future code that uses `findProjectRoot() ?? process.cwd()` and then writes.

The fallback `?? process.cwd()` is not safer — if the cwd happens to be `$HOME`, the write still lands in `$HOME`.

### 1.3 Why a boundary, not a marker requirement

The walker was "fixed" once before by tightening the marker (Operating Rule #10 enforced the `~/.claude/` check at the destination). That patched one destination, not the walker. Every new caller had to remember the rule. The class of bug returned in #331 against a different file (`~/CLAUDE.md` instead of `~/.claude/commands/`).

The correct fix is a single mechanical invariant at the walker: **`findProjectRoot()` returns `null` if the walk crosses `$HOME`**. Every caller that does `findProjectRoot() ?? process.cwd()` then degrades to cwd. Every caller that needs a project root and gets `null` aborts with a user-friendly error pointing the user to `cd` into a VoidForge project first.

---

## 2. Decision

**Any code path that resolves a project root MUST enforce a `$HOME` boundary.** Specifically:

1. The walker (`findProjectRoot()` and any equivalent) terminates and returns `null` when the candidate directory equals `$HOME` or any ancestor of `$HOME`. It does not "skip" `$HOME` and continue — it stops.
2. Callers that need a project root and receive `null` MUST error out with: "Not inside a VoidForge project. Run `voidforge init` first or `cd` into an existing project." They MUST NOT silently fall through to `$HOME`, `/tmp`, `/`, or any other path.
3. Callers that have a documented fallback (e.g., `process.cwd()`) MUST themselves enforce the `$HOME` boundary on the fallback. `findProjectRoot() ?? process.cwd()` is forbidden as written; the fallback must check that `cwd !== $HOME` (and is not an ancestor of `$HOME`) before returning it.

The `$HOME` boundary is read once from `os.homedir()` (Node) — not from `$HOME` env directly, to defend against env-var shenanigans (empty string, missing var, deliberately overridden in tests where `os.homedir()` still resolves to the real home).

### 2.1 Sanctioned `$HOME` writes (allow-list)

This decision forbids writes to `$HOME` for project-root-derived paths. It does NOT forbid all writes to `$HOME`. Three callers legitimately write under `$HOME`:

| Path | Purpose | Authority |
|------|---------|-----------|
| `$HOME/.voidforge/gate/` | Surfer-gate session state | ADR-060 |
| `$HOME/.npm/`, `$HOME/.config/`, etc. | Third-party tools (npm, gh, etc.) | Out of VoidForge's control |
| `$HOME/<explicitly-named-project>` | A user-chosen install target passed as an argument | User-explicit |

Each of these is path-explicit and does not derive from a project-root walk. The forbidden pattern is **walker-derived writes that land in `$HOME` because the walk overshot**. The allow-list is enumerated; anything else is a violation.

---

## 3. Consequences

### 3.1 Positive

- `~/CLAUDE.md` is structurally unreachable from `findProjectRoot()`-derived writes.
- The fix is at the walker, not at every destination. Future callers inherit the protection without remembering the rule.
- Failure mode is loud (clear error) instead of silent (overwrite).
- Closes the entire class identified by Rule #10 (`~/.claude/`) and #331 (`~/CLAUDE.md`) with one invariant.

### 3.2 Negative

- Users who deliberately run `voidforge` commands from inside `$HOME` (rare, but documented for users with Desktop-as-project setups) now get an explicit error instead of an unexpected write. This is correct, but it is a behavior change. The error message names the workaround (`cd` into a real project directory or pass an explicit path).
- One additional integration test per CI run.

### 3.3 Reversibility

Medium. The boundary is mechanical and centralized — easy to relax if a future requirement forces it. Relaxing it requires updating both the walker and the test (§4), which gives a maintainer pause before defeating it.

---

## 4. Compliance — mechanical enforcement

Integration test ships in v23.11.3. Located at (TBD by Stark during the v23.11.3 build — Picard does not implement; suggested path `packages/voidforge/__tests__/home-boundary.integration.test.ts`).

### 4.1 Test contract

```
setup:
  create tempHome = mkdtemp("voidforge-home-test-")
  set process.env.HOME = tempHome
  stub os.homedir() to return tempHome  # critical — see §2 paragraph
  write tempHome/CLAUDE.md with sentinel content "DO_NOT_OVERWRITE_${nonce}"
  write tempHome/.claude/commands/sentinel.md with sentinel content

run:
  invoke CLI from tempHome (i.e., cwd = $HOME, no project markers above)
  - `voidforge-build update`  → MUST exit non-zero with the not-in-project message
  - `voidforge-build init` (no args) → MUST refuse to initialize $HOME as a project

assert:
  tempHome/CLAUDE.md byte-identical to setup content
  tempHome/.claude/commands/sentinel.md byte-identical to setup content
  no new files written under tempHome (except sanctioned allow-list paths from §2.1 — specifically $HOME/.voidforge/gate/ which is permitted)

teardown:
  rm -rf tempHome
```

The test runs in CI on every PR and on the release workflow before publish.

### 4.2 Static check (companion)

A grep gate in CI rejects the pattern `findProjectRoot() ?? process.cwd()` and `findProjectRoot() || process.cwd()` in `packages/voidforge/`. New callers must use the helper that wraps the boundary check (helper name TBD by Stark — suggested `findProjectRootOrFail()`). The grep is brittle by design — one syntactic form, one fix.

### 4.3 Codification — FORGE_KEEPER Rule #11

Append to `docs/methods/FORGE_KEEPER.md` Operating Rules section:

```
11. **NEVER write to `$HOME` from a project-root-derived path.** `findProjectRoot()`
    enforces a `$HOME` boundary — if the walk reaches `$HOME` or any ancestor, it
    returns `null`. Callers that get `null` MUST error out, not fall back to cwd
    when cwd is `$HOME`. The only sanctioned `$HOME` writes are the explicit
    allow-list in ADR-063 §2.1. Field report #331 documents the predecessor failure.
```

Rule #10 (`~/.claude/`) remains — it is a more specific narrowing. Rule #11 is the general invariant. Both stand.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| A new caller uses a direct `process.cwd()` write without going through `findProjectRoot()` | MEDIUM | HIGH | Static grep gate (§4.2). Code review catches the pattern. |
| `os.homedir()` returns the wrong path in an edge environment (Docker, CI, custom setup) | LOW | MEDIUM | The boundary is conservative — false positives error out with a clear message, no data loss. False negatives are the dangerous case and are very rare on `os.homedir()`. |
| User legitimately wants to run VoidForge with `$HOME` as the project root | VERY LOW | LOW | Explicit `--root <path>` flag (TBD if needed). Not in scope for v23.11.3. |
| Test stub of `os.homedir()` doesn't match production path resolution | LOW | MEDIUM | Use the same module-level resolution in both prod and test (single helper). The integration test exercises the real CLI binary, not a mock. |
| Sanctioned write to `$HOME/.voidforge/gate/` (ADR-060) gets caught by an over-eager future tightening of this rule | LOW | MEDIUM | The allow-list in §2.1 is part of this ADR and any future tightening must explicitly amend it. |

---

## 6. Implementation scope

**Fully implemented in v23.11.3.** No stub code. ADR is not "fully implemented" until:

- [ ] `findProjectRoot()` (and any equivalent walkers) return `null` on `$HOME`-boundary cross.
- [ ] All call sites in `packages/voidforge/wizard/lib/` reviewed; `?? process.cwd()` fallbacks replaced with the boundary-checked helper or an explicit error.
- [ ] Integration test (§4.1) exists and passes in CI.
- [ ] Static grep gate (§4.2) installed and rejects forbidden patterns.
- [ ] FORGE_KEEPER Operating Rule #11 (§4.3) appended.
- [ ] Field report #331 cross-references this ADR in its resolution note.

Riker verifies all six. Any one missing flips the ADR to Proposed.

---

## 7. References

- Issue #331 — `npx voidforge-build update` overwrote `~/CLAUDE.md`.
- ADR-060 — Surfer-gate state location (sanctioned `$HOME/.voidforge/gate/` write).
- FORGE_KEEPER Rule #10 — predecessor narrowing (`~/.claude/`).
- `packages/voidforge/wizard/lib/marker.ts` — `findProjectRoot()` implementation site.
- `packages/voidforge/wizard/lib/updater.ts` — primary affected caller (the #331 path).
- `packages/voidforge/wizard/lib/project-init.ts` — second affected caller.
- `packages/voidforge/wizard/lib/correlation-engine.js` — third affected caller.

---

**Make it so.**
