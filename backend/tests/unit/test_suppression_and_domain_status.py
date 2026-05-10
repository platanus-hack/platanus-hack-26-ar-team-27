from __future__ import annotations

from app.db.models import (
    Campaign,
    Company,
    Contact,
    EmailDraft,
    EmailSend,
    PurchasedDomain,
    Suppression,
    TargetCompany,
)
from app.services.campaign_service import send_campaign


def _fixture_company_and_domain(session, status: str = "active_for_demo"):
    company = Company(name="Acme", target_company_count=25, confirmation_status="confirmed")
    session.add(company)
    session.flush()
    pd = PurchasedDomain(
        company_id=company.id,
        domain="acme-outbound.com",
        status=status,
        idempotency_key=f"idem-{status}",
        warmup_email="warmup@acme-outbound.com",
    )
    session.add(pd)
    session.flush()
    campaign = Campaign(company_id=company.id, name="default")
    session.add(campaign)
    session.flush()
    target = TargetCompany(company_id=company.id, name="Target Co", selection_status="candidate")
    session.add(target)
    session.flush()
    contact = Contact(target_company_id=target.id, full_name="Lead", email="lead@target.example", validation_status="format_ok")
    session.add(contact)
    session.flush()
    draft = EmailDraft(
        campaign_id=campaign.id,
        contact_id=contact.id,
        target_company_id=target.id,
        from_domain_id=pd.id,
        from_email="hello@acme-outbound.com",
        subject="Hi",
        body_text="Body %unsubscribe_url%",
        status="approved",
    )
    session.add(draft)
    session.flush()
    return company, pd, campaign


def test_send_skips_suppressed_contact(session):
    _, _, campaign = _fixture_company_and_domain(session)
    session.add(Suppression(email="lead@target.example", reason="unsubscribed"))
    session.flush()
    res = send_campaign(session, campaign.id, execute=False)
    assert res.sends[0].status == "skipped_suppression"


def test_send_skips_paused_domain(session):
    _, pd, campaign = _fixture_company_and_domain(session, status="paused")
    res = send_campaign(session, campaign.id, execute=False)
    assert res.sends[0].status == "skipped_domain_unavailable"


def test_send_dry_run_emits_simulated_delivery(session):
    _, _, campaign = _fixture_company_and_domain(session)
    res = send_campaign(session, campaign.id, execute=False)
    assert res.dry_run is True
    assert res.sends[0].status == "dry_run"
    assert res.sends[0].mailgun_message_id is not None
    persisted = session.get(EmailSend, res.sends[0].id)
    assert persisted is not None
    assert persisted.raw_response["to"] == [
        "lead@target.example",
        "fardenghi@itba.edu.ar",
    ]
