"""Deterministic fixtures for dry-run tool/service paths.

Used both by the runner (when a tool's dry-run helper is invoked) and by
services that want to simulate an external response without flipping flags.
"""
from __future__ import annotations

import hashlib
from collections.abc import Iterable
from typing import Any


def porkbun_pricing() -> dict[str, Any]:
    return {
        "status": "SUCCESS",
        "pricing": {
            "com": {"registration": "9.13"},
            "co": {"registration": "11.50"},
            "io": {"registration": "39.99"},
            "xyz": {"registration": "1.99"},
            "site": {"registration": "2.49"},
            "online": {"registration": "3.99"},
            "biz": {"registration": "3.50"},
            "shop": {"registration": "1.50"},
        },
    }


def porkbun_check_availability(domain: str) -> dict[str, Any]:
    """Cheap deterministic generator: always available, price by TLD, premium=false unless 'premium' in name."""
    tld = domain.rsplit(".", 1)[-1]
    pricing = porkbun_pricing()["pricing"].get(tld, {"registration": "3.99"})
    premium = "premium" in domain
    price = float(pricing["registration"])
    if premium:
        price = 250.0
    return {
        "status": "SUCCESS",
        "available": "taken" not in domain,
        "price": f"{price:.2f}",
        "regularPrice": f"{price:.2f}",
        "premium": premium,
    }


def porkbun_register(domain: str) -> dict[str, Any]:
    return {
        "status": "SUCCESS",
        "id": "porkbun-dry-" + hashlib.sha256(domain.encode("utf-8")).hexdigest()[:12],
    }


def porkbun_create_record(domain: str, *, type: str, name: str, content: str) -> dict[str, Any]:
    h = hashlib.sha256(f"{domain}|{type}|{name}|{content}".encode()).hexdigest()[:12]
    return {"status": "SUCCESS", "id": f"rec-{h}"}


def mailgun_create_domain(name: str) -> dict[str, Any]:
    return {
        "domain": {"name": name, "state": "unverified"},
        "sending_dns_records": [
            {"record_type": "TXT", "name": name, "value": "v=spf1 include:mailgun.org ~all", "valid": "unknown"},
            {
                "record_type": "TXT",
                "name": f"krs._domainkey.{name}",
                "value": "k=rsa; p=MIIBI... (truncated)",
                "valid": "unknown",
            },
            {"record_type": "CNAME", "name": f"email.{name}", "value": "mailgun.org", "valid": "unknown"},
        ],
        "receiving_dns_records": [
            {"record_type": "MX", "priority": "10", "value": "mxa.mailgun.org", "valid": "unknown"},
            {"record_type": "MX", "priority": "10", "value": "mxb.mailgun.org", "valid": "unknown"},
        ],
    }


def mailgun_verify_domain(name: str) -> dict[str, Any]:
    return {"domain": {"name": name, "state": "active"}, "message": "Domain DNS records have been updated"}


def mailgun_send_message(
    domain: str,
    *,
    recipient: str | None = None,
    recipients: Iterable[str] | None = None,
    subject: str,
) -> dict[str, Any]:
    to = [value for value in (recipients or ([recipient] if recipient else [])) if value]
    if not to:
        to = ["n/a"]
    msg_id = (
        "<"
        + hashlib.sha256(f"{domain}|{'|'.join(to)}|{subject}".encode()).hexdigest()[:24]
        + f"@{domain}>"
    )
    return {"id": msg_id, "message": "Queued. Thank you. (dry-run)", "to": to}
