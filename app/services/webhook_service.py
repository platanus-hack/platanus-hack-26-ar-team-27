"""Mailgun webhook ingestion + dispatch."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.mailgun import MailgunClient, get_mailgun_client
from app.core.safety import SideEffectLevel
from app.db.models import Campaign, EmailEvent, EmailSend, Suppression, WebhookEvent

_BOUNCE_LIKE = {"failed", "unsubscribed", "complained"}


def _persist_webhook(session: Session, *, kind: str, valid: bool, payload: dict) -> WebhookEvent:
    we = WebhookEvent(
        provider="mailgun",
        kind=kind,
        valid_signature=valid,
        raw_payload=payload,
        processing_status="received",
    )
    session.add(we)
    session.flush()
    return we


def process_event(
    session: Session,
    payload: dict[str, Any],
    *,
    mailgun: MailgunClient | None = None,
) -> dict[str, Any]:
    mailgun = mailgun or get_mailgun_client()
    sig = payload.get("signature") or {}
    valid = mailgun.validate_webhook_signature(
        timestamp=str(sig.get("timestamp") or ""),
        token=str(sig.get("token") or ""),
        signature=str(sig.get("signature") or ""),
    )
    we = _persist_webhook(session, kind="event", valid=valid, payload=payload)
    if not valid:
        record_audit(
            session,
            actor="webhook",
            tool_name="mailgun_event_webhook",
            decision="webhook_signature_invalid",
            side_effect_level=SideEffectLevel.EXTERNAL_READ,
            request={"event-data": payload.get("event-data", {}).get("event")},
        )
        we.processing_status = "rejected"
        session.flush()
        return {"accepted": False, "reason": "signature_invalid"}

    event_data = payload.get("event-data") or {}
    event_type = str(event_data.get("event") or "unknown")
    message = (event_data.get("message") or {}).get("headers") or {}
    msg_id = message.get("message-id") or event_data.get("id")
    recipient = event_data.get("recipient")
    severity = event_data.get("severity")

    send: EmailSend | None = None
    if msg_id:
        send = (
            session.query(EmailSend)
            .filter(EmailSend.mailgun_message_id == f"<{msg_id}>")
            .one_or_none()
        ) or session.query(EmailSend).filter(EmailSend.mailgun_message_id == msg_id).one_or_none()

    session.add(
        EmailEvent(
            email_send_id=send.id if send else None,
            mailgun_message_id=str(msg_id) if msg_id else None,
            event_type=event_type,
            severity=severity,
            recipient=recipient,
            raw_payload=event_data,
            occurred_at=datetime.now(tz=UTC),
        )
    )

    if send is not None:
        campaign = session.get(Campaign, send.campaign_id)
        if event_type == "delivered":
            campaign.total_delivered += 1
        elif event_type == "opened":
            campaign.total_opened += 1
        elif event_type == "clicked":
            campaign.total_clicked += 1
        elif event_type == "failed":
            campaign.total_failed += 1
        elif event_type == "complained":
            campaign.total_complained += 1
        elif event_type == "unsubscribed":
            campaign.total_unsubscribed += 1

    if event_type in _BOUNCE_LIKE and recipient:
        existing = session.query(Suppression).filter_by(email=recipient.lower()).one_or_none()
        if existing is None:
            session.add(
                Suppression(
                    email=recipient.lower(),
                    reason=event_type,
                    source="mailgun_webhook",
                )
            )
    we.processing_status = "processed"
    session.flush()
    return {"accepted": True, "event_type": event_type}


def process_inbound(session: Session, payload: dict[str, Any]) -> dict[str, Any]:
    we = _persist_webhook(session, kind="inbound", valid=True, payload=payload)
    we.processing_status = "processed"
    session.flush()
    return {"accepted": True}
