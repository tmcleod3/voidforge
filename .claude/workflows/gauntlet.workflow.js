// gauntlet.workflow.js — Thanos's Comprehensive Review as a Dynamic Workflow.
//
// Re-platforms /gauntlet's hand-fanned 60-80 agent rounds onto the Workflow tool
// (ADR-067) so intermediate findings live in script variables, not the lead's
// context. The lead's context only sees the final synthesis.
//
// GATE (ADR-064): the Workflow launch is gated. /gauntlet must muster the Silver
// Surfer + record-roster BEFORE invoking this script (see gauntlet.md). The roster
// is passed in via `args`; this script does NOT re-select it.
//
// What stays PROSE / lead judgment (NOT in this script): severity re-rating debate,
// the Agent Debate Protocol, and the application of fixes. This script SCHEDULES the
// find → dedupe → 3-lens-verify → crossfire → council skeleton and returns confirmed
// findings; the lead applies fixes between runs (workflows take no mid-run input).
//
// Invoke: Workflow({ scriptPath: '.claude/workflows/gauntlet.workflow.js',
//                     args: { scope, roster: [{id,name,key,domain}], rounds } })

export const meta = {
  name: 'gauntlet',
  description: 'Comprehensive review: discovery → strike → 3-lens adversarial verify → crossfire → council (schema-validated)',
  phases: [
    { title: 'Discovery', detail: 'core domain leads map the surface' },
    { title: 'Strike', detail: 'Surfer-selected specialists fan out' },
    { title: 'Verify', detail: 'severity-triaged adversarial verify (C/H 3-lens, Medium batched, Low advisory) under a hard agent budget' },
    { title: 'Crossfire', detail: 'adversaries hunt NEW issues' },
    { title: 'Council', detail: 'synthesize survivors by severity' },
  ],
}

// Guarded parse: a malformed or empty `args` string must NOT throw and abort the
// entire run before phase 1 (field report) — fall back to defaults instead.
let input = {}
try {
  input = typeof args === 'string' ? (args.trim() ? JSON.parse(args) : {}) : (args || {})
} catch (_e) {
  input = {}
}
const scope = input.scope || 'the working tree / full codebase per gauntlet.md'
// Surfer-selected specialists (gate-recorded upstream). Fall back to the canonical
// core leads if no roster was passed (e.g. --light).
const roster = Array.isArray(input.roster) && input.roster.length
  ? input.roster
  : [
      { id: 'picard-architecture', name: 'Picard', key: 'architecture', domain: 'architecture' },
      { id: 'stark-backend', name: 'Stark', key: 'backend', domain: 'code/backend' },
      { id: 'galadriel-frontend', name: 'Galadriel', key: 'ux', domain: 'UX/a11y' },
      { id: 'kenobi-security', name: 'Kenobi', key: 'security', domain: 'security' },
      { id: 'kusanagi-devops', name: 'Kusanagi', key: 'devops', domain: 'infra/deploy' },
    ]

const FINDINGS = {
  type: 'object', additionalProperties: false,
  required: ['agent', 'findings'],
  properties: {
    agent: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'severity', 'file', 'evidence'],
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'WARN'] },
          file: { type: 'string', description: 'path:line, or "n/a"' },
          evidence: { type: 'string', description: '≥1 quoted code line or a concrete repro; no vibes' },
        },
      },
    },
  },
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  required: ['survives', 'confirmVotes', 'finalSeverity', 'rationale'],
  properties: {
    survives: { type: 'boolean', description: 'true only if ≥2 of the 3 lenses confirm AND the fix would not introduce a new failure mode' },
    confirmVotes: { type: 'integer', description: '0-3' },
    finalSeverity: { type: 'string', enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'WARN', 'REFUTED'] },
    rationale: { type: 'string' },
  },
}

// One skeptic verifies a BATCH of lower-severity claims in a single call, returning a
// verdict per claim index (field report #405 — Medium/Low verify is batched, not one
// agent per claim, so a large-roster whole-codebase audit stays under the ~1000 cap).
const BATCH_VERDICT = {
  type: 'object', additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['index', 'confirm', 'reason'],
        properties: {
          index: { type: 'integer', description: 'the 0-based claim index from the prompt list' },
          confirm: { type: 'boolean', description: 'true only if the claim cannot be refuted through the real execution path' },
          reason: { type: 'string' },
        },
      },
    },
  },
}

// Normalize the file path before keying so the SAME finding reported by two agents —
// one with an absolute `/Users/.../repo/src/x.ts:42`, one with a relative `src/x.ts:42` —
// dedupes instead of surviving as two "distinct" claims (#366 F6). Strip the repo-root
// prefix (the launch cwd, passed via args; fall back to env) and any leading `./`.
// Workflows forbid argless `new Date()`/`Math.random()` but env reads are fine.
const REPO_ROOT = (input.repoRoot || (typeof process !== 'undefined' && process.cwd && process.cwd()) || '')
  .replace(/\/+$/, '')
const normPath = (p) => {
  let s = (p || '').trim()
  if (REPO_ROOT && s.startsWith(REPO_ROOT + '/')) s = s.slice(REPO_ROOT.length + 1)
  return s.replace(/^\.\/+/, '').toLowerCase()
}
const key = (f) => `${normPath(f.file)}::${(f.title || '').toLowerCase().slice(0, 60)}`

// ── Round 1: Discovery + Round 2/3: Strike ────────────────────────────────────
const dom = (a) => a.domain || a.key || 'their domain'  // avoid literal "undefined" in prompts
phase('Discovery')
const discovery = (await parallel(roster.slice(0, 5).map((a) => () =>
  agent(
    `You are ${a.name} (${dom(a)}). GAUNTLET discovery pass over ${scope}. Map your domain and report concrete, evidence-backed findings only — every finding needs a file:line and a quoted line or a real repro (no speculation). Rate severity honestly.`,
    { label: `${a.name} · discovery:${a.key}`, phase: 'Discovery', schema: FINDINGS, agentType: a.name },
  )
))).filter(Boolean)

phase('Strike')
// Specialists only (index ≥5). When the roster is ≤5 (the default/--light core-leads
// set) there are NO specialists, so strike is EMPTY — falling back to the full roster
// here re-ran the identical discovery agents with a "find what discovery missed" prompt,
// doubling cost for no new coverage (field report). parallel([]) is a harmless no-op.
const strikeRoster = roster.length > 5 ? roster.slice(5) : []
if (!strikeRoster.length) log('Strike: no specialists beyond the 5 core leads — skipping (no double-pass).')
const strike = (await parallel(strikeRoster.map((a) => () =>
  agent(
    `You are ${a.name} (${dom(a)}). GAUNTLET strike pass over ${scope}. Deep, adversarial domain review — find what discovery missed. Evidence-backed findings only (file:line + quoted line/repro).`,
    { label: `${a.name} · strike:${a.key}`, phase: 'Strike', schema: FINDINGS, agentType: a.name },
  )
))).filter(Boolean)

// ── Dedupe across all domains (plain JS — no agent) ───────────────────────────
const SEV_RANK = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, WARN: 1 }
const seen = new Map()
for (const r of [...discovery, ...strike]) {
  for (const f of (r.findings || [])) {
    const k = key(f)
    if (!seen.has(k)) seen.set(k, { ...f, raisedBy: [r.agent] })
    else {
      const ex = seen.get(k)
      ex.raisedBy.push(r.agent)
      // Keep the HIGHEST severity any agent assigned. First-write-wins silently
      // discarded a later agent's escalation (e.g. one rates MEDIUM, another HIGH).
      if ((SEV_RANK[f.severity] || 0) > (SEV_RANK[ex.severity] || 0)) ex.severity = f.severity
    }
  }
}
const claims = [...seen.values()]
log(`Discovery+Strike: ${discovery.length + strike.length} agents → ${claims.length} distinct claims (deduped).`)

// ── Step 4.5: severity-triaged adversarial verify (field report #405) ──────────
// GAUNTLET.md Step 4.5 scopes adversarial verify to Critical/High. The first port
// ran 3 lenses on EVERY severity — dropping the severity bound that was ALSO the
// scaling bound: `claims × 3` breaches the Workflow ~1000-agent runaway cap on a
// whole-codebase audit (516 claims → ~1,548 agents → run aborted mid-Verify).
// Triage restores the bound, and a hard budget guard caps the fan-out:
//   Critical/High → full 3-lens REFUTE (unchanged, default-to-refuted, ≥2/3 confirms).
//   Medium        → batched skeptic, BATCH_SIZE claims per agent (one call, verdicts[]).
//   Low/Warn      → advisory, ZERO verify agents — surfaced to council, labelled.
// Deferred Critical/High (over budget) are LOGGED by title+file, never silently
// dropped (SUB_AGENTS.md invariant); the operator re-runs /gauntlet scoped to them.
phase('Verify')
const LENSES = ['correctness', 'reachability', 'refutation']
const BATCH_SIZE = 5
// Headroom under the ~1000 hard cap: discovery+strike are already spent, and
// crossfire + council still run after Verify. 400 leaves room for both.
const VERIFY_AGENT_BUDGET = 400
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
const rank = (f) => SEV_RANK[f.severity] || 0

let critHigh = claims.filter((f) => rank(f) >= SEV_RANK.HIGH)   // CRITICAL, HIGH
const medium = claims.filter((f) => rank(f) === SEV_RANK.MEDIUM) // MEDIUM
const lowWarn = claims.filter((f) => rank(f) < SEV_RANK.MEDIUM)  // LOW, WARN, unknown → complement (no drops)

// Budget guard: keep projected verify agents (C/H × 3 lenses + Medium batches) under
// VERIFY_AGENT_BUDGET. Over budget → cap Critical/High, log the remainder as deferred.
const mediumBatches = chunk(medium, BATCH_SIZE)
const deferred = []
const maxCritHigh = Math.max(0, Math.floor((VERIFY_AGENT_BUDGET - mediumBatches.length) / LENSES.length))
if (critHigh.length > maxCritHigh) {
  for (const c of critHigh.slice(maxCritHigh)) deferred.push({ title: c.title, file: c.file, severity: c.severity })
  log(`Verify BUDGET: ${critHigh.length} Critical/High exceed the ${maxCritHigh}-claim 3-lens budget → ${deferred.length} deferred (logged; re-run /gauntlet scoped to their files).`)
  critHigh = critHigh.slice(0, maxCritHigh)
}
log(`Verify triage: ${critHigh.length} Crit/High×3 + ${mediumBatches.length} Medium batch(es) + ${lowWarn.length} Low/Warn advisory = ${critHigh.length * LENSES.length + mediumBatches.length} verify agents (flat 3-lens would have been ${claims.length * LENSES.length}).`)

// Critical/High: full 3-lens REFUTE (default-to-refuted; ≥2/3 confirm survives).
const chVerified = await parallel(critHigh.map((c) => () =>
  parallel(LENSES.map((lens) => () =>
    agent(
      `Adversarially verify this GAUNTLET claim through the ${lens} lens. Claim: "${c.title}" [${c.severity}] at ${c.file}. Evidence: ${c.evidence}. Your job is to REFUTE it — confirm ONLY if you cannot, citing the exact code. For the refutation lens, also check the implied FIX introduces no new failure mode (wedge/loop/orphan/double-send/TOCTOU). Reproduce through the REAL execution path, not a library in isolation (ADR/field report #356).`,
      { label: `verify:${lens}:${(c.file || '').slice(0, 24)}`, phase: 'Verify', schema: { type: 'object', additionalProperties: false, required: ['confirm', 'reason'], properties: { confirm: { type: 'boolean' }, reason: { type: 'string' } } } },
    )
  )).then((votes) => {
    const v = votes.filter(Boolean)
    const confirmVotes = v.filter((x) => x.confirm).length
    return { claim: c, survives: confirmVotes >= 2, confirmVotes, lensReasons: v.map((x) => x.reason) }
  })
))

// Medium: one skeptic refutes a batch, returning a verdict per claim index.
const medVerified = await parallel(mediumBatches.map((batch, bi) => () =>
  agent(
    `Adversarially verify these ${batch.length} MEDIUM GAUNTLET claims (default-to-refuted), reproducing each through the REAL execution path. For EACH claim, confirm ONLY if you cannot refute it, citing exact code. Return one verdict per claim by its 0-based index.\n\n${batch.map((c, i) => `[${i}] "${c.title}" at ${c.file} — ${c.evidence}`).join('\n')}`,
    { label: `verify:medium-batch:${bi}`, phase: 'Verify', schema: BATCH_VERDICT },
  ).then((res) => ({ batch, verdicts: (res && res.verdicts) || [] }))
))

const confirmed = []
const refuted = []
for (const v of chVerified.filter(Boolean)) {
  if (v.survives) confirmed.push({ ...v.claim, confirmVotes: v.confirmVotes })
  else refuted.push({ title: v.claim.title, confirmVotes: v.confirmVotes, why: v.lensReasons })
}
for (const mv of medVerified.filter(Boolean)) {
  for (let i = 0; i < mv.batch.length; i++) {
    const vd = mv.verdicts.find((x) => x.index === i)
    if (vd && vd.confirm) confirmed.push({ ...mv.batch[i], confirmVotes: 1, verifiedBy: 'medium-batch' })
    else refuted.push({ title: mv.batch[i].title, confirmVotes: 0, why: [vd ? vd.reason : 'no verdict returned — treated as refuted'] })
  }
}
// Low/Warn: advisory — surfaced to council labelled, spent ZERO verify agents.
const advisory = lowWarn.map((f) => ({ ...f, advisory: true }))
log(`Verify: ${confirmed.length} survived (C/H 3-lens + Medium batch), ${refuted.length} refuted (logged), ${advisory.length} Low/Warn advisory, ${deferred.length} deferred.`)

// ── Round 4: Crossfire — adversaries hunt NEW issues the review cleared ────────
phase('Crossfire')
const ADVERSARIES = [
  { id: 'maul', name: 'Maul', key: 'red-team' },
  { id: 'deathstroke', name: 'Deathstroke', key: 'pentest' },
  { id: 'loki', name: 'Loki', key: 'chaos' },
]
const crossfireRaw = (await parallel(ADVERSARIES.map((a) => () =>
  agent(
    `You are ${a.name}, a GAUNTLET crossfire adversary over ${scope}. The domain review already ran — hunt NEW issues it cleared (bypasses, chaos/edge cases, exploit chains). Evidence-backed only (file:line + repro).`,
    { label: `${a.name} · crossfire:${a.key}`, phase: 'Crossfire', schema: FINDINGS, agentType: a.name },
  )
))).filter(Boolean)
// New crossfire claims (not already confirmed) get a refute pass. FIX-3 (#405):
// triage crossfire verify like the main verify — Critical/High get a single-agent
// VERDICT each; Medium/Low/Warn are batched. Bounded either way, but the split keeps
// an extreme crossfire haul from re-introducing the flat-fan-out breach.
const confirmedKeys = new Set(confirmed.map(key))
const crossNew = []
for (const r of crossfireRaw) for (const f of (r.findings || [])) if (!confirmedKeys.has(key(f))) crossNew.push(f)
const crossCritHigh = crossNew.filter((f) => rank(f) >= SEV_RANK.HIGH)
const crossRest = crossNew.filter((f) => rank(f) < SEV_RANK.HIGH)
const crossCritHighVerified = await parallel(crossCritHigh.map((c) => () =>
  agent(
    `Adversarially verify (default-to-refuted) this crossfire claim, reproducing through the real execution path: "${c.title}" [${c.severity}] at ${c.file}. Evidence: ${c.evidence}.`,
    { label: `verify:crossfire:${(c.file || '').slice(0, 24)}`, phase: 'Crossfire', schema: VERDICT },
  ).then((v) => ({ claim: c, verdict: v }))
))
const crossRestVerified = await parallel(chunk(crossRest, BATCH_SIZE).map((batch, bi) => () =>
  agent(
    `Adversarially verify these ${batch.length} lower-severity crossfire claims (default-to-refuted), reproducing each through the REAL execution path. Return one verdict per claim by its 0-based index.\n\n${batch.map((c, i) => `[${i}] "${c.title}" [${c.severity}] at ${c.file} — ${c.evidence}`).join('\n')}`,
    { label: `verify:crossfire-batch:${bi}`, phase: 'Crossfire', schema: BATCH_VERDICT },
  ).then((res) => ({ batch, verdicts: (res && res.verdicts) || [] }))
))
const crossfireConfirmed = []
const crossfireRefuted = []
for (const cv of crossCritHighVerified.filter(Boolean)) {
  const v = cv.verdict
  // The VERDICT schema lets a verdict be survives:true AND finalSeverity:'REFUTED'.
  // Such a claim would match NO council severity bucket and silently vanish — breaking
  // the "never silently dropped" invariant. Confirm ONLY a real severity; log the rest.
  if (v && v.survives && v.finalSeverity && v.finalSeverity !== 'REFUTED') {
    crossfireConfirmed.push({ ...cv.claim, finalSeverity: v.finalSeverity })
  } else {
    crossfireRefuted.push({ title: cv.claim.title, finalSeverity: (v && v.finalSeverity) || 'UNVERIFIED', why: (v && v.rationale) || 'verifier returned no verdict' })
  }
}
for (const cb of crossRestVerified.filter(Boolean)) {
  for (let i = 0; i < cb.batch.length; i++) {
    const vd = cb.verdicts.find((x) => x.index === i)
    if (vd && vd.confirm) crossfireConfirmed.push({ ...cb.batch[i], finalSeverity: cb.batch[i].severity })
    else crossfireRefuted.push({ title: cb.batch[i].title, finalSeverity: 'REFUTED', why: (vd && vd.reason) || 'no verdict returned — treated as refuted' })
  }
}
log(`Crossfire: ${crossNew.length} new claims → ${crossfireConfirmed.length} confirmed, ${crossfireRefuted.length} refuted/unverified (logged, dropped).`)

// ── Round 5: Council — synthesize survivors by severity (JS; lead applies fixes) ─
phase('Council')
const all = [...confirmed, ...crossfireConfirmed]
const bySeverity = (sev) => all.filter((f) => (f.finalSeverity || f.severity) === sev)
const report = {
  scope,
  rosterSize: roster.length,
  counts: {
    distinctClaims: claims.length,
    confirmed: confirmed.length,
    refuted: refuted.length,
    advisory: advisory.length,
    deferred: deferred.length,
    crossfireConfirmed: crossfireConfirmed.length,
    crossfireRefuted: crossfireRefuted.length,
  },
  critical: bySeverity('CRITICAL'),
  high: bySeverity('HIGH'),
  medium: bySeverity('MEDIUM'),
  low: [...bySeverity('LOW'), ...bySeverity('WARN')],
  advisory,               // Low/Warn surfaced without spending verify agents (#405)
  deferredLog: deferred,  // Critical/High over the verify budget — re-run scoped (#405)
  refutedLog: refuted, // dropped, but never silently — logged per SUB_AGENTS.md
  crossfireRefutedLog: crossfireRefuted, // ditto for crossfire claims that failed the one-pass verify
}
log(`Council: ${report.critical.length} Critical · ${report.high.length} High · ${report.medium.length} Medium · ${report.low.length} Low/Warn confirmed; ${advisory.length} advisory, ${deferred.length} deferred. Lead applies fixes (workflow takes no mid-run input), then re-runs to re-verify.`)
return report
