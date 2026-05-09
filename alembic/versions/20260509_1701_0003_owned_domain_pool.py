"""owned_domain_pool: pre-purchased domains the system can pull from.

When the user already owns one or more domains externally and wants the
demo flow to skip the purchase step, the pool is the source of truth.

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-09 17:01:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "owned_domain_pool",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("domain", sa.String(length=255), nullable=False, unique=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="available"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.owned_domain_pool ENABLE ROW LEVEL SECURITY;")


def downgrade() -> None:
    op.drop_table("owned_domain_pool")
