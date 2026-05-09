"""Warmup Lite service.

Deterministic in dry-run: pairs every dns_verified domain with the next
one (round robin), sends N initial emails and replies. Marks domains
active_for_demo after a clean cycle.
"""
from __future__ import annotations

import itertools
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.mailgun import MailgunClient, get_mailgun_client
from app.core.safety import Decision, SideEffectLevel, evaluate
from app.core.settings import get_settings
from app.db.models import Company, PurchasedDomain, WarmupInteraction
from app.schemas.warmup import WarmupInteractionOut, WarmupRunResult, WarmupStatusOut
from app.services.dry_run_fixtures import mailgun_send_message as fx_mailgun_send


class NoWarmupPairs(Exception):
    pass


_WARMUP_THREAD_TEMPLATES = [
    ("Quick intro", "Wanted to introduce our team and share a small note. Looking forward to chatting."),
    ("Following up", "Circling back on my previous note — happy to share more on what we're building."),
    ("FYI", "Sharing a small update from our side. Curious to hear your perspective."),
    ("Thanks!", "Thanks for the warm response — appreciate it. Let's keep the dialogue going."),
]


def _domain_warmup_email(domain: PurchasedDomain) -> str:
    return domain.warmup_email or f"warmup@{domain.domain}"


def _pair_domains(domains: list[PurchasedDomain]) -> list[tuple[PurchasedDomain, PurchasedDomain]]:
    if len(domains) < 2:
        return []
    rotated = domains[1:] + domains[:1]
    return list(zip(domains, rotated))


def _today_count(session: Session, domain_id: str) -> int:
    cutoff = datetime.now(tz=UTC) - timedelta(hours=24)
    return (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.from_domain_id == domain_id)
        .filter(WarmupInteraction.created_at >= cutoff)
        .count()
    )


def run_warmup(
    session: Session,
    company_id: str,
    *,
    execute: bool,
    accelerated: bool = True,
    mailgun: MailgunClient | None = None,
) -> WarmupRunResult:
    settings = get_settings()
    company = session.get(Company, company_id)
    if company is None:
        raise ValueError("company not found")

    domains = (
        session.query(PurchasedDomain)
        .filter(PurchasedDomain.company_id == company_id)
        .filter(PurchasedDomain.status.in_(["dns_verified", "active_for_demo", "active"]))
        .all()
    )
    pairs = _pair_domains(domains)
    if not pairs:
        raise NoWarmupPairs("at least two dns_verified domains are required")

    evaluation = evaluate(SideEffectLevel.SEND_EMAIL, execute=execute, settings=settings)
    record_audit(
        session,
        actor="warmup-lite",
        tool_name="run_warmup",
        decision=evaluation.decision.value,
        flag=evaluation.flag,
        side_effect_level=SideEffectLevel.SEND_EMAIL,
        request={"company_id": company_id, "execute": execute, "pairs": [(a.domain, b.domain) for a, b in pairs]},
        response={"reason": evaluation.reason},
    )
    real = evaluation.decision == Decision.ALLOWED
    mailgun = mailgun or (get_mailgun_client() if real else None)

    interactions: list[WarmupInteraction] = []
    paused: list[str] = []
    promoted: list[str] = []

    for src, dst in pairs:
        if _today_count(session, src.id) >= settings.warmup_daily_cap:
            record_audit(
                session,
                actor="warmup-lite",
                tool_name="run_warmup",
                decision="warmup_cap_reached",
                side_effect_level=SideEffectLevel.SEND_EMAIL,
                request={"from": src.domain},
            )
            continue
        for idx, (subject, body) in enumerate(itertools.islice(_WARMUP_THREAD_TEMPLATES, 0, 2)):
            from_email = _domain_warmup_email(src)
            to_email = _domain_warmup_email(dst)
            try:
                if real:
                    resp = mailgun.send_message(  # type: ignore[union-attr]
                        src.domain,
                        from_addr=from_email,
                        to=[to_email],
                        subject=subject,
                        text=body,
                        tags=["warmup"],
                    ).body
                else:
                    resp = fx_mailgun_send(src.domain, recipient=to_email, subject=subject)
                msg_id = resp.get("id")
                interaction = WarmupInteraction(
                    from_domain_id=src.id,
                    to_domain_id=dst.id,
                    from_email=from_email,
                    to_email=to_email,
                    subject=subject,
                    body_text=body,
                    mailgun_message_id=str(msg_id) if msg_id else None,
                    interaction_type="initial" if idx == 0 else "reply",
                    status="sent",
                    opened_simulated=accelerated,
                    clicked_internal_link=accelerated and idx == 0,
                    raw_event_json=resp,
                )
                session.add(interaction)
                interactions.append(interaction)
            except Exception as exc:
                src.status = "paused"
                paused.append(src.domain)
                record_audit(
                    session,
                    actor="warmup-lite",
                    tool_name="run_warmup",
                    decision="warmup_paused_bounce",
                    side_effect_level=SideEffectLevel.SEND_EMAIL,
                    request={"from": src.domain, "to": to_email},
                    response={"error": str(exc)},
                )
                break
        else:
            if src.status == "dns_verified":
                src.status = "active_for_demo"
                promoted.append(src.domain)

    session.flush()
    return WarmupRunResult(
        company_id=company_id,
        dry_run=not real,
        interactions=[WarmupInteractionOut.model_validate(i) for i in interactions],
        paused_domains=paused,
        promoted_domains=promoted,
    )


def domain_status(session: Session, domain_id: str) -> WarmupStatusOut:
    domain = session.get(PurchasedDomain, domain_id)
    if domain is None:
        raise ValueError("domain not found")
    sent = (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.from_domain_id == domain.id)
        .count()
    )
    replies = (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.from_domain_id == domain.id)
        .filter(WarmupInteraction.interaction_type == "reply")
        .count()
    )
    failures = (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.from_domain_id == domain.id)
        .filter(WarmupInteraction.status == "failed")
        .count()
    )
    last = (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.from_domain_id == domain.id)
        .order_by(WarmupInteraction.created_at.desc())
        .first()
    )
    return WarmupStatusOut(
        domain_id=domain.id,
        domain=domain.domain,
        status=domain.status,
        sent_count=sent,
        reply_count=replies,
        failure_count=failures,
        last_event_at=str(last.created_at) if last else None,
    )
