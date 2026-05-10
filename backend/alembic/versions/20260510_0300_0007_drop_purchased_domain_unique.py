"""drop global unique on purchased_domains.domain

Replace with a composite (company_id, domain) unique. The original global
unique blocked dry-run scenarios where two demo companies happen to
suggest the same domain name. In real mode, uniqueness is enforced by the
registrar anyway; the composite is enough to prevent a company from
double-buying the same name.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-10 03:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Postgres auto-names the column-level unique as `<table>_<col>_key`.
    op.drop_constraint(
        "purchased_domains_domain_key",
        "purchased_domains",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_purchased_domains_company_domain",
        "purchased_domains",
        ["company_id", "domain"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_purchased_domains_company_domain",
        "purchased_domains",
        type_="unique",
    )
    op.create_unique_constraint(
        "purchased_domains_domain_key",
        "purchased_domains",
        ["domain"],
    )
