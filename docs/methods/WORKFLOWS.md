# WORKFLOWS — Dynamic Workflow Orchestration (the authoring standard)

> When a command fans out more agents than one conversation can coordinate, the deterministic skeleton belongs in a **Workflow script**, not in the lead's context. The personas and the judgment stay prose; the *scheduling* becomes code.

VoidForge's heavy commands (`/gauntlet` 60–80 agents, `/assemble` review phases) were authored before the Workflow tool existed and hand-fan sub-agents via the Agent tool — every intermediate findings table lands in the lead's context. Dynamic Workflows move the fan-out into a JavaScript script whose intermediate results live in **script variables**; only the final synthesis reaches the lead. This is the supported escalation of the dispatch discipline in `SUB_AGENTS.md`.

Canonical scripts live in **`.claude/workflows/*.workflow.js`** and are invoked via the Workflow tool (`scriptPath`).

## When to use a workflow (vs raw Agent dispatch)

| Use a **workflow** | Use **raw Agent dispatch** |
|---|---|
| 10+ agents, or fan-out → reduce → synthesize | 2–9 agents the lead orchestrates directly |
| Repetitive/deterministic rounds, loop-until-dry | The lead must judge between every round |
| Intermediates would flood the lead's context | Findings are few and the lead acts on each |
| `/gauntlet`, `/assemble` review phases | a one-off targeted review |

## The canonical shape

**Fan-out → reduce/dedupe (plain JS) → schema-validated verify → synthesize.** The reduce/dedupe step is *plain JavaScript* (a `Map`, a `filter`) — do **not** spend an agent on it.

```js
export const meta = {                       // MUST be a pure literal — no vars/calls/spreads
  name: 'example', description: 'one line', // shown in the gate/permission dialog
  phases: [{ title: 'Find' }, { title: 'Verify' }],
}
const roster = typeof args === 'string' ? JSON.parse(args) : args   // see Gotcha 1
phase('Find')
const found = (await parallel(roster.map(a => () =>
  agent(prompt(a), { label: `${a.name} · find:${a.key}`, phase: 'Find', schema: FINDINGS, agentType: a.name })
))).filter(Boolean)   // agentType resolves by the agent's `name:` display field — see Gotcha 6
const claims = dedupe(found.flatMap(f => f.findings))   // plain JS reduce — no agent
phase('Verify')
const verdicts = await parallel(claims.map(c => () =>
  agent(refutePrompt(c), { label: `verify:${c.id}`, phase: 'Verify', schema: VERDICT })))
return { confirmed: claims.filter((c,i) => verdicts[i]?.survives) }
```

## API essentials

- `phase(title)` — groups subsequent `agent()` calls in the `/workflows` progress tree.
- `parallel(thunks)` — **barrier**: awaits all; a failed thunk resolves to `null` (`.filter(Boolean)`). Use only when you need all results together (dedup, early-exit, cross-comparison).
- `pipeline(items, stage1, stage2, …)` — **no barrier**: each item flows through all stages independently. The **default** for multi-stage work (verify-as-soon-as-found).
- `agent(prompt, {schema, agentType, model, label, phase, isolation})` — spawn a sub-agent. With `schema` (JSON Schema) it returns the validated object and **auto-retries on malformed output** — this replaces "please return JSON and hope." Without schema, returns final text.
- `log(msg)` — narrator line. `budget` — token target. `workflow(name|{scriptPath}, args)` — nested run (one level).

## Gotchas (paid for in field reports)

1. **`args` arrives as a JSON string** (#363 F5). First line of every script that takes structured args: `const parsed = typeof args === 'string' ? JSON.parse(args) : args;` — `args.map(...)` on the raw value throws `is not a function`.
2. **Label must lead with the character name** (#348 #2): `"Picard · review:arch"`, not `"review:arch"` — a bare dimension key overrides the agent identity and breaks the Danger Room ticker correlation. Omit the label to let `agentType` surface on its own.
3. **No `Date.now()` / `Math.random()` / argless `new Date()`** — they throw (they'd break resume). Pass timestamps via `args`; vary by index for "randomness."
4. **Concurrency caps (ADR-059):** ~16 concurrent / ~1,000 total per run. `parallel([...])` accepts 100s of items but only ~16 run at once. **Batch** unbounded fan-outs (glob-then-partition, `SUB_AGENTS.md`); never one-agent-per-file on a large repo.
5. **Cost lever:** route cheap stages with `agent(p, {model:'haiku'})` (scout pre-scans) and reserve the default model for synthesis — the way the Surfer already runs on Haiku.
6. **`agentType` resolves by the agent's `name:` display field, NOT the filename** (e.g. `'Picard'`, not `'picard-architecture'`). A filename-style `agentType` fails to resolve and the `agent()` call returns `null` (silently filtered by `.filter(Boolean)`), so the agent simply never runs. If a roster carries both, pass `a.name`. Same rule as the Agent tool's `subagent_type`.
7. **Validate before shipping:** a workflow script's top-level `await`/`return` make a bare `node --check` fail ("Illegal return statement") — that is expected (the runtime wraps the body in an async fn). Use `npm run validate:workflows` (wired into `pretest`), which reproduces the wrapper before checking, so a real syntax error is caught in CI rather than shipping to npm.

## Gate interop (ADR-064) — REQUIRED

The Silver Surfer gate's `PreToolUse` hook now matches `Agent|Workflow`, so **a Workflow launch is gated like an Agent launch**. A command that runs a *review* workflow MUST satisfy the gate at the launch boundary:

1. **Muster the Surfer** (Agent tool — self-launch is always allowed) and **`record-roster.sh`** the returned roster — *before* invoking the Workflow.
2. **Invoke the Workflow**, passing the roster via `args`. The gate allows it (roster recorded); the workflow's internal `agent()` calls are the contents of that authorized roster.

Build/apply/research workflows that are **not** a review roster set a `--light`/`--solo` **bypass** (`bypass.sh`) instead. Never invoke a review Workflow without a recorded roster — that was the exact bypass ADR-064 closed.

## What stays prose (workflows orchestrate; they don't replace judgment)

The 264 personas, the Agent Debate Protocol, severity re-rating from votes, the "Verify the FIX not just the finding" interrogation, and the application of fixes between rounds stay as agent prompts / lead judgment. A workflow deterministically *schedules* "spawn 2 skeptics, collect schema-validated votes"; it does not decide "is this Critical really Critical." The workflow is the skeleton; the personas and judgment are the muscle.

## Resume

Every Workflow run persists its script + a journal. To resume after an edit/kill: `Workflow({scriptPath, resumeFromRunId})` — unchanged `agent()` calls return cached results; the first edited call and everything after re-runs.

## Related

- `SUB_AGENTS.md` — dispatch discipline, model/effort tiering, the find→verify review shape, fan-out residual sweeps.
- `ADR-064` (gate↔workflow interop), `ADR-059` (concurrency caps).
- `.claude/workflows/gauntlet.workflow.js`, `.claude/workflows/assemble-review.workflow.js` — the reference re-platformed commands.
