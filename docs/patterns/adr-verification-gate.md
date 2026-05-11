# Pattern: ADR Verification Gate

**When to use:** Every ADR with a verification gate. The gate must prove the *fix* is correct — not merely that a refactor preserved existing behavior.

**Source:** Field reports #313 (Fixture Bindability), #314 (HARD GATE feasibility), #318 (sum-verification), #316 (schema cross-check).

## The Failure Mode

ADRs ship with verification gates that record PASS but cannot demonstrate fix correctness. Examples:

- **Refactor-only proof:** ADR-040 (#313): "12-day forensic window is bit-identical." Straddle P&L was unchanged before and after — but the forensic window never exercised the capped path. Proximity stayed wide enough that the cap ceiling was never hit. The PASS proved arithmetic preservation, not cap correctness.
- **Empty-solution gate:** ADR-036 M9.1a HARD GATE (#314): asked the kernel to identify forensic-directional days using only pre-midnight 4h inputs. Algebraic intersection of "directional" and "symmetric" pins had no solution. Required operator escalation + reframing.
- **Aspirational claim:** ADR-039 (#313): header said `STRUCT-006, STRUCT-012 — fully implemented in v0.4.0`. At HEAD, neither existed. No file-existence check before marking Accepted.

## The Pattern

Every ADR includes a Verification Gate block:

```markdown
## Verification Gate

**Fixture:** <data set / scenario / runtime state used to exercise the gate>

**Can the gate FAIL under this fixture?** <yes | no + algebraic/empirical rationale>
  - If **no**: this is a refactor-correctness test, not a fix-correctness test.
    Add a fixture where the fix CAN bind, OR downgrade the verification claim
    to "preserves prior behavior" (which is a refactor proof, not a fix proof).

**Fixture-bindability proof:** <one sentence showing the fixture would detect
  regression if the fix were incorrect>

**Rehearsed at:** <commit-sha or "not yet" — see Step 4.7 of architect.md>

**Implementation Scope (reality anchor):**
  - Status: Proposed | Accepted | Deferred
  - Deliverables exist at HEAD?
    - <path/1> — <existence-check command + result>
    - <path/2> — <existence-check command + result>
  - If any deliverable is missing: status MUST be "Proposed," not "Accepted."

**Sum-verification (if ADR contains numbered cohorts):**
  - Headline claim: "<X total>"
  - Independent sum of cohorts: <Y>
  - Match? <yes | no + which is canonical>
```

## Decision Tree

| Situation | What to do |
|-----------|-----------|
| Gate fixture is fixed historical data | Verify the data exercises the fix path. If the historical window doesn't trip the gate, add a synthetic adversarial case. |
| Gate is "bit-identical to prior implementation" | Acceptable as a refactor proof. NOT acceptable as the only evidence the fix is correct — pair with a fix-correctness gate. |
| Gate is a HARD GATE with multiple acceptance pins | Compute the algebraic intersection of all pins. If the solution set is empty, the gate is structurally infeasible — escalate to operator. |
| ADR cites file paths as deliverables | Run `[ -f <path> ] && echo present || echo MISSING` for each before marking Accepted. |
| ADR cites cohort sums (e.g., "55 tables = 37+5+7+5+1") | Spock-style independent sum. Mismatch → document which is canonical. |
| ADR amends an earlier ADR | Cross-ADR cascade scan: every dependent ADR's references must be checked for stale claims. Bundle amendments in one commit. |

## Anti-Patterns

- **"Bit-identical" without fixture-bindability proof.** Demonstrates arithmetic preservation, not fix correctness.
- **"Fully implemented in vX.Y" without a file-existence check.** Aspirational status; reviewers gain false confidence.
- **HARD GATE pins derived from post-hoc forensic labels.** Algebraically infeasible if the kernel's input set doesn't contain the discriminating signal.
- **Numbered breakdowns without independent sum.** Cascades into wasted reviewer cycles when 3+ downstream agents independently re-verify the math.
- **Single-form structural sentinels.** A gate that detects only `current_setting(...) = ''` misses commuted, cast, IS-NULL, and coalesce variants. See `/docs/patterns/structural-sql-sentinel.py` for adversarial-test discipline.

## When the Gate Cannot Bind

If the proposed fixture cannot exercise the fix:

1. Construct a synthetic fixture that does. (For numerical kernels: jitter inputs across the threshold. For RLS gates: test under a non-owner role. For middleware: test at expected RPS.)
2. If no fixture is feasible (e.g., the fix is a defensive guard for an unreachable state), the ADR is documenting a *theoretical* fix — say so explicitly: *"Verification: theoretical; this guard cannot be exercised in normal operation."*
3. NEVER ship a PASS that asserts only what the algebra already requires.

## Riker's Standing Question

When reviewing any ADR with a Verification Gate, Riker asks: *"Can this gate FAIL under the proposed fixture?"* The honest answer drives the disposition:

- **Yes, with a clear failure path** → gate is sound; ADR may be Accepted.
- **No, the algebra forbids it** → gate is circular; require an additional fix-correctness fixture or downgrade the claim.
- **Unsure** → spike a deliberate regression and observe whether the gate trips.
