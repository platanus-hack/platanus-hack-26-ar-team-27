from __future__ import annotations

import hashlib
import hmac

import httpx
import pytest
import respx

from app.clients.mailgun import MailgunClient
from app.core.settings import Settings


@pytest.fixture()
def settings() -> Settings:
    return Settings(
        mailgun_api_key="mg-test",
        mailgun_base_url="https://api.mailgun.net",
        mailgun_region="US",
        mailgun_webhook_signing_key="signing-key-xyz",
    )


@pytest.fixture()
def client(settings):
    return MailgunClient(settings=settings, http=httpx.Client(timeout=5.0))


@respx.mock
def test_create_domain(client):
    respx.post("https://api.mailgun.net/v3/domains").mock(
        return_value=httpx.Response(
            200,
            json={
                "domain": {"name": "outbound.example.com", "state": "unverified"},
                "sending_dns_records": [{"record_type": "TXT", "name": "@", "value": "v=spf1 ..."}],
                "receiving_dns_records": [],
            },
        )
    )
    res = client.create_domain("outbound.example.com")
    assert res.body["domain"]["name"] == "outbound.example.com"
    assert res.body["sending_dns_records"][0]["record_type"] == "TXT"


@respx.mock
def test_verify_domain(client):
    respx.put("https://api.mailgun.net/v3/domains/outbound.example.com/verify").mock(
        return_value=httpx.Response(200, json={"domain": {"state": "active"}})
    )
    res = client.verify_domain("outbound.example.com")
    assert res.body["domain"]["state"] == "active"


@respx.mock
def test_send_message(client):
    route = respx.post("https://api.mailgun.net/v3/outbound.example.com/messages").mock(
        return_value=httpx.Response(200, json={"id": "<msg@outbound.example.com>", "message": "Queued. Thank you."})
    )
    res = client.send_message(
        "outbound.example.com",
        from_addr="Founder <hi@outbound.example.com>",
        to=["lead@target.com", "fardenghi@itba.edu.ar"],
        subject="Hello",
        text="Body",
        tags=["warmup"],
    )
    assert res.body["id"].startswith("<msg")
    body = route.calls[0].request.content.decode("utf-8")
    assert "lead%40target.com" in body
    assert "fardenghi%40itba.edu.ar" in body


@respx.mock
def test_get_unsubscribes(client):
    respx.get("https://api.mailgun.net/v3/outbound.example.com/unsubscribes").mock(
        return_value=httpx.Response(200, json={"items": [{"address": "x@y.com"}]})
    )
    res = client.get_suppressions("outbound.example.com", kind="unsubscribes")
    assert res.body["items"][0]["address"] == "x@y.com"


def test_validate_webhook_signature(client, settings):
    timestamp = "1700000000"
    token = "abc123"
    expected = hmac.new(
        settings.mailgun_webhook_signing_key.encode("utf-8"),
        f"{timestamp}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()
    assert client.validate_webhook_signature(timestamp=timestamp, token=token, signature=expected) is True
    assert client.validate_webhook_signature(timestamp=timestamp, token=token, signature="bad") is False


def test_eu_region_uses_eu_base_url():
    eu_settings = Settings(mailgun_api_key="x", mailgun_region="EU")
    eu_client = MailgunClient(settings=eu_settings, http=httpx.Client(timeout=5.0))
    assert eu_client.base_url == "https://api.eu.mailgun.net"
