"""enable RLS on all tables (Supabase hardening)

Service-role connections (used by our app via DATABASE_URL) bypass RLS, so
the app keeps working without policies. Anon / authenticated roles will
hit a default-deny: nothing exposed via Supabase client SDKs.

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-09 17:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TABLES = (
    "agent_runs",
    "audit_logs",
    "campaigns",
    "campaign_plans",
    "companies",
    "contacts",
    "domain_candidates",
    "domain_dns_records",
    "email_drafts",
    "email_events",
    "email_sends",
    "mailgun_domains",
    "purchased_domains",
    "suppressions",
    "target_companies",
    "tool_calls",
    "warmup_interactions",
    "webhook_events",
)


def _is_postgres() -> bool:
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def upgrade() -> None:
    if not _is_postgres():
        return
    # ENABLE only (not FORCE): the table owner / Supabase service_role keeps
    # bypassing RLS so our backend still reads/writes via DATABASE_URL.
    # anon / authenticated roles get default-deny (no policies created).
    for table in _TABLES:
        op.execute(f"ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    if not _is_postgres():
        return
    for table in _TABLES:
        op.execute(f"ALTER TABLE public.{table} DISABLE ROW LEVEL SECURITY;")
