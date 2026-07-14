// assemble-review.workflow.js — the REVIEW-heavy phases of /assemble, re-platformed.
//
// /assemble's build/architecture/devops phases STAY prose orchestration (they write
// code, are sequentially dependent, and need lead judgment + --interactive gates
// between them). Only the read-heavy fan-out phases move here (ADR-067): the 3x code
// review (engage), 2x security (sentinel), crossfire, and council — run over a single
// mission's working diff. Run this as ONE workflow per review pass so an --interactive
// pause sits at the workflow boundary, not mid-run (workflows take no mid-run input).
//
// GATE (ADR-064): muster the Surfer + record-roster BEFORE invoking (see assemble.md).
// Invoke: Workflow({ scriptPath: '.claude/workflows/assemble-review.workflow.js',
//                    args: { diff, roster: [{id,name,key,lens}] } })

export const meta = {
  name: 'assemble-review',
  description: 'Per-mission review fan-out: engage (code) + sentinel (security) → 3-lens verify → crossfire → council, over the working diff',
  phases: [
    { title: 'Review', detail: 'engage + sentinel lenses over the diff' },
    { title: 'Verify', detail: 'severity-triaged adversarial REFUTE (C/H 3-lens, Medium batched, Low advisory) under an agent budget' },
    { title: 'Crossfire', detail: 'adversaries hunt NEW issues in the diff' },
    { title: 'Council', detail: 'synthesize survivors by severity' },
  ],
}

// Guarded parse: a malformed/empty `args` string must not crash the run before phase 1.
let input = {}
try {
  input = typeof args === 'string' ? (args.trim() ? JSON.parse(args) : {}) : (args || {})
} catch (_e) {
  input = {}
}
const diff = input.diff || 'the working-tree diff for this mission (git diff)'
const roster = Array.isArray(input.roster) && input.roster.length
  ? input.roster
  : [
      { id: 'picard-architecture', name: 'Picard', key: 'arch', lens: 'architecture & pattern compliance' },
      { id: 'stark-backend', name: 'Stark', key: 'backend', lens: 'API/DB/service correctness' },
      { id: 'galadriel-frontend', name: 'Galadriel', key: 'ux', lens: 'UX/a11y of changed surfaces' },
      { id: 'kenobi-security', name: 'Kenobi', key: 'sec', lens: 'auth/injection/secrets/data' },
      { id: 'maul', name: 'Maul', key: 'redteam', lens: 'red-team the new attack surface' },
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
          file: { type: 'string' },
          evidence: { type: 'string', description: '≥1 quoted changed line or concrete repro' },
        },
      },
    },
  },
}
const VOTE = { type: 'object', additionalProperties: false, required: ['confirm', 'reason'], properties: { confirm: { type: 'boolean' }, reason: { type: 'string' } } }
// One skeptic verifies a BATCH of Medium claims per call (field report #405 budget guard).
const BATCH_VOTE = {
  type: 'object', additionalProperties: false, required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['index', 'confirm', 'reason'],
        properties: { index: { type: 'integer' }, confirm: { type: 'boolean' }, reason: { type: 'string' } },
      },
    },
  },
}
const key = (f) => `${(f.file || '').toLowerCase()}::${(f.title || '').toLowerCase().slice(0, 60)}`

// ── Review: engage + sentinel lenses over the DIFF only ───────────────────────
phase('Review')
const reviews = (await parallel(roster.map((a) => () =>
  agent(
    `You are ${a.name}. Review ONLY ${diff} through the ${a.lens} lens (do not review unchanged code). Evidence-backed findings only — file:line + a quoted CHANGED line or a real repro. For any access/permission/contract finding, name the governing SSOT and reconcile the fix direction (field report #349).`,
    { label: `${a.name} · review:${a.key}`, phase: 'Review', schema: FINDINGS, agentType: a.name },
  )
))).filter(Boolean)

const SEV_RANK = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, WARN: 1 }
const seen = new Map()
for (const r of reviews) for (const f of (r.findings || [])) {
  const k = key(f)
  if (!seen.has(k)) seen.set(k, { ...f, raisedBy: [r.agent] })
  else {
    const ex = seen.get(k)
    ex.raisedBy.push(r.agent)
    // Keep the highest severity any lens assigned + track who raised it (consensus
    // visibility) — first-write-wins dropped both before.
    if ((SEV_RANK[f.severity] || 0) > (SEV_RANK[ex.severity] || 0)) ex.severity = f.severity
  }
}
const claims = [...seen.values()]
// Fail-SAFE: a claim whose severity isn't a known SEV_RANK key would fall to `lowWarn`
// (rank 0 < MEDIUM) → advisory → ZERO verify agents, silently skipping verification.
// Normalize any unknown severity to 'HIGH' (conservative — verify it, don't skip it),
// preserving the original as `_rawSeverity` for forensics.
const KNOWN_SEV = new Set(Object.keys(SEV_RANK))
for (const c of claims) if (!KNOWN_SEV.has(c.severity)) { c._rawSeverity = c.severity; c.severity = 'HIGH' }
log(`Review: ${reviews.length} lenses → ${claims.length} distinct claims over the diff.`)

// ── Verify: severity-triaged adversarial REFUTE (field report #405) ───────────
// Diff-scoped, so `claims` is normally small — but the same nested `claims × 3`
// fan-out that broke /gauntlet on a full-codebase audit lives here, so it carries
// the same budget guard: Critical/High → 3-lens; Medium → batched; Low/Warn → advisory.
phase('Verify')
const LENSES = ['correctness', 'reachability', 'refutation']
const BATCH_SIZE = 5
const VERIFY_AGENT_BUDGET = 400
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
const rank = (f) => SEV_RANK[f.severity] || 0
let critHigh = claims.filter((f) => rank(f) >= SEV_RANK.HIGH)
const medium = claims.filter((f) => rank(f) === SEV_RANK.MEDIUM)
const lowWarn = claims.filter((f) => rank(f) < SEV_RANK.MEDIUM)
const mediumBatches = chunk(medium, BATCH_SIZE)
const deferred = []
const maxCritHigh = Math.max(0, Math.floor((VERIFY_AGENT_BUDGET - mediumBatches.length) / LENSES.length))
if (critHigh.length > maxCritHigh) {
  for (const c of critHigh.slice(maxCritHigh)) deferred.push({ title: c.title, file: c.file, severity: c.severity })
  log(`Verify BUDGET: ${critHigh.length} Critical/High over the ${maxCritHigh}-claim budget → ${deferred.length} deferred (logged).`)
  critHigh = critHigh.slice(0, maxCritHigh)
}
const chVerdicts = await parallel(critHigh.map((c) => () =>
  parallel(LENSES.map((lens) => () =>
    agent(
      `Adversarially verify via the ${lens} lens, reproducing through the REAL execution path (not a library in isolation): "${c.title}" [${c.severity}] at ${c.file}. Evidence: ${c.evidence}. REFUTE unless you cannot. On the refutation lens, also confirm the implied fix adds no new failure mode (wedge/loop/orphan/double-send/TOCTOU).`,
      { label: `verify:${lens}:${(c.file || '').slice(0, 24)}`, phase: 'Verify', schema: VOTE },
    )
  )).then((votes) => { const v = votes.filter(Boolean); return { claim: c, confirmVotes: v.filter((x) => x.confirm).length } })
))
const medVerdicts = await parallel(mediumBatches.map((batch, bi) => () =>
  agent(
    `Adversarially verify these ${batch.length} MEDIUM claims (default-to-refuted), reproducing each through the REAL execution path. Confirm a claim ONLY if you cannot refute it, citing exact code. Return one verdict per claim by its 0-based index.\n\n${batch.map((c, i) => `[${i}] "${c.title}" at ${c.file} — ${c.evidence}`).join('\n')}`,
    { label: `verify:medium-batch:${bi}`, phase: 'Verify', schema: BATCH_VOTE },
  ).then((res) => ({ batch, verdicts: (res && res.verdicts) || [] }))
))
const confirmed = []
const refuted = []
for (const v of chVerdicts.filter(Boolean)) {
  if (v.confirmVotes >= 2) confirmed.push(v.claim)
  else refuted.push({ title: v.claim.title, file: v.claim.file, confirmVotes: v.confirmVotes })
}
for (const mv of medVerdicts.filter(Boolean)) {
  for (let i = 0; i < mv.batch.length; i++) {
    const vd = mv.verdicts.find((x) => x.index === i)
    if (vd && vd.confirm) confirmed.push(mv.batch[i])
    else refuted.push({ title: mv.batch[i].title, file: mv.batch[i].file, confirmVotes: 0 })
  }
}
const advisory = lowWarn.map((f) => ({ ...f, advisory: true }))
log(`Verify: ${confirmed.length} survived (C/H 3-lens + Medium batch), ${refuted.length} refuted, ${advisory.length} Low/Warn advisory, ${deferred.length} deferred.`)

// ── Crossfire: adversaries hunt NEW issues the review cleared ─────────────────
phase('Crossfire')
const confirmedKeys = new Set(confirmed.map(key))
const crossRaw = (await parallel([
  { id: 'deathstroke', name: 'Deathstroke', key: 'pentest' },
  { id: 'loki', name: 'Loki', key: 'chaos' },
].map((a) => () =>
  agent(
    `You are ${a.name}, crossfire adversary over ${diff}. The review already ran — find NEW issues it cleared (bypasses, edge/chaos cases). Evidence-backed only.`,
    { label: `${a.name} · crossfire:${a.key}`, phase: 'Crossfire', schema: FINDINGS, agentType: a.name },
  )
))).filter(Boolean)
const crossNew = []
for (const r of crossRaw) for (const f of (r.findings || [])) if (!confirmedKeys.has(key(f))) crossNew.push(f)
// Mirror gauntlet.workflow.js: split crossfire verify by severity so an extreme haul
// can't re-introduce a flat unbounded fan-out. Critical/High get a single VOTE agent
// each; the rest are batched via BATCH_VOTE + chunk(). Refuted claims are logged
// (never silently dropped — SUB_AGENTS.md invariant).
const crossCritHigh = crossNew.filter((f) => rank(f) >= SEV_RANK.HIGH)
const crossRest = crossNew.filter((f) => rank(f) < SEV_RANK.HIGH)
const crossCritHighVerdicts = await parallel(crossCritHigh.map((c) => () =>
  agent(`Adversarially verify (default-to-refuted), real execution path: "${c.title}" [${c.severity}] at ${c.file}. ${c.evidence}`,
    { label: `verify:crossfire:${(c.file || '').slice(0, 20)}`, phase: 'Crossfire', schema: VOTE })
    .then((v) => ({ claim: c, vote: v }))
))
const crossRestVerdicts = await parallel(chunk(crossRest, BATCH_SIZE).map((batch, bi) => () =>
  agent(
    `Adversarially verify these ${batch.length} lower-severity crossfire claims (default-to-refuted), reproducing each through the REAL execution path. Confirm a claim ONLY if you cannot refute it, citing exact code. Return one verdict per claim by its 0-based index.\n\n${batch.map((c, i) => `[${i}] "${c.title}" [${c.severity}] at ${c.file} — ${c.evidence}`).join('\n')}`,
    { label: `verify:crossfire-batch:${bi}`, phase: 'Crossfire', schema: BATCH_VOTE },
  ).then((res) => ({ batch, verdicts: (res && res.verdicts) || [] }))
))
const crossConfirmed = []
const crossfireRefutedLog = []
for (const cv of crossCritHighVerdicts.filter(Boolean)) {
  if (cv.vote && cv.vote.confirm) crossConfirmed.push(cv.claim)
  else crossfireRefutedLog.push({ title: cv.claim.title, file: cv.claim.file, why: (cv.vote && cv.vote.reason) || 'no verdict returned — treated as refuted' })
}
for (const cb of crossRestVerdicts.filter(Boolean)) {
  for (let i = 0; i < cb.batch.length; i++) {
    const vd = cb.verdicts.find((x) => x.index === i)
    if (vd && vd.confirm) crossConfirmed.push(cb.batch[i])
    else crossfireRefutedLog.push({ title: cb.batch[i].title, file: cb.batch[i].file, why: (vd && vd.reason) || 'no verdict returned — treated as refuted' })
  }
}
log(`Crossfire: ${crossNew.length} new → ${crossConfirmed.length} confirmed, ${crossfireRefutedLog.length} refuted (logged).`)

// ── Council: synthesize (JS); the lead applies fixes, then re-runs to re-verify ─
phase('Council')
const all = [...confirmed, ...crossConfirmed]
const sev = (s) => all.filter((f) => f.severity === s)
return {
  diff,
  counts: { claims: claims.length, confirmed: confirmed.length, refuted: refuted.length, advisory: advisory.length, deferred: deferred.length, crossfireConfirmed: crossConfirmed.length },
  critical: sev('CRITICAL'), high: sev('HIGH'), medium: sev('MEDIUM'), low: [...sev('LOW'), ...sev('WARN')],
  advisory,               // Low/Warn surfaced without spending verify agents (#405)
  deferredLog: deferred,  // Critical/High over the verify budget — re-run scoped (#405)
  refutedLog: refuted, // dropped from the actionable buckets, but never silently — logged per SUB_AGENTS.md
  crossfireRefutedLog, // crossfire claims that failed the one-pass verify — never silently dropped
}
