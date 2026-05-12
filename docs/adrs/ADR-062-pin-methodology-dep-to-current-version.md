# ADR-062: Always pin methodology dep to current version

- **Status:** Accepted (v23.11.3, 2026-05-12)
- **Deciders:** Thomas McLeod (owner), Picard (architect)
- **Related:** ADR-061 (npm scoped package rename — established the two-package dependency contract); ADR-038 (wizard extraction); ADR-039 (build/publish pipeline).

---

## 1. Context

VoidForge ships as two npm packages that must move together:

| Package | Role |
|---------|------|
| `voidforge-build` | Wizard + CLI |
| `voidforge-build-methodology` | CLAUDE.md, commands, methods, patterns, agents |

The CLI declares the methodology as a runtime dependency. Per the v23.9.0 Gauntlet Round-2 finding embedded in ADR-061 §8 ("Addendum — Gauntlet Round 2 — CODE-R2-001"), the CLI must declare the methodology as a runtime dep, otherwise `npx voidforge-build init` resolves nothing.

The original fix used `"voidforge-build-methodology": "*"`. The `*` range was chosen to avoid the lockstep-bump footgun: every methodology patch would otherwise force a CLI re-publish.

This was wrong on a different axis. `*` resolves to **the latest version on the registry at install time**. That means:

- v23.11.1 of the CLI shipped with `"voidforge-build-methodology": "*"`.
- v23.11.2 of the CLI shipped with `"voidforge-build-methodology": "*"`.
- The day someone publishes `voidforge-build-methodology@24.0.0` with a breaking change to CLAUDE.md structure or hook scripts, **every prior CLI release silently pairs with the new methodology major** on every fresh install. Old CLI + new methodology = undefined behavior, silently.

The footgun the `*` range was meant to avoid (lockstep bumps) is the lesser of the two. Lockstep is mechanical and visible. Cross-major drift is silent and only surfaces when a user reports breakage.

### 1.1 Why now

v23.11.1 and v23.11.2 already shipped under the broken contract. v23.11.3 is the closing release. The longer `*` lives in the registry, the larger the install base whose breakage profile depends on us never publishing a methodology major. That is not a stable contract.

---

## 2. Decision

On every `voidforge-build` release, the methodology dependency range in `packages/voidforge/package.json` MUST be bumped to `^<current-version>`.

| Release | `voidforge-build-methodology` range |
|---------|-------------------------------------|
| v23.11.3 | `^23.11.3` |
| v23.12.0 | `^23.12.0` |
| v24.0.0 | `^24.0.0` |

The `^` permits forward patch + minor moves within the current major. Cross-major moves require a new CLI release that explicitly opts in by bumping its own dep range. This is the lockstep-on-major contract, which is correct — a methodology major IS a CLI-affecting change by definition.

### 2.1 What this prevents

- Old CLI + new methodology major on fresh installs.
- Silent breakage when methodology majors ship (hook protocol changes, command rename, file layout changes).
- The drift class where `npx voidforge-build@23.11.1 init` resolves a v24.x methodology and the CLI fails on a file it doesn't recognize.

### 2.2 What this accepts

- Methodology patches no longer auto-propagate to CLI installs released before the patch. A user on `voidforge-build@23.11.3` will get `voidforge-build-methodology@^23.11.3` — i.e., the latest 23.x. Fine.
- Methodology minors (e.g., 23.12.0) auto-propagate to CLI installs on `^23.x`. Fine — methodology minors are additive by SemVer contract.
- Methodology majors (24.0.0) require a CLI release to consume. Correct — this is the explicit gate.

---

## 3. Consequences

### 3.1 Positive

- Old CLIs can never silently pair with a new methodology major.
- The dep range now communicates the supported methodology range honestly.
- Release procedure gains one mechanical step that is trivially scriptable and lintable.

### 3.2 Negative

- One additional file edit per CLI release. Mitigated by the lint gate (§4).
- If Coulson forgets to bump the range before tagging, the lint catches it pre-publish. Without the lint, the rule is prose only — equivalent to the failure mode this ADR exists to close.

### 3.3 Reversibility

High. The dep range is a single line in `packages/voidforge/package.json`. If a future release model wants different semantics, edit one file and update the lint.

---

## 4. Compliance — mechanical enforcement

Lint shipped in v23.11.3. Located at `packages/voidforge/scripts/lint-methodology-dep.ts` (TBD by Coulson during the v23.11.3 batch — Picard does not implement). Runs in:

1. **Pre-publish (`prepublishOnly` script)** — blocks `npm publish` if the dep range does not equal `^<package.version>`.
2. **CI release workflow (`.github/workflows/publish.yml`)** — same check, runs before tag-push triggers the publish job, fails the workflow with a clear message.
3. **`/git` release flow** — Coulson's Step 4.5 (auto-tag) runs the lint before tagging. If the lint fails, the tag is not created.

### 4.1 Lint contract (precise)

```
read packages/voidforge/package.json
let v = .version                                                  # e.g., "23.11.3"
let r = .dependencies["voidforge-build-methodology"]              # e.g., "^23.11.3"
let expected = "^" + v
if r !== expected:
  print "ADR-062 violation: dep range '${r}' must equal '${expected}'"
  exit 1
```

Three call sites, one contract, byte-identical comparison. No regex tolerance — the range string must equal `^<package.version>` exactly. `~`, `>=`, `*`, or any other operator fails the lint by design.

### 4.2 Verification (post-v23.11.3 publish)

- `npm view voidforge-build@23.11.3 dependencies` shows `"voidforge-build-methodology": "^23.11.3"`.
- `npm view voidforge-build@23.11.1 dependencies` still shows `"*"` (historical, frozen, not republished).
- `npm view voidforge-build@23.11.2 dependencies` still shows `"*"` (historical, frozen, not republished).

The freeze on the two broken releases is intentional. They are deprecated by the v23.11.3 release notes pointing forward; we do not retroactively republish. Users on v23.11.1/23.11.2 get the next-install warning when they pull v23.11.3 or later.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Coulson runs `/git` without the lint installed (pre-v23.11.3 cached) | LOW | MEDIUM | Lint ships in v23.11.3 itself; first release with the lint enforces from publish forward. |
| A future maintainer "fixes" the lint by relaxing it back to `*` | LOW | HIGH | This ADR; the lint comment cites ADR-062 by ID. |
| Methodology patch needs to reach old CLIs urgently (security) | LOW | MEDIUM | Cut a CLI patch with the bumped range. The lockstep cost is acceptable for the security-broadcast path. |
| User pins `voidforge-build` to an exact version and never upgrades | CERTAIN | LOW | Out of scope — this is the user's choice. The `npm deprecate` of broken releases (if needed) is the broadcast channel. |

---

## 6. Implementation scope

**Fully implemented in v23.11.3.** No stub code. The dep range edit and the lint both ship in the v23.11.3 release batch. ADR is not "fully implemented" until:

- [ ] `packages/voidforge/package.json` declares `"voidforge-build-methodology": "^23.11.3"`.
- [ ] Lint script exists, is invoked from `prepublishOnly`, and is invoked from `.github/workflows/publish.yml` before the publish step.
- [ ] `npm view voidforge-build@23.11.3 dependencies` confirms `^23.11.3` post-publish.

Riker verifies all three. Any one missing flips the ADR to Proposed.

---

**Make it so.**
