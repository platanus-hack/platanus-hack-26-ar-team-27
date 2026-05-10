"""seed mt2-gtm.xyz into owned_domain_pool

The demo always uses ``mt2-gtm.xyz`` for both mail and blog. Inserting
it into the pool keeps the data layer self-documenting so a fresh DB
already has the demo domain on hand.

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-10 05:00:00
"""
from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

import sqlalchemy as sa

from alembic import op

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEMO_DOMAIN = "mt2-gtm.xyz"


def upgrade() -> None:
    bind = op.get_bind()
    existing = bind.execute(
        sa.text("SELECT 1 FROM owned_domain_pool WHERE domain = :d"),
        {"d": DEMO_DOMAIN},
    ).first()
    if existing:
        return
    now = datetime.now(tz=timezone.utc)
    bind.execute(
        sa.text(
            "INSERT INTO owned_domain_pool "
            "(id, domain, notes, status, created_at, updated_at) "
            "VALUES (:id, :domain, :notes, :status, :ts, :ts)"
        ),
        {
            "id": str(uuid.uuid4()),
            "domain": DEMO_DOMAIN,
            "notes": "demo fixed domain — used for mail + blog",
            "status": "available",
            "ts": now,
        },
    )


def downgrade() -> None:
    op.get_bind().execute(
        sa.text("DELETE FROM owned_domain_pool WHERE domain = :d"),
        {"d": DEMO_DOMAIN},
    )
