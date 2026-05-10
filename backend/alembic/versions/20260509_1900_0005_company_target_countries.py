"""companies.target_countries

JSON list of ISO country names/codes the user wants to prospect into.
Used by the research agent to filter prospects geographically.

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-09 19:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.add_column(sa.Column("target_countries", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.drop_column("target_countries")
