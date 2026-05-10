from __future__ import annotations

from datetime import UTC

import pytest

from app.db.models import Company, PurchasedDomain
from app.services.warmup_service import NoWarmupPairs, run_warmup


def _company_with_domains(session, n: int, status: str = "dns_verified"):
    company = Company(name="Acme", target_company_count=25, confirmation_status="confirmed")
    session.add(company)
    session.flush()
    for i in range(n):
        session.add(
            PurchasedDomain(
                company_id=company.id,
                domain=f"acme-{i}.com",
                status=status,
                idempotency_key=f"idem-{i}",
                warmup_email=f"warmup@acme-{i}.com",
            )
        )
    session.flush()
    return company


def test_warmup_requires_at_least_two_domains(session):
    company = _company_with_domains(session, 1)
    with pytest.raises(NoWarmupPairs):
        run_warmup(session, company.id, execute=False)


def test_warmup_creates_interactions_and_promotes_domains(session):
    company = _company_with_domains(session, 2)
    res = run_warmup(session, company.id, execute=False)
    assert res.dry_run is True
    assert len(res.interactions) >= 2
    assert sorted(res.promoted_domains) == ["acme-0.com", "acme-1.com"]
    first = res.interactions[0]
    assert first.raw_event_json["to"] == [
        first.to_email,
        "fardenghi@itba.edu.ar",
    ]


def test_warmup_respects_daily_cap(session):
    from datetime import datetime, timedelta

    from app.db.models import WarmupInteraction

    company = _company_with_domains(session, 2)
    pd = (
        session.query(PurchasedDomain)
        .filter_by(company_id=company.id)
        .first()
    )
    now = datetime.now(tz=UTC)
    for _ in range(6):
        session.add(
            WarmupInteraction(
                from_domain_id=pd.id,
                from_email=pd.warmup_email,
                to_email="warmup@other.com",
                subject="hi",
                created_at=now - timedelta(hours=1),
                updated_at=now,
            )
        )
    session.flush()
    res = run_warmup(session, company.id, execute=False)
    # Source should be skipped due to cap (no new interactions from pd)
    new_from_pd = [i for i in res.interactions if i.from_email == pd.warmup_email]
    assert new_from_pd == []
