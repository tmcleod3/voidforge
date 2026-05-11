/**
 * Pattern: Multi-Tenant Pool Bypass (pre-org-resolution scope)
 *
 * Source: Field report #316 §8 (Union Station, M-04c W2). FORCE RLS with a
 * non-owner runtime role means every connection acquired from the tenant
 * pool MUST have `app.current_org_id` set before the first query. But some
 * code paths legitimately need cross-tenant access:
 *
 *   - Auth pre-resolution (looking up which org a session belongs to)
 *   - System daemons (queue cleanup, retention sweeps, leader-elected work)
 *   - Admin endpoints (cross-tenant reports, ops tooling)
 *
 * These can't set org_id (they don't have one), so they need to bypass the
 * tenant pool entirely and acquire from the admin pool. The
 * `pre_org_resolution_scope` ContextVar wrapper makes this explicit and
 * mechanically enforceable.
 *
 * The TS version below is illustrative; the canonical implementation in
 * Union Station is Python (asyncpg). Same shape ports cleanly.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

// ── ContextVar / AsyncLocalStorage ────────────────────────────────────────

type TenantContext = {
  org_id: number | null;       // null when in pre-resolution scope
  pre_resolution: boolean;     // true ⇒ acquire from admin pool, not tenant pool
};

const tenantContext = new AsyncLocalStorage<TenantContext>();

// ── Tenant scope (per-request, normal path) ──────────────────────────────

export async function withTenant<T>(
  org_id: number,
  fn: () => Promise<T>,
): Promise<T> {
  return tenantContext.run({ org_id, pre_resolution: false }, fn);
}

// ── Pre-org-resolution scope (cross-tenant or auth lookup) ───────────────

export async function preOrgResolutionScope<T>(fn: () => Promise<T>): Promise<T> {
  return tenantContext.run({ org_id: null, pre_resolution: true }, fn);
}

// ── Pool acquisition routes by ContextVar ─────────────────────────────────

import type { Pool, PoolClient } from 'pg'; // illustrative — real types vary

declare const tenantPool: Pool;     // BYPASSRLS=f, RLS enforced
declare const adminPool: Pool;      // BYPASSRLS=t, cross-tenant work

export async function acquireConnection(): Promise<PoolClient> {
  const ctx = tenantContext.getStore();

  if (!ctx) {
    throw new Error(
      'acquireConnection called outside any tenant context. ' +
      'Wrap caller with withTenant(orgId, ...) or preOrgResolutionScope(...).',
    );
  }

  if (ctx.pre_resolution) {
    // Cross-tenant work — acquire from the admin pool.
    return adminPool.connect();
  }

  // Normal request — acquire from the tenant pool. The pool callback is
  // expected to SET app.current_org_id so RLS policies can reference it.
  if (ctx.org_id === null) {
    throw new Error(
      'Tenant context missing org_id outside pre_resolution scope. ' +
      'This indicates a callsite that should have called preOrgResolutionScope().',
    );
  }
  return tenantPool.connect();
}

// ── Usage examples ────────────────────────────────────────────────────────

// 1. HTTP middleware (per-request)
//
//    app.use(async (req, res, next) => {
//      await withTenant(req.user.org_id, () => next());
//    });
//
// 2. Daemon (cross-tenant queue cleanup)
//
//    cron.schedule('*/5 * * * *', async () => {
//      await preOrgResolutionScope(async () => {
//        const conn = await acquireConnection(); // → admin pool
//        await conn.query('DELETE FROM job_queue WHERE completed_at < NOW() - INTERVAL \'30 days\'');
//        conn.release();
//      });
//    });
//
// 3. Auth lookup (caller doesn't yet know org_id)
//
//    async function resolveSession(sessionToken: string): Promise<{ org_id: number; user_id: string }> {
//      return preOrgResolutionScope(async () => {
//        const conn = await acquireConnection(); // → admin pool
//        try {
//          const row = await conn.query(
//            'SELECT org_id, user_id FROM sessions WHERE token = $1 AND expires_at > NOW()',
//            [sessionToken],
//          );
//          return row.rows[0];
//        } finally {
//          conn.release();
//        }
//      });
//    }

// ── Anti-patterns ─────────────────────────────────────────────────────────
//
// 1. Acquiring from the tenant pool in a daemon. Without org_id set, the RLS
//    policy denies every query → daemon crashes on first tick. Or worse:
//    the policy uses a fail-open arm and the daemon silently sees zero rows.
//
// 2. Bypassing FORCE RLS by hard-coding the connection string with the
//    runtime role's password. The whole point of the admin pool is the
//    BYPASSRLS=t identity — preserve that boundary.
//
// 3. preOrgResolutionScope wrapping per-request handlers. The middleware
//    already set the tenant context; switching to admin pool there is a
//    privilege escalation. preOrgResolutionScope is for code paths that
//    legitimately don't have an org_id yet (or never will).
//
// 4. Forgetting to wrap lifespan startup. Field report #319 §2: 4 lifespan
//    paths in Union Station's M-05 cutover failed-fast immediately because
//    the RLS-strict role rejected unscoped queries. See BACKEND_ENGINEER.md
//    "Lifespan & Daemon ContextVar Coverage" for the sweep checklist.
