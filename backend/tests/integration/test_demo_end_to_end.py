from __future__ import annotations

from app.db.models import (
    AuditLog,
    Campaign,
    Company,
    EmailDraft,
    EmailSend,
    PurchasedDomain,
    TargetCompany,
)
from app.schemas.gtm import CompanyAnalyzeRequest, CompanyConfirmRequest
from app.services.campaign_service import (
    approve_drafts,
    generate_drafts,
    research_targets,
    send_campaign,
)
from app.services.diagnostic_service import analyze_company, confirm_company
from app.services.dns_service import configure_dns, verify_dns
from app.services.domain_service import plan_domains, purchase_domains
from app.services.warmup_service import run_warmup


def test_full_dry_run_flow(session):
    payload = CompanyAnalyzeRequest(
        raw_input=(
            "Acme Robotics — B2B SaaS for predictive maintenance on industrial robots. "
            "Small team. ICP: plant managers in mid-market manufacturing in LATAM. "
            "Target ~50 companies."
        )
    )
    company = analyze_company(session, payload, force_heuristic=True)
    assert company.confirmation_status == "pending_user_confirmation"
    assert company.gtm_strategy
    confirm_company(session, company.id, CompanyConfirmRequest())
    persisted_company = session.get(Company, company.id)
    assert persisted_company is not None
    assert persisted_company.confirmation_status == "confirmed"
    assert persisted_company.gtm_strategy == company.gtm_strategy

    plan = plan_domains(session, company.id)
    assert plan.capped_domains <= 2

    purchased = purchase_domains(session, company.id, execute=False)
    assert purchased.dry_run is True
    assert len(purchased.purchased) == plan.capped_domains
    domain_rows = session.query(PurchasedDomain).filter_by(company_id=company.id).all()
    for d in domain_rows:
        assert d.status == "dry_run_planned"

    for d in domain_rows:
        configure_dns(session, d.id, execute=False)
        verify_dns(session, d.id, execute=False)
    refreshed = session.query(PurchasedDomain).filter_by(company_id=company.id).all()
    for d in refreshed:
        assert d.status == "dns_verified"

    warmup = run_warmup(session, company.id, execute=False)
    assert warmup.promoted_domains
    promoted = session.query(PurchasedDomain).filter_by(company_id=company.id).all()
    assert all(d.status in ("active_for_demo", "paused") for d in promoted)

    research = research_targets(session, company.id, limit=5)
    assert research.targets
    assert session.query(TargetCompany).filter_by(company_id=company.id).count() == len(research.targets)

    drafts = generate_drafts(session, research.campaign_id)
    assert drafts
    n_approved = approve_drafts(session, research.campaign_id, draft_ids=[], approve_all=True)
    assert n_approved == len(drafts)

    send = send_campaign(session, research.campaign_id, execute=False)
    assert send.dry_run is True
    assert all(s.status in ("dry_run", "skipped_suppression", "skipped_domain_unavailable") for s in send.sends)

    # Sanity: AuditLog has at least one entry per dangerous operation kind
    decisions = {row.decision for row in session.query(AuditLog).all()}
    assert "dry_run" in decisions
    assert session.query(EmailDraft).count() == len(drafts)
    assert session.query(EmailSend).count() == len(send.sends)
    assert session.query(Campaign).count() == 1
