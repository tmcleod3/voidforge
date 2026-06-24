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
    { title: 'Verify', detail: '3-lens adversarial REFUTE on every distinct claim' },
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

// ── Step 4.5: 3-lens adversarial REFUTE on every distinct claim ───────────────
// Default-to-refuted. Keep only claims ≥2/3 lenses confirm AND whose fix adds no
// new failure mode. (Verify-the-FIX, field report #348 #4.)
phase('Verify')
const LENSES = ['correctness', 'reachability', 'refutation']
const verified = await parallel(claims.map((c) => () =>
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
const confirmed = verified.filter(Boolean).filter((v) => v.survives).map((v) => ({ ...v.claim, confirmVotes: v.confirmVotes }))
const refuted = verified.filter(Boolean).filter((v) => !v.survives).map((v) => ({ title: v.claim.title, confirmVotes: v.confirmVotes, why: v.lensReasons }))
log(`Verify: ${confirmed.length} survived 3-lens refute, ${refuted.length} refuted (logged, dropped).`)

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
// New crossfire claims (not already confirmed) get the same one-pass refute.
const confirmedKeys = new Set(confirmed.map(key))
const crossNew = []
for (const r of crossfireRaw) for (const f of (r.findings || [])) if (!confirmedKeys.has(key(f))) crossNew.push(f)
const crossVerified = await parallel(crossNew.map((c) => () =>
  agent(
    `Adversarially verify (default-to-refuted) this crossfire claim, reproducing through the real execution path: "${c.title}" [${c.severity}] at ${c.file}. Evidence: ${c.evidence}.`,
    { label: `verify:crossfire:${(c.file || '').slice(0, 24)}`, phase: 'Crossfire', schema: VERDICT },
  ).then((v) => ({ claim: c, verdict: v }))
))
const crossfireConfirmed = []
const crossfireRefuted = []
for (const cv of crossVerified.filter(Boolean)) {
  const v = cv.verdict
  // The VERDICT schema lets a verdict be survives:true AND finalSeverity:'REFUTED'.
  // Such a claim used to be kept as "confirmed" yet matched NO council severity bucket
  // (bySeverity only checks CRITICAL/HIGH/MEDIUM/LOW/WARN) and silently vanished — breaking
  // the "never silently dropped" invariant. Confirm ONLY a real severity; log the rest.
  if (v && v.survives && v.finalSeverity && v.finalSeverity !== 'REFUTED') {
    crossfireConfirmed.push({ ...cv.claim, finalSeverity: v.finalSeverity })
  } else {
    crossfireRefuted.push({ title: cv.claim.title, finalSeverity: (v && v.finalSeverity) || 'UNVERIFIED', why: (v && v.rationale) || 'verifier returned no verdict' })
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
    crossfireConfirmed: crossfireConfirmed.length,
    crossfireRefuted: crossfireRefuted.length,
  },
  critical: bySeverity('CRITICAL'),
  high: bySeverity('HIGH'),
  medium: bySeverity('MEDIUM'),
  low: [...bySeverity('LOW'), ...bySeverity('WARN')],
  refutedLog: refuted, // dropped, but never silently — logged per SUB_AGENTS.md
  crossfireRefutedLog: crossfireRefuted, // ditto for crossfire claims that failed the one-pass verify
}
log(`Council: ${report.critical.length} Critical · ${report.high.length} High · ${report.medium.length} Medium · ${report.low.length} Low/Warn. Lead applies fixes (workflow takes no mid-run input), then re-runs to re-verify.`)
return report
