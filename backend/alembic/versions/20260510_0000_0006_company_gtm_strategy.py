"""companies.gtm_strategy

Short read-only GTM/outbound strategy text generated during the diagnostic
step and exposed publicly in CompanyOut.

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-10 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.add_column(sa.Column("gtm_strategy", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("companies") as batch:
        batch.drop_column("gtm_strategy")
