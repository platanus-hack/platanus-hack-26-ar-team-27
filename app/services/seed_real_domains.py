"""Seed two pre-owned domains for a real-world test (no Porkbun purchase).

Use case: the user already bought the domains on Spaceship (or any other
registrar). We skip the purchase flow and start at DNS configuration.
"""
from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.core.settings import get_settings
from app.db.models import Company, PurchasedDomain


def _idem_key(company_id: str, domain: str) -> str:
    return hashlib.sha256(f"{company_id}:{domain}:seeded".encode()).hexdigest()


def seed_domains(session: Session, company_id: str, domains: list[str]) -> list[PurchasedDomain]:
    """Idempotently associate `domains` with `company_id`.

    If the domain already exists in the DB (possibly under another company from
    a previous run), it is re-assigned to this company and its idempotency key
    is updated so the standard purchase flow recognises it as pre-owned.
    """
    company = session.get(Company, company_id)
    if company is None:
        raise ValueError(f"company {company_id} not found")
    settings = get_settings()
    out: list[PurchasedDomain] = []
    for d in domains:
        d = d.strip().lower()
        existing = session.query(PurchasedDomain).filter_by(domain=d).one_or_none()
        if existing is not None:
            existing.company_id = company.id
            existing.status = (
                existing.status
                if existing.status in ("dns_pending", "dns_verified", "active_for_demo", "active")
                else "purchased"
            )
            existing.provider = "external"
            existing.idempotency_key = _idem_key(company.id, d)
            existing.warmup_email = f"{settings.default_from_local_part}@{d}"
            session.flush()
            out.append(existing)
            continue
        pd = PurchasedDomain(
            company_id=company.id,
            domain=d,
            status="purchased",
            provider="external",
            price_usd=0.0,
            cost_cents=0,
            porkbun_order_id="",
            porkbun_response_json={"source": "seeded_external"},
            idempotency_key=_idem_key(company.id, d),
            warmup_email=f"{settings.default_from_local_part}@{d}",
        )
        session.add(pd)
        session.flush()
        out.append(pd)
    return out
