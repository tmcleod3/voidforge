# Autonomous Operations Triage Policy

**Scope:** Ops-flavored projects (infrastructure repos, monitoring daemons, homelab automation, scheduled-task systems) where the assistant is invoked autonomously and must decide whether to act, propose, or escalate without the operator present.

**Status:** Pattern v1 (v23.11.4). Promoted by Wong from field reports #337, #336, #334.

**Why this exists:** Two operators independently reinvented the same 4-bucket model across three projects (threadplex-ops, 1999collection M30-M32, 1999collection M20-M28). The pattern is reusable across all infrastructure repos. Codifying it stops the reinvention.

## The 4-Bucket Model

Classify every proposed autonomous action into exactly one bucket:

| Bucket | Action | When | Logging | Operator Notification |
|--------|--------|------|---------|----------------------|
| **A — Self-resolving** | Auto-execute | Action is fully reversible, low-blast-radius, has a clear procedure, and was authorized in a durable instruction (CLAUDE.md, agent definition, prior issue) | Append to ops log | None unless asked |
| **B — Runbook-safe** | Follow runbook procedure | Action is documented in a runbook, has been executed successfully before, and operator pre-approved the runbook | Append to ops log with runbook ID | Summary at next session start |
| **C — Operator-approval required** | Propose via Telegram button / GitHub issue / explicit message; WAIT | Action has medium blast radius, irreversible side effects, OR runbook ambiguity | Log proposal + decision | Active notification (Telegram, Slack, email per project) |
| **D — Hard-never** | Log + escalate; NEVER attempt | Action is on the forbidden list (e.g., production rollback without ticket, secret rotation without quorum, destructive migration without approval) | Log attempt + escalation | Active high-priority alert |

## Pairing with SessionStart Hook

Ops projects should pair this policy with a `.claude/settings.json` SessionStart hook that injects current state and a reminder of the policy:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "bash .claude/hooks/session-start.sh",
        "description": "Inject current ops state + triage policy reminder"
      }
    ]
  }
}
```

The hook script outputs the current pending-action set (read from `logs/pending-actions.json` or similar) plus a one-line reminder pointing at this policy file.

### Visibility rule

**SessionStart hook output is context-only — the assistant must `echo` the relevant portions back to the operator at session start.** Otherwise the operator has no visual confirmation that the hook fired and the policy is live. Both #337 and #336 documented operators discovering that hooks were silently running with no visibility — both reinvented an explicit echo step. Make it part of the policy from day one.

## Decision Tree (Each Proposed Action)

```
Is the action on the forbidden list (D)?
  Yes → Log attempt, raise high-priority alert, STOP.
  No  → Continue.

Does the action have an approved runbook (B)?
  Yes → Execute runbook, log with runbook ID. STOP.
  No  → Continue.

Is the action fully reversible AND low blast radius AND pre-authorized in durable instructions (A)?
  Yes → Execute, log. STOP.
  No  → Bucket C: propose to operator, wait, do not execute until approved.
```

## Logging Format

Each ops log entry should record:

```jsonl
{
  "timestamp": "2026-05-12T19:42:00Z",
  "bucket": "A|B|C|D",
  "action": "short description",
  "decision": "executed|proposed|escalated|skipped",
  "rationale": "why this bucket",
  "runbook_id": "RB-007 if applicable",
  "operator_notified": false,
  "outcome": "success|failed|pending"
}
```

JSON Lines (one object per line) keeps the log greppable and append-only.

## Adoption Checklist

For a new ops-flavored project:

- [ ] Pick the buckets that apply (most projects use all four)
- [ ] Write the forbidden list (Bucket D) FIRST — concrete and exhaustive
- [ ] Document each runbook (Bucket B) with a fixed ID, expected outcome, and rollback procedure
- [ ] Set up the SessionStart hook + echo step
- [ ] Configure the operator-notification channel (Telegram bot, GitHub issue, etc.)
- [ ] Establish the ops log path and rotation policy
- [ ] Add a one-line reminder of this policy to the project's `CLAUDE.md` Personality section

## Non-Goals

This pattern is NOT:

- A replacement for `/campaign` or `/build` — those are user-driven workflows with human pacing
- A general agent-permissioning model — settings.json `allow`/`deny` lists handle tool-level permissions
- A substitute for tested code — Bucket A actions still need their own correctness verification

## See Also

- `docs/patterns/daemon-process.ts` — daemon lifecycle, PID management, signal handling
- `docs/methods/HEARTBEAT.md` — long-running ops job scheduling
- `docs/methods/FIELD_MEDIC.md` — post-mortem analysis for ops incidents
