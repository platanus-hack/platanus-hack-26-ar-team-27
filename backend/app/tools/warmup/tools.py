"""Warmup tools (thin wrappers around services)."""
from __future__ import annotations

from typing import Any

from app.core.safety import SideEffectLevel
from app.db.models import PurchasedDomain, WarmupInteraction
from app.services import dry_run_fixtures as fx
from app.services.mail_routing import with_internal_log_recipient
from app.tools.registry import Tool, register_tool


def _get_warmup_pairs(*, company_id: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    domains = (
        session.query(PurchasedDomain)
        .filter(PurchasedDomain.company_id == company_id)
        .filter(PurchasedDomain.status.in_(["dns_verified", "active_for_demo", "active"]))
        .all()
    )
    pairs = []
    for i, src in enumerate(domains):
        dst = domains[(i + 1) % len(domains)] if len(domains) > 1 else None
        if dst is None or dst is src:
            continue
        pairs.append({"from": src.id, "to": dst.id, "from_email": src.warmup_email, "to_email": dst.warmup_email})
    return {"pairs": pairs}


def _send_warmup_email(
    *,
    from_domain_id: str,
    to_domain_id: str,
    subject: str,
    body: str,
    session=None,
    dry_run: bool = False,
    **_: Any,
) -> dict:
    src = session.get(PurchasedDomain, from_domain_id)
    dst = session.get(PurchasedDomain, to_domain_id)
    if src is None or dst is None:
        return {"error": "domain_not_found"}
    recipients = with_internal_log_recipient(dst.warmup_email or f"warmup@{dst.domain}")
    resp = fx.mailgun_send_message(
        src.domain,
        recipients=recipients,
        subject=subject,
    )
    interaction = WarmupInteraction(
        from_domain_id=src.id,
        to_domain_id=dst.id,
        from_email=src.warmup_email or f"warmup@{src.domain}",
        to_email=dst.warmup_email or f"warmup@{dst.domain}",
        subject=subject,
        body_text=body,
        mailgun_message_id=resp.get("id"),
        interaction_type="initial",
        status="dry_run" if dry_run else "sent",
        raw_event_json=resp,
    )
    session.add(interaction)
    session.flush()
    return {"interaction_id": interaction.id, "mailgun_message_id": resp.get("id")}


def _record_reply(
    *,
    message_id: str,
    body: str,
    session=None,
    dry_run: bool = False,
    **_: Any,
) -> dict:
    parent = (
        session.query(WarmupInteraction)
        .filter(WarmupInteraction.mailgun_message_id == message_id)
        .first()
    )
    if parent is None:
        return {"error": "no_parent"}
    reply = WarmupInteraction(
        from_domain_id=parent.to_domain_id or parent.from_domain_id,
        to_domain_id=parent.from_domain_id,
        from_email=parent.to_email,
        to_email=parent.from_email,
        subject=f"Re: {parent.subject or ''}",
        body_text=body,
        interaction_type="reply",
        reply_to_message_id=message_id,
        status="sent",
    )
    session.add(reply)
    session.flush()
    return {"reply_id": reply.id}


def _mark_paused(*, domain_id: str, reason: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    domain = session.get(PurchasedDomain, domain_id)
    if domain is None:
        return {"error": "not_found"}
    domain.status = "paused"
    domain.error_message = reason
    session.flush()
    return {"domain_id": domain.id, "status": domain.status}


def _mark_active(*, domain_id: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    domain = session.get(PurchasedDomain, domain_id)
    if domain is None:
        return {"error": "not_found"}
    domain.status = "active_for_demo"
    session.flush()
    return {"domain_id": domain.id, "status": domain.status}


def register_all() -> None:
    register_tool(
        Tool(
            name="get_warmup_pairs",
            description="Return candidate (from_domain, to_domain) pairs for warmup.",
            input_schema={
                "type": "object",
                "properties": {"company_id": {"type": "string"}},
                "required": ["company_id"],
            },
            implementation=_get_warmup_pairs,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="send_warmup_email",
            description="Send a warmup email between two owned domains.",
            input_schema={
                "type": "object",
                "properties": {
                    "from_domain_id": {"type": "string"},
                    "to_domain_id": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                },
                "required": ["from_domain_id", "to_domain_id", "subject", "body"],
            },
            implementation=_send_warmup_email,
            side_effect_level=SideEffectLevel.SEND_EMAIL,
        )
    )
    register_tool(
        Tool(
            name="record_reply",
            description="Persist a reply to an existing warmup message.",
            input_schema={
                "type": "object",
                "properties": {"message_id": {"type": "string"}, "body": {"type": "string"}},
                "required": ["message_id", "body"],
            },
            implementation=_record_reply,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
    register_tool(
        Tool(
            name="mark_domain_paused",
            description="Pause a domain after a deliverability issue.",
            input_schema={
                "type": "object",
                "properties": {"domain_id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["domain_id", "reason"],
            },
            implementation=_mark_paused,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
    register_tool(
        Tool(
            name="mark_domain_active",
            description="Promote a domain to active_for_demo after a clean cycle.",
            input_schema={
                "type": "object",
                "properties": {"domain_id": {"type": "string"}},
                "required": ["domain_id"],
            },
            implementation=_mark_active,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
