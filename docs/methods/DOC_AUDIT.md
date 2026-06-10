# DOC AUDIT — Documentation Currency & Cross-Reference Integrity
## Lead: **Surfer-led roster** · Domain: Documentation correctness (NOT UX)

> *"The map is not the territory — but a map that lies about the territory is worse than no map at all."*

## Identity

A doc audit verifies that VoidForge's prose tells the truth about VoidForge's behavior. It is a correctness discipline, not a styling one. Code drifts; commands get added, renamed, or retired; versions bump; ADRs supersede each other. Every drift leaves the docs one step behind reality, and stale docs are load-bearing lies — the next session (or the next user) acts on them. The doc audit catches that drift before it ships (field report #342 F-3).

**Doc audits are NOT a `/ux` concern.** Galadriel's UX pass evaluates the *user-facing product* — screens, flows, a11y, copy that end users read. A doc audit evaluates the *methodology and developer documentation* — method docs, command specs, the Holocron, README, ADRs, CLAUDE.md. These are different artifacts reviewed against different sources of truth. Routing doc-currency findings into a UX pass buries them under unrelated screenshots and produces neither a real UX review nor a real doc audit. Keep them separate (#342 F-3).

## Goal

After a doc audit, every documented claim is true at audit time, every cross-reference resolves, every command listed in CLAUDE.md has a matching spec (and vice versa), and the version stated in the docs matches the single source of truth. A reader who trusts the docs is not misled.

## The Four Checks

A doc audit is four distinct verifications. Each has its own source of truth — the audit is the act of diffing prose against that source (#342 F-3).

### 1. Currency

Documentation describes the system **as it is now**, not as it was. For every factual claim that can go stale — counts, file paths, feature lists, "X does Y" behavioral statements — verify it against the live artifact:

| Claim type | How to verify |
|------------|--------------|
| Agent / command / pattern counts | `ls .claude/agents/*.md \| wc -l`, count the rows in the relevant table |
| File paths cited as deliverables | `[ -f <path> ] && echo present \|\| echo MISSING` |
| Behavioral claims ("the hook blocks X") | Read the code, not memory — the doc must match the implementation |
| Retired / renamed features | grep for the old name; if it still appears as current, it is stale |

Document each verified claim with its source (`from ls`, `from <file>:<line>`). A claim you cannot anchor to an artifact is a claim you cannot defend.

### 2. Cross-Reference Integrity

Every internal reference must resolve. Broken cross-references rot silently because nothing errors at read time:

- **File links** — every `/docs/...`, `/.claude/...`, pattern, and method path cited must exist on disk.
- **ADR references** — every `ADR-NNN` mentioned must correspond to a real, current ADR; superseded ADRs must say so.
- **"See X" pointers** — the target section/doc must still exist and still cover what the pointer claims.

Verification is mechanical: extract every path-like and `ADR-NNN`-like token, then existence-check each one.

### 3. Command ↔ Method Sync

The command table in CLAUDE.md, the slash-command specs in `.claude/commands/`, and the method docs in `/docs/methods/` describe the same surface from three angles. They must agree:

- Every command in the CLAUDE.md table has a spec file in `.claude/commands/` and a method-doc entry where one is expected.
- Every command spec in `.claude/commands/` appears in the CLAUDE.md table (no orphan commands).
- Aliases (e.g. `/review` → `/engage`, `/security` → `/sentinel`) are documented as aliases in all three places, not as independent commands in one and missing from another.
- Flag taxonomy claims (which flag works on which command) match the command specs.

A command documented in one place but missing from another is a sync defect — report it.

### 4. Version-SSOT Consistency

There is one source of truth for the version. Every other mention must match it:

- Identify the SSOT (e.g. `VERSION.md`, `package.json` `version`, the latest `/git` release tag).
- Every version string in docs, changelog headers, and README badges must equal the SSOT.
- The changelog must have an entry for the current version; a version bumped without a changelog entry is a currency defect (Coulson's domain).

Mismatched version strings are the most common — and most embarrassing — doc defect. They are also the cheapest to verify: grep for version-shaped tokens, compare to SSOT.

## The Surfer-Led Doc Roster

Doc audits run under the Silver Surfer Gate like any other review command — announce the herald, launch the Surfer, deploy the roster it returns. The Surfer biases toward the documentation specialists below for this domain; it is not a fixed list, and the Surfer may add cross-domain agents when the diff warrants (#342 F-3).

| Agent | Universe | Focus in a doc audit |
|-------|----------|----------------------|
| **Troi** | Star Trek | PRD ↔ implementation claim traceability — does every documented claim trace to something that actually exists in code/PRD? Catches requirement and asset gaps. |
| **Wong** | Marvel | Doc accuracy — API docs, inline comments, README correctness; the guardian of "does the prose match the code." |
| **Irulan** | Dune | Documentation completeness — the historian checks for *missing* documentation: undocumented commands, agents, ADRs, and features that exist but are described nowhere. |
| **Coulson** | Marvel | Version / changelog currency — version-SSOT consistency, changelog completeness, release-note accuracy. |

**Division of labor:** Troi works inward (claim → does it trace?), Irulan works outward (artifact → is it documented?). Together they close both gaps: documented-but-false (Troi) and true-but-undocumented (Irulan). Wong validates the prose itself; Coulson owns everything version- and release-shaped.

## Integration Points

| Command | How it uses the doc audit |
|---------|---------------------------|
| `/git` | Before a release, Coulson verifies version-SSOT consistency and changelog currency as part of the bump. |
| `/engage` | Code-review passes flag doc drift adjacent to changed code — but a full doc audit is its own pass, not a `/engage` side effect. |
| `/debrief` | Field reports about stale or wrong docs feed doc-audit scope; Bashir routes them here, not to `/ux`. |
| `/void` | After a methodology sync, run a doc audit to confirm the merged docs still cross-reference correctly. |

## Anti-Patterns

- **Routing doc currency to `/ux`** — the most common misroute. UX reviews the product; doc audits review the methodology docs. Different source of truth, different roster (#342 F-3).
- **Auditing from memory** — every currency claim must be anchored to a live artifact (`ls`, file existence, code read). A claim you cannot source is a claim you cannot verify.
- **Spot-checking cross-references** — broken links rot silently. Extract *every* path/ADR token and existence-check all of them, not a sample.
- **Fixing prose without checking the other two angles** — a command renamed in CLAUDE.md but not in its spec file (or vice versa) is still broken. Sync is a three-way agreement, not a one-way edit.
- **Treating version mismatch as cosmetic** — a wrong version string in the docs is a correctness defect: it tells the reader they are on a release they are not on.
