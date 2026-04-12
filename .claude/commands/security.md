# /security — Kenobi's Security Audit

**AGENT DEPLOYMENT IS MANDATORY.** Phase 1 specifies parallel agent launches via the Agent tool. You MUST launch Leia, Chewie, Rex+Bo-Katan, and Maul as separate sub-processes. Phase 2 agents (Yoda, Windu, Ahsoka, Padmé, Qui-Gon) run sequentially but each MUST be a separate agent invocation. Do NOT shortcut to inline analysis. (Field report #68)

## Dynamic Dispatch (ADR-044)

Opus scans `git diff --stat` and matches changed files against the `description` fields of all 263 agents in `.claude/agents/`. Matching specialists launch alongside the core agents below.

**Dispatch control:** `--light` skips dynamic dispatch (core only). `--solo` runs lead agent only.

## Herald Pre-Scan (ADR-047)

Before agent deployment, run the Herald to select the optimal roster:

1. Call `gatherHeraldContext('/security', '$ARGUMENTS', '<focus-if-provided>')` to collect codebase context
2. Call `loadAgentRegistry()` to get all 263 agent definitions
3. Call `runHerald(context, registry)` to get the optimal roster
4. Merge Herald's roster with this command's hardcoded lead agents (Herald adds, never removes leads)
5. Deploy the merged roster per the command's normal parallel/sequential protocol

**`--focus "topic"`** biases the Herald toward agents matching the topic. Examples: `--focus "security"`, `--focus "financial accuracy"`, `--focus "mobile UX"`.

**`--light`** skips the Herald entirely — uses only the command's hardcoded core roster.
**`--solo`** skips both Herald and all sub-agents — lead agent only.

## Context Setup
1. Read `/logs/build-state.md` — understand current project state
2. Read `/docs/methods/SECURITY_AUDITOR.md`
3. Read `/docs/LESSONS.md` — check for security-relevant lessons (prior vulnerabilities, auth gotchas). Flag matches during audit.

## Audit Sequence

### Phase 0.5 — First Strike
Before the deep audits, two agents do fast recon:
- **Han** `subagent_type: han-vuln-hunter` — Quick OWASP top 10 scan: finds the obvious vulnerabilities that shouldn't require deep analysis. Shoots first.
- **Cassian** `subagent_type: cassian-recon` — Threat modeling and attack surface mapping: all endpoints, high-value targets, threat model that guides the rest of the audit.

### Phase 1 — Independent audits (parallel analysis)
Use the Agent tool to run these simultaneously — all are read-only analysis:
- **Agent 1** `subagent_type: leia-secrets` — Secrets: scan for hardcoded secrets, verify .env gitignored, check git history for leaked keys, verify different secrets dev/prod.
- **Agent 2** `subagent_type: chewie-dependency-audit` — Dependencies: `npm audit`, critical/high vulns, lock file committed, deprecated packages.
- **Agent 3** `subagent_type: rex-infrastructure` + `bo-katan-perimeter` — Infrastructure + perimeter: security headers (HSTS, CSP, X-Frame-Options, CORS), TLS config, exposed ports/debug endpoints, firewall rules, CORS enforcement.
- **Agent 4** `subagent_type: maul-red-team` — Red team: exploit each endpoint/flow, chain vulnerabilities, test trust boundaries, attempt privilege escalation. **RUNTIME EXPLOITATION (mandatory):** Execute actual attack requests via curl/fetch -- not just theorize.

### Phase 2 — Sequential audits (depend on understanding the codebase)
These require full codebase context — run sequentially:

- **Yoda** `subagent_type: yoda-auth` — Auth: password hashing (bcrypt >= 12 rounds), session management (httpOnly/secure/sameSite), OAuth (state param, redirect whitelist), reset tokens (single-use, expiring, rate limited). Reference `/docs/patterns/middleware.ts`.
- **Windu** `subagent_type: windu-input-validation` — Input: SQL injection (parameterized queries), XSS (escaped output, CSP), SSRF (URL allowlist), command injection, path traversal.
- **Ahsoka** `subagent_type: ahsoka-access-control` — Access control: IDOR checks, UUIDs not sequential IDs, server-side admin/tier verification, rate limiting. **AUTH CHAIN TRACING (mandatory):** Trace the full chain from middleware registration through service to DB query. Reference `/docs/patterns/multi-tenant.ts`.
- **Padme** `subagent_type: padme-data-protection` — Data protection: PII catalog, PII not in logs/errors/URLs, GDPR deletion, encrypted backups.
- **Qui-Gon** `subagent_type: qui-gon-subtle-vulns` — Subtle vulnerabilities: timing attacks, race conditions in auth flows, logic errors that pass standard checks.
- **Sabine** `subagent_type: sabine-unconventional` — (conditional) Unconventional: supply chain attacks, dependency confusion, prototype pollution, CSP bypass via CDN.
- **Bail Organa** `subagent_type: bail-organa-governance` — (conditional) Governance: GDPR data handling, SOC2 controls, HIPAA mapping.

### Phase 3 — Remediate
Write all findings to `/logs/phase-11-security-audit.md` (or appropriate phase log):

| ID | Finding | Severity | Confidence | Category | Location | Remediation | Status |
|----|---------|----------|------------|----------|----------|-------------|--------|

Severity = exploitability x impact. Critical (auth bypass, data leak) > High (injection, IDOR) > Medium (missing headers, weak config) > Low (best practice)

**Confidence scoring is mandatory.** Every finding includes a confidence score (0-100). If confidence is below 60, escalate to a second agent from a different universe (e.g., if Maul found it, escalate to Deathstroke or Constantine) to verify before including. If the second agent disagrees, drop the finding. High-confidence findings (90+) skip re-verification in Phase 4.

Fix critical and high findings immediately. Medium findings get tracked. For each fix:
1. Apply the fix
2. Verify it works
3. Check it didn't break anything (`npm test`)
4. Update the finding status in the log

### Phase 4 — Re-Verification
After remediations are applied:
- **Maul** `subagent_type: maul-red-team` re-probes all remediated vulnerabilities — verify fixes hold under adversarial conditions. Execute actual HTTP requests against the running server.
- **Anakin** `subagent_type: anakin-dark-side` attempts to bypass remediations using dark-side techniques — JWT algorithm confusion, auth library edge cases, prototype pollution, framework misuse.
- **Din Djarin** `subagent_type: din-djarin-bounty` bounty-hunts for anything Maul and Anakin missed — post-remediation sweep.

If any agent finds new issues, fix and re-verify until clean.

### Phase 5 — Deliverables
1. SECURITY_AUDIT.md — prioritized findings with evidence
2. SECURITY_CHECKLIST.md — reusable pre-deploy verification list
3. Remediation code fixes
4. INCIDENT_RESPONSE.md — if none exists, create template

## Arguments
- `--focus "topic"` → Bias Herald toward topic (natural-language, additive)

## Handoffs
- Backend refactoring needed → Stark, log to `/logs/handoffs.md`
- UI changes needed → Galadriel, log to `/logs/handoffs.md`
- Infrastructure changes → Kusanagi, log to `/logs/handoffs.md`
- Verify fixes didn't break → Batman, log to `/logs/handoffs.md`
