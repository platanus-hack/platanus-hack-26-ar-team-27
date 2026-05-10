from __future__ import annotations

import hashlib
import hmac

from app.clients.mailgun import MailgunClient
from app.core.settings import Settings
from app.db.models import EmailEvent, Suppression, WebhookEvent
from app.services.webhook_service import process_event, process_inbound


def _signed_payload(secret: str, event_type: str = "delivered") -> dict:
    timestamp = "1700000000"
    token = "abcdef"
    sig = hmac.new(secret.encode(), f"{timestamp}{token}".encode(), hashlib.sha256).hexdigest()
    return {
        "signature": {"timestamp": timestamp, "token": token, "signature": sig},
        "event-data": {
            "event": event_type,
            "recipient": "lead@target.example",
            "id": "msg-1",
            "message": {"headers": {"message-id": "msg-1"}},
        },
    }


def test_valid_signature_processes_event(session, monkeypatch):
    settings = Settings(mailgun_webhook_signing_key="secret-x")
    client = MailgunClient(settings=settings)
    payload = _signed_payload("secret-x", "delivered")
    result = process_event(session, payload, mailgun=client)
    assert result["accepted"] is True
    assert session.query(WebhookEvent).count() == 1
    assert session.query(EmailEvent).count() == 1


def test_invalid_signature_is_rejected(session):
    settings = Settings(mailgun_webhook_signing_key="secret-x")
    client = MailgunClient(settings=settings)
    payload = _signed_payload("wrong-secret", "delivered")
    result = process_event(session, payload, mailgun=client)
    assert result["accepted"] is False
    assert session.query(WebhookEvent).filter_by(processing_status="rejected").count() == 1


def test_unsubscribed_creates_suppression(session):
    settings = Settings(mailgun_webhook_signing_key="secret-x")
    client = MailgunClient(settings=settings)
    payload = _signed_payload("secret-x", "unsubscribed")
    process_event(session, payload, mailgun=client)
    assert session.query(Suppression).filter_by(email="lead@target.example").count() == 1


def test_valid_inbound_signature_processes_webhook(session):
    settings = Settings(mailgun_webhook_signing_key="secret-x")
    client = MailgunClient(settings=settings)
    timestamp = "1700000000"
    token = "abcdef"
    sig = hmac.new(
        b"secret-x",
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()
    result = process_inbound(
        session,
        {
            "timestamp": timestamp,
            "token": token,
            "signature": sig,
            "recipient": "reply@example.com",
        },
        mailgun=client,
    )
    assert result["accepted"] is True
    assert session.query(WebhookEvent).filter_by(kind="inbound", valid_signature=True).count() == 1


def test_invalid_inbound_signature_is_rejected(session):
    settings = Settings(mailgun_webhook_signing_key="secret-x")
    client = MailgunClient(settings=settings)
    result = process_inbound(
        session,
        {"timestamp": "1700000000", "token": "abcdef", "signature": "bad"},
        mailgun=client,
    )
    assert result["accepted"] is False
    assert session.query(WebhookEvent).filter_by(kind="inbound", processing_status="rejected").count() == 1
