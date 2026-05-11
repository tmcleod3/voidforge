"""
Pattern: RLS Test Fixture (db_as_app SAVEPOINT)

Source: Field report #318 §5. Cara Dune (Union Station, M-05) discovered that
Testcontainers' default `us_test` user is `SUPERUSER + BYPASSRLS=t`.
Superusers bypass FORCE RLS at the engine level — the policy doesn't fire.
Any test using the shared `db` fixture for cross-tenant assertions will
silently pass even when the policy is broken.

Without this pattern, RLS tests that pass in development WILL silently fail
in production under the runtime non-owner role.

Use this pattern in every Python/asyncpg + pytest project with FORCE RLS.
The same shape ports to SQLAlchemy + sync sessions, psycopg, and Django ORM.
"""

import pytest
import pytest_asyncio
import asyncpg
from contextlib import asynccontextmanager
from typing import AsyncIterator

# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest_asyncio.fixture
async def db_as_app(db: asyncpg.Connection) -> AsyncIterator[asyncpg.Connection]:
    """
    Wrap the standard `db` fixture so RLS-sensitive tests run under the app
    role (BYPASSRLS=f), not the SUPERUSER bootstrap role. Connection state
    is restored on test teardown.

    Use this fixture for any test that asserts an RLS policy fires. Use the
    standard `db` fixture only for schema setup or admin-only operations.

    Pairs with a `pg_container_app` fixture (below) that provisions an
    app-level role with `LOGIN NOBYPASSRLS NOSUPERUSER` matching the
    runtime DSN identity.
    """
    await db.execute("SAVEPOINT rls_test")
    try:
        await db.execute(f"SET LOCAL ROLE {APP_ROLE_NAME}")
        # If the test sets a tenant ContextVar, wire it through:
        #   await db.execute("SELECT set_config('app.current_org_id', $1, true)", org_id)
        yield db
    finally:
        await db.execute("ROLLBACK TO SAVEPOINT rls_test")


@pytest.fixture(scope="session")
def app_role_name() -> str:
    return APP_ROLE_NAME


# ── Container provisioning (run once per test session) ────────────────────

APP_ROLE_NAME = "unionstation_app"  # Match production DSN identity


async def provision_app_role(admin_conn: asyncpg.Connection) -> None:
    """
    Create the runtime non-owner role inside the test container. Mirrors
    production: NOLOGIN if password-less; LOGIN with a fixed test password
    if the test harness needs to connect as this role directly.

    NOSUPERUSER and NOBYPASSRLS are the load-bearing settings. Without these,
    the role retains FORCE RLS bypass and the fixture buys you nothing.
    """
    await admin_conn.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '{APP_ROLE_NAME}') THEN
                CREATE ROLE {APP_ROLE_NAME}
                    LOGIN
                    NOSUPERUSER
                    NOBYPASSRLS
                    NOCREATEDB
                    NOCREATEROLE
                    PASSWORD 'test_app_password';
                GRANT USAGE ON SCHEMA public TO {APP_ROLE_NAME};
                GRANT SELECT, INSERT, UPDATE, DELETE
                    ON ALL TABLES IN SCHEMA public TO {APP_ROLE_NAME};
                GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO {APP_ROLE_NAME};
            END IF;
        END $$;
    """)


# ── Usage example ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rls_blocks_cross_org_select(db_as_app: asyncpg.Connection) -> None:
    """
    Use db_as_app — NOT db — for any RLS-policy assertion. Under the
    SUPERUSER `db` fixture, this test would pass even if the policy were
    deleted.
    """
    await db_as_app.execute(
        "SELECT set_config('app.current_org_id', '1', true)"
    )
    rows = await db_as_app.fetch("SELECT id, org_id FROM people")
    assert all(row["org_id"] == 1 for row in rows), \
        "RLS allowed cross-org rows under FORCE — policy is broken or role has BYPASSRLS=t"


# ── Asynccontextmanager variant for non-pytest contexts ───────────────────


@asynccontextmanager
async def as_app_role(conn: asyncpg.Connection) -> AsyncIterator[asyncpg.Connection]:
    """
    Imperative variant of the fixture for scripts and one-off RLS exercises.
    """
    await conn.execute("SAVEPOINT as_app_role")
    try:
        await conn.execute(f"SET LOCAL ROLE {APP_ROLE_NAME}")
        yield conn
    finally:
        await conn.execute("ROLLBACK TO SAVEPOINT as_app_role")


# ── Anti-patterns ─────────────────────────────────────────────────────────
#
# 1. Using `db` fixture for RLS assertions. SUPERUSER bypass means
#    every test passes regardless of policy correctness. Production blows up.
#
# 2. Provisioning the app role with BYPASSRLS=t "for convenience." Defeats
#    the entire FORCE RLS deployment.
#
# 3. SET ROLE without SAVEPOINT. Test pollution: subsequent tests run under
#    whichever role the previous test ended in.
#
# 4. Skipping ROLLBACK TO SAVEPOINT in the finally branch. Connection
#    pooling will hand out a connection still scoped to APP_ROLE_NAME.
#
# 5. SET LOCAL ROLE inside an asyncpg pool callback (which runs outside any
#    transaction). Use SET ROLE (session-scoped) plus explicit RESET ROLE
#    on connection release. See field report #319 §1 — same trap surfaced
#    in M-04c W3.
