"""Research → drafts → approval → send pipeline."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.mailgun import MailgunClient, get_mailgun_client
from app.core.safety import Decision, SideEffectLevel, evaluate
from app.core.settings import get_settings
from app.db.models import (
    Campaign,
    Company,
    Contact,
    EmailDraft,
    EmailEvent,
    EmailSend,
    PurchasedDomain,
    Suppression,
    TargetCompany,
)
from app.schemas.research import (
    CampaignOut,
    CampaignResearchResult,
    CampaignSendResult,
    ContactOut,
    EmailDraftOut,
    EmailSendOut,
    TargetCompanyOut,
)
from app.services.diagnostic_service import get_company_or_404, require_confirmed
from app.services.dry_run_fixtures import mailgun_send_message as fx_mailgun_send
from app.services.research.provider import (
    ResearchProvider,
    SellerContext,
    TargetAccount,
    get_provider,
)


class CampaignNotFound(Exception):
    pass


def _heuristic_score(account: TargetAccount, icp: str | None) -> tuple[float, str]:
    """Fallback scoring used when the provider didn't return one (mock/csv)."""
    score = 0.5
    rationale: list[str] = []
    if icp:
        keywords = [w.lower() for w in icp.split() if len(w) > 3]
        text = f"{account.industry or ''} {account.size_range or ''} {account.location or ''}".lower()
        hits = sum(1 for w in keywords if w in text)
        score += min(0.4, 0.05 * hits)
        if hits:
            rationale.append(f"{hits} ICP keyword hits")
    if account.size_range in ("11-50", "51-200"):
        score += 0.05
        rationale.append("ICP size band")
    if account.industry:
        score += 0.02
    return min(score, 1.0), "; ".join(rationale) or "default heuristic"


def _ensure_campaign(session: Session, company: Company) -> Campaign:
    existing = session.query(Campaign).filter_by(company_id=company.id).order_by(Campaign.created_at.desc()).first()
    if existing:
        return existing
    campaign = Campaign(company_id=company.id, name="default", status="researching")
    session.add(campaign)
    session.flush()
    return campaign


def research_targets(
    session: Session,
    company_id: str,
    *,
    csv_path: str | None = None,
    limit: int = 5,
    provider: ResearchProvider | None = None,
) -> CampaignResearchResult:
    company = get_company_or_404(session, company_id)
    require_confirmed(company)
    if not (company.business_context_summary or "").strip():
        raise ValueError(
            "company.business_context_summary is empty; cannot research prospects"
        )
    settings = get_settings()
    provider = provider or get_provider(csv_path=csv_path)
    seller = SellerContext(
        name=company.name,
        business_context_summary=company.business_context_summary or "",
        icp_description=company.icp_description,
        target_company_count=company.target_company_count or 0,
        internal_company_size_range=company.internal_company_size_range,
    )
    accounts = provider.find_target_companies(seller=seller, limit=limit)
    campaign = _ensure_campaign(session, company)

    target_rows: list[TargetCompany] = []
    contact_rows: list[Contact] = []

    for account in accounts:
        if account.score is not None:
            score = max(0.0, min(1.0, float(account.score)))
            rationale = account.score_rationale or "scored by provider"
        else:
            score, rationale = _heuristic_score(account, company.icp_description)
        selection = "candidate" if score >= settings.min_target_score else "below_threshold"
        target = TargetCompany(
            company_id=company.id,
            name=account.name,
            domain=account.domain,
            industry=account.industry,
            size_range=account.size_range,
            location=account.location,
            score=score,
            score_rationale=rationale,
            selection_status=selection,
            evidence_url=account.evidence_url,
            raw_payload=account.raw,
        )
        session.add(target)
        session.flush()
        target_rows.append(target)
        if selection != "candidate":
            continue
        for contact in provider.find_contacts(account, seller=seller, limit=1):
            row = Contact(
                target_company_id=target.id,
                full_name=contact.full_name,
                title=contact.title,
                email=contact.email,
                linkedin_url=contact.linkedin_url,
                validation_status="unverified" if not contact.email else "format_ok",
                raw_payload=contact.raw,
            )
            session.add(row)
            session.flush()
            contact_rows.append(row)

    campaign.status = "ready_to_draft"
    session.flush()
    return CampaignResearchResult(
        campaign_id=campaign.id,
        targets=[TargetCompanyOut.model_validate(t) for t in target_rows],
        contacts=[ContactOut.model_validate(c) for c in contact_rows],
    )


def _compose_email(
    company: Company, target: TargetCompany, contact: Contact, from_email: str
) -> tuple[str, str]:
    subject = f"Quick idea for {target.name}"
    parts = [
        f"Hi {(contact.full_name or '').split()[0] or 'there'},",
        "",
        f"I'm building {company.name}. ",
        company.business_context_summary or "",
        "",
        f"Reaching out because {target.name} is the kind of {target.industry or 'company'} we'd love to learn from. ",
        "If you're open to a 15-minute chat, I'd love to share what we're working on and hear what's top of mind for your team.",
        "",
        "Either way, no pressure — and you can unsubscribe with the link below at any time.",
        "",
        f"— Sender from {from_email.split('@', 1)[-1]}",
        "",
        "%unsubscribe_url%",
    ]
    return subject, "\n".join(parts)


def generate_drafts(session: Session, campaign_id: str) -> list[EmailDraftOut]:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFound(campaign_id)
    company = session.get(Company, campaign.company_id)
    targets = (
        session.query(TargetCompany)
        .filter(TargetCompany.company_id == campaign.company_id)
        .filter(TargetCompany.selection_status == "candidate")
        .all()
    )
    domains = (
        session.query(PurchasedDomain)
        .filter(PurchasedDomain.company_id == campaign.company_id)
        .filter(PurchasedDomain.status.in_(["active_for_demo", "active", "dry_run_planned"]))
        .all()
    )
    if not domains:
        return []
    drafts: list[EmailDraft] = []
    for i, target in enumerate(targets):
        contact = (
            session.query(Contact)
            .filter(Contact.target_company_id == target.id)
            .first()
        )
        if contact is None or contact.email is None:
            continue
        domain = domains[i % len(domains)]
        from_email = domain.warmup_email or f"hello@{domain.domain}"
        subject, body = _compose_email(company, target, contact, from_email)
        draft = EmailDraft(
            campaign_id=campaign.id,
            contact_id=contact.id,
            target_company_id=target.id,
            from_domain_id=domain.id,
            from_email=from_email,
            subject=subject,
            body_text=body,
            personalization_notes=target.score_rationale,
            status="pending_approval",
        )
        session.add(draft)
        drafts.append(draft)
    campaign.total_drafts = (campaign.total_drafts or 0) + len(drafts)
    campaign.status = "drafts_pending"
    session.flush()
    return [EmailDraftOut.model_validate(d) for d in drafts]


def approve_drafts(session: Session, campaign_id: str, *, draft_ids: list[str], approve_all: bool) -> int:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFound(campaign_id)
    q = session.query(EmailDraft).filter(EmailDraft.campaign_id == campaign_id)
    if not approve_all:
        q = q.filter(EmailDraft.id.in_(draft_ids))
    drafts = q.all()
    now = datetime.now(tz=UTC)
    for d in drafts:
        d.status = "approved"
        d.approved_at = now
    campaign.total_approved = (campaign.total_approved or 0) + len(drafts)
    campaign.status = "approved"
    session.flush()
    return len(drafts)


def _is_suppressed(session: Session, email: str | None) -> bool:
    if not email:
        return True
    return session.query(Suppression).filter_by(email=email.lower()).first() is not None


def send_campaign(
    session: Session,
    campaign_id: str,
    *,
    execute: bool,
    mailgun: MailgunClient | None = None,
) -> CampaignSendResult:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFound(campaign_id)
    settings = get_settings()
    evaluation = evaluate(SideEffectLevel.SEND_EMAIL, execute=execute, settings=settings)
    record_audit(
        session,
        actor="research-and-send",
        tool_name="send_campaign",
        decision=evaluation.decision.value,
        flag=evaluation.flag,
        side_effect_level=SideEffectLevel.SEND_EMAIL,
        request={"campaign_id": campaign_id, "execute": execute},
        response={"reason": evaluation.reason},
    )
    real = evaluation.decision == Decision.ALLOWED
    mailgun = mailgun or (get_mailgun_client() if real else None)

    drafts = (
        session.query(EmailDraft)
        .filter(EmailDraft.campaign_id == campaign.id)
        .filter(EmailDraft.status == "approved")
        .all()
    )
    sends: list[EmailSend] = []
    for draft in drafts:
        contact = session.get(Contact, draft.contact_id)
        domain = session.get(PurchasedDomain, draft.from_domain_id) if draft.from_domain_id else None
        if domain is None or domain.status not in ("active", "active_for_demo", "dry_run_planned"):
            send = EmailSend(
                draft_id=draft.id,
                campaign_id=campaign.id,
                from_domain_id=draft.from_domain_id,
                status="skipped_domain_unavailable",
            )
            session.add(send)
            sends.append(send)
            continue
        if _is_suppressed(session, contact.email if contact else None):
            send = EmailSend(
                draft_id=draft.id,
                campaign_id=campaign.id,
                from_domain_id=domain.id,
                status="skipped_suppression",
            )
            session.add(send)
            sends.append(send)
            continue
        if not real:
            resp = fx_mailgun_send(domain.domain, recipient=contact.email or "n/a", subject=draft.subject)
            send = EmailSend(
                draft_id=draft.id,
                campaign_id=campaign.id,
                from_domain_id=domain.id,
                mailgun_message_id=resp.get("id"),
                status="dry_run",
                raw_response=resp,
                sent_at=datetime.now(tz=UTC),
            )
            session.add(send)
            sends.append(send)
            session.add(
                EmailEvent(
                    email_send_id=send.id,
                    mailgun_message_id=resp.get("id"),
                    event_type="simulated_delivered",
                    recipient=contact.email if contact else None,
                    raw_payload=resp,
                    occurred_at=datetime.now(tz=UTC),
                )
            )
            continue
        try:
            resp = mailgun.send_message(  # type: ignore[union-attr]
                domain.domain,
                from_addr=draft.from_email or f"hello@{domain.domain}",
                to=[contact.email],
                subject=draft.subject,
                text=draft.body_text,
            ).body
            send = EmailSend(
                draft_id=draft.id,
                campaign_id=campaign.id,
                from_domain_id=domain.id,
                mailgun_message_id=resp.get("id"),
                status="sent",
                raw_response=resp,
                sent_at=datetime.now(tz=UTC),
            )
            session.add(send)
            sends.append(send)
        except Exception as exc:
            send = EmailSend(
                draft_id=draft.id,
                campaign_id=campaign.id,
                from_domain_id=domain.id,
                status="failed",
                error_message=str(exc),
            )
            session.add(send)
            sends.append(send)
    campaign.total_sent = (campaign.total_sent or 0) + sum(1 for s in sends if s.status in ("sent", "dry_run"))
    if not real:
        campaign.total_delivered = (campaign.total_delivered or 0) + sum(1 for s in sends if s.status == "dry_run")
    campaign.status = "sent" if real else "dry_run_sent"
    session.flush()
    return CampaignSendResult(
        campaign_id=campaign.id,
        dry_run=not real,
        sends=[EmailSendOut.model_validate(s) for s in sends],
    )


def get_campaign(session: Session, campaign_id: str) -> CampaignOut:
    campaign = session.get(Campaign, campaign_id)
    if campaign is None:
        raise CampaignNotFound(campaign_id)
    return CampaignOut.model_validate(campaign)
