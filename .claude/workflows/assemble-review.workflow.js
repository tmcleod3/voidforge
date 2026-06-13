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
    { title: 'Verify', detail: '3-lens adversarial REFUTE on each claim' },
    { title: 'Crossfire', detail: 'adversaries hunt NEW issues in the diff' },
    { title: 'Council', detail: 'synthesize survivors by severity' },
  ],
}

const input = typeof args === 'string' ? JSON.parse(args) : (args || {})
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
const key = (f) => `${(f.file || '').toLowerCase()}::${(f.title || '').toLowerCase().slice(0, 60)}`

// ── Review: engage + sentinel lenses over the DIFF only ───────────────────────
phase('Review')
const reviews = (await parallel(roster.map((a) => () =>
  agent(
    `You are ${a.name}. Review ONLY ${diff} through the ${a.lens} lens (do not review unchanged code). Evidence-backed findings only — file:line + a quoted CHANGED line or a real repro. For any access/permission/contract finding, name the governing SSOT and reconcile the fix direction (field report #349).`,
    { label: `${a.name} · review:${a.key}`, phase: 'Review', schema: FINDINGS, agentType: a.id },
  )
))).filter(Boolean)

const seen = new Map()
for (const r of reviews) for (const f of (r.findings || [])) { const k = key(f); if (!seen.has(k)) seen.set(k, f) }
const claims = [...seen.values()]
log(`Review: ${reviews.length} lenses → ${claims.length} distinct claims over the diff.`)

// ── Verify: 3-lens adversarial REFUTE (default-to-refuted; verify the FIX too) ─
phase('Verify')
const LENSES = ['correctness', 'reachability', 'refutation']
const verdicts = await parallel(claims.map((c) => () =>
  parallel(LENSES.map((lens) => () =>
    agent(
      `Adversarially verify via the ${lens} lens, reproducing through the REAL execution path (not a library in isolation): "${c.title}" [${c.severity}] at ${c.file}. Evidence: ${c.evidence}. REFUTE unless you cannot. On the refutation lens, also confirm the implied fix adds no new failure mode (wedge/loop/orphan/double-send/TOCTOU).`,
      { label: `verify:${lens}:${(c.file || '').slice(0, 24)}`, phase: 'Verify', schema: VOTE },
    )
  )).then((votes) => { const v = votes.filter(Boolean); return { claim: c, confirmVotes: v.filter((x) => x.confirm).length } })
))
const confirmed = verdicts.filter(Boolean).filter((v) => v.confirmVotes >= 2).map((v) => v.claim)
log(`Verify: ${confirmed.length}/${claims.length} survived the 3-lens refute.`)

// ── Crossfire: adversaries hunt NEW issues the review cleared ─────────────────
phase('Crossfire')
const confirmedKeys = new Set(confirmed.map(key))
const crossRaw = (await parallel([
  { id: 'deathstroke', name: 'Deathstroke', key: 'pentest' },
  { id: 'loki', name: 'Loki', key: 'chaos' },
].map((a) => () =>
  agent(
    `You are ${a.name}, crossfire adversary over ${diff}. The review already ran — find NEW issues it cleared (bypasses, edge/chaos cases). Evidence-backed only.`,
    { label: `${a.name} · crossfire:${a.key}`, phase: 'Crossfire', schema: FINDINGS, agentType: a.id },
  )
))).filter(Boolean)
const crossNew = []
for (const r of crossRaw) for (const f of (r.findings || [])) if (!confirmedKeys.has(key(f))) crossNew.push(f)
const crossConfirmed = (await parallel(crossNew.map((c) => () =>
  agent(`Adversarially verify (default-to-refuted), real execution path: "${c.title}" [${c.severity}] at ${c.file}. ${c.evidence}`,
    { label: `verify:crossfire:${(c.file || '').slice(0, 20)}`, phase: 'Crossfire', schema: VOTE })
    .then((v) => (v && v.confirm ? c : null))
))).filter(Boolean)
log(`Crossfire: ${crossNew.length} new → ${crossConfirmed.length} confirmed.`)

// ── Council: synthesize (JS); the lead applies fixes, then re-runs to re-verify ─
phase('Council')
const all = [...confirmed, ...crossConfirmed]
const sev = (s) => all.filter((f) => f.severity === s)
return {
  diff,
  counts: { claims: claims.length, confirmed: confirmed.length, crossfireConfirmed: crossConfirmed.length },
  critical: sev('CRITICAL'), high: sev('HIGH'), medium: sev('MEDIUM'), low: [...sev('LOW'), ...sev('WARN')],
}
