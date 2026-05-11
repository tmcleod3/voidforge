/**
 * Pattern: Audit Log (system-event NULL trap + integrity)
 *
 * Source: Field report #319 §6. `audit_log.org_id INTEGER NOT NULL DEFAULT 1`
 * rejects explicit NULL inserts. Spec called for `org_id=NULL` for system
 * events; code wrote `None`; PG raised IntegrityError; an `except Exception:
 * pass` swallowed it; the audit row was silently lost on every system event.
 *
 * The audit table cannot be a system of record AND a tenant-scoped table at
 * the same time. This pattern documents the two valid resolutions and the
 * integrity properties any audit pipeline must hold.
 *
 * Pairs with /docs/patterns/financial-transaction.ts (hash-chained append)
 * for higher-stakes audit trails.
 */

// ── The Two Valid Patterns ────────────────────────────────────────────────

// Pattern 1: Schema relaxation — make org_id nullable, write NULL for system
// events. Most explicit. Visible in `\d audit_log`. Migration cost.
//
//     ALTER TABLE audit_log ALTER COLUMN org_id DROP NOT NULL;
//     -- Operators query: WHERE org_id IS NULL
//
// Pattern 2: Sentinel + tag — write the placeholder DEFAULT (e.g., 1) plus a
// `decisions.system_event = true` JSONB flag. Cheaper, reversible. Operators
// query: WHERE (decisions->>'system_event')::boolean = true.

// ── TypeScript implementation (Pattern 2 — sentinel + tag) ───────────────

export type AuditEntry = {
  org_id: number;            // Schema DEFAULT for system events; real org id otherwise
  user_id: string | null;    // null for system events
  action: string;
  resource_type: string;
  resource_id: string | null;
  decisions: AuditDecisions;
  occurred_at: Date;
};

export type AuditDecisions = {
  system_event?: true;       // Tag for system-scope writes (Pattern 2)
  reason?: string;
  actor_role?: string;
  // Free-form context — keep keys stable so operator queries don't drift
  [key: string]: unknown;
};

const SYSTEM_ORG_ID_PLACEHOLDER = 1; // Must match the schema DEFAULT

export async function writeAudit(
  db: { execute: (sql: string, params: unknown[]) => Promise<void> },
  entry: Omit<AuditEntry, 'occurred_at'>,
): Promise<void> {
  // Mark system events explicitly. Pattern 2 invariant: every system_event=true
  // row uses SYSTEM_ORG_ID_PLACEHOLDER as org_id.
  if (entry.decisions.system_event && entry.org_id !== SYSTEM_ORG_ID_PLACEHOLDER) {
    throw new Error(
      `audit-log invariant: system_event=true requires org_id=${SYSTEM_ORG_ID_PLACEHOLDER}, got ${entry.org_id}`,
    );
  }

  await db.execute(
    `INSERT INTO audit_log (org_id, user_id, action, resource_type, resource_id, decisions, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [
      entry.org_id,
      entry.user_id,
      entry.action,
      entry.resource_type,
      entry.resource_id,
      JSON.stringify(entry.decisions),
    ],
  );
}

// Convenience wrappers — make system vs tenant calls obvious at the call site.

export const writeSystemAudit = (
  db: Parameters<typeof writeAudit>[0],
  entry: Omit<AuditEntry, 'org_id' | 'occurred_at' | 'user_id' | 'decisions'> & {
    decisions: Omit<AuditDecisions, 'system_event'>;
  },
) =>
  writeAudit(db, {
    ...entry,
    org_id: SYSTEM_ORG_ID_PLACEHOLDER,
    user_id: null,
    decisions: { ...entry.decisions, system_event: true },
  });

export const writeTenantAudit = (
  db: Parameters<typeof writeAudit>[0],
  entry: Omit<AuditEntry, 'occurred_at'> & { org_id: number; user_id: string },
) => writeAudit(db, entry);

// ── Integrity properties (assert in tests) ────────────────────────────────
//
// 1. NEVER `try { ... } catch { /* ignore */ }` around audit writes.
//    Audit-write failures are themselves the most important class of audit
//    event. If the audit pipeline can fail silently, you have no audit.
//
// 2. Audit writes inside the same transaction as the action they describe.
//    A separate transaction risks the action committing while the audit
//    rolls back (or vice versa).
//
// 3. Append-only at the application layer (no UPDATE/DELETE on audit_log).
//    Enforce via revoked grants on the runtime role:
//      REVOKE UPDATE, DELETE ON audit_log FROM <runtime_role>;
//
// 4. Tests assert: writeSystemAudit + writeTenantAudit produce
//    distinguishable rows. Operator query against `decisions->>'system_event'`
//    must surface system events without false positives from real org=1.

// ── Anti-patterns ─────────────────────────────────────────────────────────
//
// - `org_id INTEGER NOT NULL DEFAULT N` + `INSERT ... VALUES (NULL, ...)`
//   → IntegrityError. Pick Pattern 1 (drop NOT NULL) or Pattern 2 (write N
//     + tag). Don't try to do both halfway.
//
// - System events written with a real user's `org_id` "for convenience."
//   The audit trail conflates platform actions with tenant actions; legal
//   discovery cannot separate them.
//
// - JSONB tag without a stable key. `decisions.systemEvent` vs
//   `decisions.system_event` vs `decisions.is_system` — operator queries
//   break across versions. Lock the key in this file and keep it.
//
// - Wave 3 convergence (field report #319): Riker, Kenobi, Hawkgirl, Loki
//   each independently flagged the NULL trap. When 3+ reviewers agree on
//   the same finding, it is real, not stylistic — promote to a pattern,
//   not a one-off fix.
