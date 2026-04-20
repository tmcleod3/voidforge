# ADR-056: Observability Bootstrapping

## Status
Accepted — 2026-04-20 (v23.8.15 shipped Mission 9a; this ADR reconciled with shipped reality in v23.8.16 Gauntlet 40 fix batch)

## Context
`/logs/` exists with 29 files (not missing — prior review had a stale finding). Three observability gaps were real:

1. **No structured `surfer-gate-events.jsonl`.** Cherry-picking (Surfer returned N agents, orchestrator launched M < N) was undetectable from logs. Field report #68 documented the pattern without a machine-readable record.
2. **No `orchestration-metrics.jsonl`.** "Is the orchestration improving over time?" was unanswerable — `agent-activity.jsonl` is truncated at session start, destroying trend signal.
3. **Decision traceability is freeform.** `decisions.md` has no `agent:` or `command_context:` mandatory fields, so post-mortems can't trace a decision to its source.

## Decision

Add structured JSONL event logging. Ship in phases to match implementation reality.

### `/logs/surfer-gate-events.jsonl` — shipped v23.8.15

**Actual shipped schema** (rewritten from the original proposal after implementation revealed simpler shape was sufficient):

```json
{"ts":"2026-04-20T20:00:00Z","session_id":"<uuid>","event":"ALLOW","subagent_type":"<name>","tool_name":"Agent","reason":"<human-readable>"}
{"ts":"2026-04-20T20:00:01Z","session_id":"<uuid>","event":"BLOCK","subagent_type":"<name>","tool_name":"Agent","reason":"<human-readable>"}
{"ts":"2026-04-20T20:00:02Z","session_id":"<uuid>","event":"ROSTER_RECEIVED","roster_json":"<escaped JSON>"}
```

Event values in use:
- `ALLOW` — hook allowed the Agent call (self-launch, bypass, or fresh roster present)
- `BLOCK` — hook blocked the Agent call (no roster, no bypass, not Surfer)
- `ROSTER_RECEIVED` — orchestrator recorded a roster via `record-roster.sh`

**Writer:** `scripts/surfer-gate/check.sh` (ALLOW/BLOCK) and `scripts/surfer-gate/record-roster.sh` (ROSTER_RECEIVED). Both emit to session-scoped `/tmp/voidforge-session-<id>/surfer-gate-events.jsonl` AND repo-persistent `$CWD/logs/surfer-gate-events.jsonl`.

**Cherry-pick detection query (jq):**
```
jq -s 'group_by(.session_id) | map({
  session: .[0].session_id,
  rostered: (map(select(.event == "ROSTER_RECEIVED")) | length),
  allowed:  (map(select(.event == "ALLOW" and .subagent_type != "Silver Surfer")) | [.[].subagent_type] | unique | length)
})' logs/surfer-gate-events.jsonl
```

If `rostered > 0` and `allowed < expected_roster_size`, that's a cherry-pick signal.

**Superseded schema note:** The original ADR draft specified `GATE_LAUNCHED | ROSTER_RECEIVED | ROSTER_DEPLOYED | GATE_SKIPPED | DEPLOY_PARTIAL` event types with `roster_returned` / `roster_deployed` / `violation` fields. That schema was designed before implementation revealed the hook has sufficient signal with simpler ALLOW/BLOCK events — the hook fires on every Agent call, so distinct events per roster agent are unnecessary; the `subagent_type` in ALLOW events provides the deployment record. Kept simpler, cost fewer JSONL bytes, stayed below cognitive budget.

### `/logs/orchestration-metrics.jsonl` — Mission 9b (deferred)

Per-command-completion metrics. Requires an orchestrator-side contract (when is a command "done"?). Not a hook event. Deferred until that contract is designed.

Proposed schema (when built):
```json
{"command":"/gauntlet","ts":"...","roster_count":18,"dispatched":18,"cherry_pick_delta":0,"findings":{"critical":2,"high":7},"duration_ms":142000,"protocol_violations":[]}
```

### `agent-activity.jsonl` — session-start separator (Mission 9c, deferred)

Replace truncation with `{"event":"session-start",...}` separator entries. Danger Room ticker filters to latest separator. Blocks on Danger Room ticker active development.

### `decisions.md` — mandatory fields (deferred)

Add `agent:` (who decided) and `command_context:` (which command run / which round). Documentation hygiene, separate commit.

## Consequences
**Positive:** cherry-pick detection becomes automatic for surfer-gate events as of v23.8.15. Per-session and cross-session log both available.
**Negative:** append-only file in `logs/` grows unbounded. Rotation policy (10MB → archive) is future work; low priority at current event rate.

## Alternatives Considered
- Original `GATE_LAUNCHED/ROSTER_DEPLOYED/DEPLOY_PARTIAL` schema — rejected post-implementation as over-specified. The shipped ALLOW/BLOCK schema has equivalent forensic value at lower complexity.
- TypeScript `log()` helper in methodology package — rejected (YAGNI; no TypeScript caller exists, per the no-stubs doctrine).
- Structured logs in method-doc prose — rejected, unqueryable.
- Database-backed event store — over-engineered for solo-maintainer tooling.

## Related ADRs
ADR-051 (`check.sh` + `record-roster.sh` are the JSONL writers).

## Rollout
- **v23.8.15:** Mission 9a shipped — `surfer-gate-events.jsonl` live, documented in BUILD_JOURNAL.md.
- **v23.8.16** (this release): schema reconciled with shipped reality. Superseded original schema proposal.
- **v23.9.x (future):** Mission 9b orchestration metrics, once orchestrator command-completion contract is designed.
- **v23.9.x (future):** Mission 9c agent-activity.jsonl separator, once Danger Room ticker is under active development.
