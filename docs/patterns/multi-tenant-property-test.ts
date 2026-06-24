/**
 * Pattern: Multi-Tenant Property Test
 *
 * Source: Field report #315 M4 (Caroline first-user-test, 2026-03-31).
 * Caroline found 10 multi-tenant bugs that prior gauntlets missed because
 * regression tests lock known cases — they don't test the underlying
 * property: "for any two orgs A and B, A's writes never appear in B's reads."
 *
 * This pattern provides the property-based test that closes the gap. Use it
 * on every project with org_id (or tenant_id, workspace_id) scoping.
 *
 * The TS version below is illustrative (vitest + fast-check). Python
 * (Hypothesis) and Go variants follow the same shape — generate random
 * org pairs and write payloads, assert no cross-tenant leak.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// ── Test harness contract ────────────────────────────────────────────────
//
// The harness must provide:
//   - createOrg() → { id, apiKey, userId }      (fresh tenant per call)
//   - writeAsOrg(org, endpoint, payload)        (authenticated POST/PUT)
//   - readAsOrg(org, endpoint)                  (authenticated GET, paginated)
//   - listAllReadEndpoints() → string[]         (every GET that returns rows)
//   - listAllWriteEndpoints() → string[]        (every POST/PUT/DELETE)
//   - resetDb()                                  (drop + reseed schema)

declare const harness: {
  createOrg(): Promise<{ id: number; apiKey: string; userId: string }>;
  writeAsOrg(org: { apiKey: string }, endpoint: string, payload: unknown): Promise<{ id: string }>;
  readAsOrg(org: { apiKey: string }, endpoint: string): Promise<Array<{ id: string; org_id?: number }>>;
  listAllReadEndpoints(): string[];
  listAllWriteEndpoints(): string[];
  resetDb(): Promise<void>;

  // ── Handler-entry (HTTP-level) harness — field report #371 ──────────────
  // Drives the REAL request entrypoint with a concrete credential, so the
  // auth→uid wiring is exercised (not just the repository's WHERE org_id).
  // `principal` is whatever the entrypoint actually authenticates with: a
  // bearer token, a session cookie, an API key header — give two DISTINCT ones.
  httpRequest(
    principal: { headers: Record<string, string> },
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: unknown }>;
  // Two distinct, real principals for the SAME logical resource owner vs other.
  principalForOrg(org: { apiKey: string; userId: string }): { headers: Record<string, string> };
};

// ── The Property ─────────────────────────────────────────────────────────

describe('multi-tenant isolation property', () => {
  beforeEach(async () => harness.resetDb());

  test('writes by org A never appear in reads by org B', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Random pair of orgs (always distinct)
        fc.tuple(fc.constant(null), fc.constant(null)),
        // Random write endpoint
        fc.constantFrom(...harness.listAllWriteEndpoints()),
        // Random payload — your codebase's payload generator goes here
        randomPayload(),
        async (_pair, writeEndpoint, payload) => {
          const orgA = await harness.createOrg();
          const orgB = await harness.createOrg();

          // 1. Org A writes
          const written = await harness.writeAsOrg(orgA, writeEndpoint, payload);

          // 2. Every read endpoint, queried as Org B, must NOT contain the write
          for (const readEndpoint of harness.listAllReadEndpoints()) {
            const rowsB = await harness.readAsOrg(orgB, readEndpoint);
            const leaked = rowsB.find((row) => row.id === written.id);
            if (leaked) {
              throw new Error(
                `LEAK: ${writeEndpoint} write by org ${orgA.id} surfaced in ` +
                `${readEndpoint} read by org ${orgB.id}. Row: ${JSON.stringify(leaked)}`,
              );
            }
          }
        },
      ),
      { numRuns: 100, timeout: 60_000 },
    );
  });

  test('superuser/admin pool acquisition does NOT bypass per-org reads', async () => {
    // Companion property: admin-pool callers (cross-tenant by design) must
    // still respect org_id when calling tenant endpoints. Field report #318
    // §5: SUPERUSER + BYPASSRLS=t hides policy bugs. Test under non-owner role.
    const orgA = await harness.createOrg();
    const orgB = await harness.createOrg();

    await harness.writeAsOrg(orgA, '/api/people', { name: 'A1' });
    const rowsB = await harness.readAsOrg(orgB, '/api/people');
    expect(rowsB.find((r) => r.org_id === orgA.id)).toBeUndefined();
  });

  // ── Handler-entry two-principal variant (field report #371) ──────────────
  // The repository-layer property above can pass while a handler that hardcodes
  // `uid = 1` leaks across tenants — the repo test never crosses the auth→uid
  // seam. This variant drives the REAL HTTP entrypoint with TWO DISTINCT
  // credentials and asserts isolation through the request path. It is the test
  // that the planted-bug check below must turn red.
  test('two distinct principals through the real handler do not cross tenants', async () => {
    const orgA = await harness.createOrg();
    const orgB = await harness.createOrg();
    const pA = harness.principalForOrg(orgA);
    const pB = harness.principalForOrg(orgB);

    // A writes through the real entrypoint with A's own credential.
    const created = await harness.httpRequest(pA, 'POST', '/api/people', { name: 'A-secret' });
    expect(created.status).toBeLessThan(300);
    const writtenId = (created.json as { id: string }).id;

    // B reads every list endpoint through the real entrypoint with B's credential.
    for (const readEndpoint of harness.listAllReadEndpoints()) {
      const res = await harness.httpRequest(pB, 'GET', readEndpoint);
      const rows = Array.isArray(res.json) ? (res.json as Array<{ id?: string }>) : [];
      expect(rows.find((r) => r.id === writtenId)).toBeUndefined();
    }

    // Cross-principal direct fetch: B asking for A's row by id must 404, not 403
    // (404 avoids leaking existence — see CLAUDE.md "Return 404, not 403").
    const direct = await harness.httpRequest(pB, 'GET', `/api/people/${writtenId}`);
    expect(direct.status).toBe(404);
  });

  // PLANTED-BUG RED-CHECK (field report #371): hardcoding `uid = <owner>` in the
  // handler MUST turn the two-principal test above RED. If you can introduce
  // that bug and the suite stays green, your isolation test is not crossing the
  // auth→uid seam — it is asserting at the repository layer only. Run this once
  // as a mutation check: patch the handler to ignore the authenticated principal
  // and pin uid to org A's id; the test above must fail. Revert after proving it.
});

function randomPayload(): fc.Arbitrary<unknown> {
  // Generic structure — narrow per-endpoint in real implementations.
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 50 }),
    note: fc.option(fc.string({ maxLength: 200 })),
    tags: fc.array(fc.string(), { maxLength: 5 }),
  });
}

// ── Python (Hypothesis) sketch ───────────────────────────────────────────
//
// from hypothesis import given, strategies as st, settings
//
// @given(write_endpoint=st.sampled_from(WRITE_ENDPOINTS),
//        payload=payload_strategy())
// @settings(max_examples=100, deadline=None)
// def test_no_cross_tenant_leak(write_endpoint, payload):
//     reset_db()
//     org_a, org_b = create_org(), create_org()
//     written = write_as_org(org_a, write_endpoint, payload)
//     for read_endpoint in READ_ENDPOINTS:
//         rows_b = read_as_org(org_b, read_endpoint)
//         assert not any(r['id'] == written['id'] for r in rows_b), \
//             f"LEAK: {write_endpoint} -> {read_endpoint}"
//
// # Handler-entry two-principal variant (field report #371) — drive the real
// # entrypoint (FastAPI TestClient / Django test Client) with two distinct
// # credentials, NOT the repository:
// #   ra = client.post('/api/people', json={'name': 'A'}, headers=princ_a)
// #   rb = client.get(f"/api/people/{ra.json()['id']}", headers=princ_b)
// #   assert rb.status_code == 404      # not 403 — don't leak existence
// # Mutation check: pin uid=<owner> in the handler; this MUST go red.
//
// ── Anti-patterns ────────────────────────────────────────────────────────
//
// 0. Asserting isolation only at the repository layer. A handler that
//    hardcodes uid=1 passes every repo-level test while leaking across
//    tenants. The isolation test MUST drive the real request entrypoint with
//    two distinct principals (field report #371). Prove it with the planted
//    uid red-check.
// 1. Testing isolation only on known endpoints. The bug is in the endpoint
//    you forgot. Property tests enumerate the full surface.
// 2. Using SUPERUSER fixtures. They silently bypass FORCE RLS at the engine
//    level. Use the runtime non-owner role (`{project}_app`, BYPASSRLS=f).
//    See /docs/patterns/rls-test-fixture.py.
// 3. Locking the property to "100% pass" without expanding the endpoint
//    list as the codebase grows. listAll{Read,Write}Endpoints() must be
//    derived dynamically (route enumeration, not hardcoded).
// 4. Testing only "row id leaks." Add field-level checks for any column
//    holding semi-sensitive data (emails, internal notes) — leaks of
//    *content* without row visibility are equally bad.
