/**
 * Pattern: LLM State Dedup — IDs are NOT keys
 *
 * Rule: LLM-emitted identifiers are display labels, not primary keys.
 *
 * Why: each LLM invocation is stateless from the model's perspective. Two
 * cycles that propose the same fix will produce DIFFERENT id strings, even
 * for substantively identical commands. The model has no memory of prior
 * ids; it generates a fresh string from current context, drifts every cycle.
 *
 * Field report #330 (threadplex-ops): an hourly run asked Claude to emit
 * `approval_needed[]` entries with an `id` field. The runtime keyed dedup
 * on `id`. Over 5 hours of identical context, Claude emitted ids:
 *
 *   `a3f9c2` (cycle 1)
 *   `a3f7c2` (cycle 2)
 *   `a3f7b2` (cycle 3)
 *   `a3f9c1` (cycle 4)
 *
 * Four proposals to stop the same container. Four Telegram approval cards.
 * Zero collapse. The dedup key was wrong by construction.
 *
 * This pattern applies to ANY VoidForge project using an LLM as a decision
 * engine that emits actionable items (approvals, tickets, tasks, queued ops).
 *
 * Agents: Hari Seldon (AI architecture), Bayta Darell (eval), Stark (backend)
 */

import { createHash } from 'node:crypto'

// --- The rule ---

/**
 * Dedup keys must be derived from the OPERATIVE CONTENT, not from the LLM's
 * id field. The operative content is the part of the proposal that, if
 * executed, would produce the same observable outcome.
 *
 * For shell commands: the canonical command string.
 * For HTTP requests: (method, path, normalized body).
 * For database operations: (table, primary key, op-type).
 * For user notifications: (recipient, channel, message-hash).
 */

export interface ProposalDedupKey {
  /** Content-hash of the operative payload — the actual dedup key. */
  contentHash: string

  /**
   * Optional looser key for command-string drift collapse — `docker stop X`,
   * `docker compose stop X`, `docker rm -f X` all collapse to the same
   * (verb, target) tuple even though contentHash differs.
   */
  logicalKey?: string

  /** The LLM-emitted id, retained as a display label only. NEVER as primary key. */
  displayId?: string
}

// --- Hash the operative content ---

/**
 * For shell commands: hash the canonical command string. Normalize whitespace
 * and quoting before hashing so cosmetically-different but semantically-
 * identical commands collapse.
 */
export function shellCommandHash(command: string): string {
  const canonical = command
    .trim()
    .replace(/\s+/g, ' ')         // Collapse whitespace
    .replace(/(['"])\s+/g, '$1 ') // Normalize quote-adjacent spaces

  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

/**
 * For HTTP request proposals: hash (method, path, sorted-body-keys).
 * Sort body keys so `{a: 1, b: 2}` and `{b: 2, a: 1}` hash identically.
 */
export function httpRequestHash(req: {
  method: string
  path: string
  body?: Record<string, unknown>
}): string {
  const sortedBody = req.body
    ? JSON.stringify(req.body, Object.keys(req.body).sort())
    : ''
  const canonical = `${req.method.toUpperCase()} ${req.path} ${sortedBody}`
  return createHash('sha256').update(canonical).digest('hex').slice(0, 12)
}

// --- Logical-key fallback for command-string drift ---

/**
 * Some commands have multiple syntactic forms that produce the same outcome.
 * Extract (verb, target) tuple so all forms collapse to the same logical key.
 *
 * Examples that all map to ('stop', 'kometa-run'):
 *   docker stop kometa-run
 *   docker compose stop kometa-run
 *   docker rm -f kometa-run     (different verb but same target — flag separately)
 */
export function dockerLogicalKey(command: string): string | null {
  const verbs = ['stop', 'start', 'restart', 'rm', 'kill', 'pause']
  for (const verb of verbs) {
    const re = new RegExp(`\\bdocker\\s+(?:compose\\s+)?${verb}\\b\\s+(?:-\\S+\\s+)*([\\w.-]+)`, 'i')
    const m = command.match(re)
    if (m) return `${verb}:${m[1]}`
  }
  return null
}

// --- Lifecycle states must enumerate every in-flight status ---

/**
 * Even with correct dedup keys, the snapshot used for dedup-comparison must
 * cover ALL operator-visible in-flight states — not just `pending`.
 *
 * Field report #330: the threadplex-ops snapshot filtered only
 * `status == "pending"`, missing `executing` and `interrupted` rows that
 * were also operator-visible. The dedup key was correct but the snapshot
 * was incomplete, producing the same duplication symptom.
 *
 * The lifecycle table below is the reference. Extend per-project.
 */
export const PROPOSAL_LIFECYCLE_STATES = [
  'pending',      // Awaiting operator approval
  'executing',    // Operator approved; runtime executing the action
  'interrupted',  // Execution paused (operator pause, system pause, retry-backoff)
  'completed',    // Execution succeeded
  'failed',       // Execution failed (terminal — operator must re-issue)
  'cancelled',    // Operator cancelled before execution
  'expired',      // Approval window timed out
] as const

export type LifecycleState = typeof PROPOSAL_LIFECYCLE_STATES[number]

/** In-flight states the dedup snapshot must include to prevent duplicate proposals. */
export const IN_FLIGHT_STATES: readonly LifecycleState[] = [
  'pending',
  'executing',
  'interrupted',
]

// --- AUTHORITY-style contract: tell the LLM the key shape ---

/**
 * The LLM cannot enforce a dedup contract it doesn't know about. Document
 * the contract in the agent's authority/instruction document so the LLM
 * understands what "same target" means.
 *
 * Example AUTHORITY.md fragment:
 *
 *   ## Approval Identifier Contract
 *
 *   Each proposal you emit MUST include both:
 *
 *     id          — a human-readable display label. NOT a key. You may
 *                   emit any short label that helps the operator scan.
 *
 *     cmd_hash    — sha256(command)[:12]. The runtime keys dedup on this.
 *                   Two proposals with the same cmd_hash collapse into one
 *                   approval card.
 *
 *   The runtime also computes a logical_key from the command verb + target
 *   name. Proposals with the same logical_key are surfaced as a cluster
 *   even if cmd_hash differs (e.g., `docker stop X` and `docker rm -f X`
 *   both target X with different verbs — operator sees both, decides once).
 */

export const AUTHORITY_FRAGMENT_TEMPLATE = `
## Approval Identifier Contract

Each proposal MUST include:

  id          — display label. Not a key. You may emit any short label.
  cmd_hash    — sha256(command)[:12]. The runtime keys dedup on this.

The runtime also computes a logical_key from (verb, target). Proposals
sharing logical_key are surfaced as a cluster even with different
cmd_hash values.
`.trim()

// --- Putting it together ---

export interface ApprovalProposal {
  id: string                    // Display only — DO NOT USE AS KEY
  cmdHash: string               // Primary dedup key
  logicalKey: string | null     // Secondary cluster key
  command: string
  proposedAt: string            // ISO timestamp
  state: LifecycleState
}

export function dedupProposals(
  newProposal: { id: string; command: string },
  existing: ApprovalProposal[]
): { duplicate: boolean; collapsedInto?: ApprovalProposal; logicalCluster?: ApprovalProposal[] } {
  const cmdHash = shellCommandHash(newProposal.command)
  const logicalKey = dockerLogicalKey(newProposal.command)

  // Snapshot covers ALL in-flight states — not just pending
  const inFlight = existing.filter((p) => IN_FLIGHT_STATES.includes(p.state))

  // Hard duplicate: same cmd_hash
  const exact = inFlight.find((p) => p.cmdHash === cmdHash)
  if (exact) {
    return { duplicate: true, collapsedInto: exact }
  }

  // Soft cluster: same logical_key, different command form
  if (logicalKey) {
    const cluster = inFlight.filter((p) => p.logicalKey === logicalKey)
    if (cluster.length > 0) {
      return { duplicate: false, logicalCluster: cluster }
    }
  }

  return { duplicate: false }
}

// --- Anti-patterns ---

/* ANTI-PATTERN 1: LLM ids as primary keys
 *   `INSERT INTO approvals (id, ...) VALUES (?, ...)` where `id` is the
 *   LLM-emitted string. Two LLM calls with substantively identical input
 *   will produce different ids; the database rows do NOT collapse.
 *
 *   Fix: store `cmd_hash` as the PK and `display_id` as a label column.
 */

/* ANTI-PATTERN 2: Dedup snapshot filtered to a single state
 *   `SELECT * FROM approvals WHERE state = 'pending'` for dedup comparison.
 *   Misses `executing` and `interrupted` rows that are operator-visible.
 *
 *   Fix: use IN_FLIGHT_STATES list. Document which states are excluded
 *   from dedup (typically `completed`, `failed`, `cancelled`, `expired`).
 */

/* ANTI-PATTERN 3: Hash the LLM's whole emitted JSON
 *   `sha256(JSON.stringify(proposal))` includes display_id, timestamps,
 *   reasoning prose — all of which drift per cycle even when the action
 *   is identical. Hash explodes; collapse never happens.
 *
 *   Fix: hash only the operative payload (the command, the request body,
 *   the target identifier — never the LLM's free-text fields).
 */
