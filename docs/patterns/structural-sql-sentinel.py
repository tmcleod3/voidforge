"""
Pattern: Structural SQL Sentinel (with adversarial-test discipline)

Source: Field report #319 §3. V083 sentinel #2 originally used a single regex
matching `current_setting(...) = ''`. Three Wave 3 reviewers independently
flagged that the regex misses commuted (`'' = current_setting(...)`),
cast (`current_setting(...)::text = ''`), IS NULL canonical
(`current_setting(...) IS NULL`), and coalesce-wrapped variants. Each missed
form is a future fail-open re-introduction the sentinel is supposed to block.

A single-form structural sentinel is a single point of failure. This pattern
documents the discipline: every structural sentinel has positive controls,
adversarial alternation tests, AND fixture-bindability proof.

Use this pattern for any SQL-shape policing — fail-open detection in RLS
policies, dangerous catalog reads, deprecated function calls, plaintext
storage in encrypted columns.
"""

import re
import pytest
from typing import Iterable


# ── The Sentinel ──────────────────────────────────────────────────────────

# Comprehensive regex that matches all known fail-open forms. Each
# alternation is a CVE-class pattern that has bitten production at least once.
FAIL_OPEN_RE = re.compile(
    r"""
    (
        # Direct equality
        current_setting\([^)]*\)\s*=\s*''            |
        # Commuted (Postgres doesn't canonicalize operand order)
        ''\s*=\s*current_setting\([^)]*\)            |
        # Cast on the function call
        current_setting\([^)]*\)\s*::\s*\w+\s*=\s*'' |
        # IS NULL form (treats unset GUC as fail-open)
        current_setting\([^)]*\)\s*IS\s+NULL         |
        # COALESCE wrap
        coalesce\(\s*current_setting\([^)]*\)\s*,\s*''\s*\)\s*=\s*''
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)


def policy_is_fail_open(policy_qual: str) -> bool:
    """Return True if the policy expression contains a known fail-open arm."""
    return bool(FAIL_OPEN_RE.search(policy_qual))


# ── Positive controls (must trigger) ─────────────────────────────────────

POSITIVE_FORMS = [
    # Direct
    "current_setting('app.current_org_id', true) = ''",
    # Whitespace tolerance
    "current_setting('app.current_org_id', true)   =   ''",
    # Commuted
    "'' = current_setting('app.current_org_id', true)",
    # Cast
    "current_setting('app.current_org_id', true)::text = ''",
    # IS NULL
    "current_setting('app.current_org_id', true) IS NULL",
    # COALESCE wrap
    "coalesce(current_setting('app.current_org_id', true), '') = ''",
]


# ── Negative controls (must NOT trigger) ──────────────────────────────────

NEGATIVE_FORMS = [
    # The legitimate org_id check the sentinel is protecting
    "org_id = current_setting('app.current_org_id', true)::int",
    "org_id::text = current_setting('app.current_org_id', true)",
    # Other unrelated comparisons
    "deleted_at IS NULL",
    "tenant_id = (SELECT id FROM tenants WHERE name = 'system')",
]


# ── Adversarial-bindability test ──────────────────────────────────────────


@pytest.mark.parametrize("form", POSITIVE_FORMS)
def test_sentinel_catches_fail_open_form(form: str) -> None:
    """Every known fail-open variant must trip the sentinel."""
    assert policy_is_fail_open(form), \
        f"SENTINEL GAP: form did not trip — '{form}'"


@pytest.mark.parametrize("form", NEGATIVE_FORMS)
def test_sentinel_does_not_false_positive(form: str) -> None:
    """Legitimate policy expressions must not trip the sentinel."""
    assert not policy_is_fail_open(form), \
        f"FALSE POSITIVE: legitimate form tripped — '{form}'"


# ── Fixture-bindability proof ─────────────────────────────────────────────
#
# A structural sentinel is meaningful only if it can FAIL on a deliberate
# regression. Test that, too:


def test_sentinel_can_bind() -> None:
    """
    Construct a deliberate regression and assert the sentinel catches it.
    If this assertion ever flips, either the regex was changed silently
    or the fail-open form is no longer detectable. Either way, an alert
    is mandatory.
    """
    deliberate_regression = "current_setting('x', true) = ''"
    assert policy_is_fail_open(deliberate_regression), \
        "BINDABILITY FAILURE: sentinel cannot fail under any input — it's a no-op"


# ── Anti-patterns ─────────────────────────────────────────────────────────
#
# 1. SUBSTRING match instead of regex (LIKE '%...%'). Misses commuted, cast,
#    and IS NULL forms. Field report #319 §3.
#
# 2. Single regex variant without alternation. The first migration author who
#    writes a different form silently re-introduces the class.
#
# 3. Positive controls only. Without negative controls, false positives
#    flood the alert channel and reviewers learn to ignore them.
#
# 4. No bindability proof. A sentinel that algebraically cannot fail is a
#    no-op. See /docs/patterns/adr-verification-gate.md.
#
# 5. Sentinel lives in one place (CI grep) without a database-side mirror.
#    Belt-and-suspenders: lint the policy text in CI AND assert
#    policy_is_fail_open() against pg_policies.qual at runtime.
