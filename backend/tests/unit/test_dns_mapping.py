from __future__ import annotations

from app.services.dns_service import _normalize_record


def test_normalize_record_txt():
    out = _normalize_record(
        {"record_type": "TXT", "name": "@", "value": "v=spf1 ~all"}
    )
    assert out == {"record_type": "TXT", "name": "@", "value": "v=spf1 ~all", "priority": None}


def test_normalize_record_mx_with_priority():
    out = _normalize_record({"record_type": "MX", "priority": "10", "value": "mxa.mailgun.org"})
    assert out["priority"] == 10
    assert out["record_type"] == "MX"


def test_normalize_record_cname_alt_keys():
    out = _normalize_record({"type": "CNAME", "host": "email.example.com", "content": "mailgun.org"})
    assert out["record_type"] == "CNAME"
    assert out["name"] == "email.example.com"
    assert out["value"] == "mailgun.org"
