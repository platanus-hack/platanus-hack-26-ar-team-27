"""Seed pre-owned domains so the demo can skip the purchase step.

Two surfaces:
  * ``seed_domains(...)``: attach an explicit list of domains to a company
    (used by the CLI ``--seed-domain`` flag).
  * ``seed_from_pool(...)``: read the ``owned_domain_pool`` table and grab
    the first ``n`` available domains. The demo command calls this when no
    explicit list is provided so the user only has to populate the pool
    once via ``cli domains pool add`` and re-run.
"""
from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from app.core.settings import get_settings
from app.db.models import Company, OwnedDomainPool, PurchasedDomain


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
        # Mark the corresponding pool entry as in_use (if any).
        pool_entry = session.query(OwnedDomainPool).filter_by(domain=d).one_or_none()
        if pool_entry is not None:
            pool_entry.status = "in_use"
            session.flush()
    return out


def seed_from_pool(session: Session, company_id: str, *, limit: int) -> list[PurchasedDomain]:
    """Pull up to ``limit`` ``available`` domains from the pool and seed them."""
    available = (
        session.query(OwnedDomainPool)
        .filter(OwnedDomainPool.status == "available")
        .order_by(OwnedDomainPool.created_at.asc())
        .limit(limit)
        .all()
    )
    if not available:
        return []
    return seed_domains(session, company_id, [row.domain for row in available])


def add_to_pool(session: Session, domain: str, *, notes: str | None = None) -> OwnedDomainPool:
    domain = domain.strip().lower()
    if not domain:
        raise ValueError("domain cannot be empty")
    existing = session.query(OwnedDomainPool).filter_by(domain=domain).one_or_none()
    if existing is not None:
        if notes is not None:
            existing.notes = notes
        session.flush()
        return existing
    row = OwnedDomainPool(domain=domain, notes=notes, status="available")
    session.add(row)
    session.flush()
    return row


def remove_from_pool(session: Session, domain: str) -> bool:
    row = session.query(OwnedDomainPool).filter_by(domain=domain.strip().lower()).one_or_none()
    if row is None:
        return False
    session.delete(row)
    session.flush()
    return True


def list_pool(session: Session) -> list[OwnedDomainPool]:
    return (
        session.query(OwnedDomainPool)
        .order_by(OwnedDomainPool.status.asc(), OwnedDomainPool.created_at.asc())
        .all()
    )
