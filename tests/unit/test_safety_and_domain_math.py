from __future__ import annotations

from app.core.safety import Decision, SideEffectLevel, evaluate, required_domains
from app.core.settings import Settings


def test_required_domains_caps_at_two():
    assert required_domains(60, settings=Settings(domain_purchase_max_count=2)) == 2
    assert required_domains(12, settings=Settings(domain_purchase_max_count=2)) == 1
    assert required_domains(0, settings=Settings(domain_purchase_max_count=2)) == 0
    assert required_domains(200, settings=Settings(domain_purchase_max_count=2)) == 2


def test_settings_clamps_max_count_to_hard_ceiling(monkeypatch):
    s = Settings(domain_purchase_max_count=10)
    assert s.domain_purchase_max_count == 2


def test_settings_clamps_price_to_hard_ceiling():
    s = Settings(domain_purchase_max_price_usd=99.0)
    assert s.domain_purchase_max_price_usd == 4.00


def test_safety_evaluate_purchase_blocked_without_flag():
    s = Settings(allow_domain_purchases=False)
    res = evaluate(SideEffectLevel.PURCHASE, execute=True, settings=s)
    assert res.decision == Decision.BLOCKED_BY_FLAG
    assert res.flag == "ALLOW_DOMAIN_PURCHASES"


def test_safety_evaluate_purchase_dry_run_default():
    s = Settings(allow_domain_purchases=True)
    res = evaluate(SideEffectLevel.PURCHASE, execute=False, settings=s)
    assert res.decision == Decision.DRY_RUN


def test_safety_evaluate_purchase_allowed():
    s = Settings(allow_domain_purchases=True)
    res = evaluate(SideEffectLevel.PURCHASE, execute=True, settings=s)
    assert res.decision == Decision.ALLOWED


def test_safety_evaluate_send_blocked():
    s = Settings(allow_cold_emails=False, allow_demo_emails=False)
    res = evaluate(SideEffectLevel.SEND_EMAIL, execute=True, settings=s)
    assert res.decision == Decision.BLOCKED_BY_FLAG


def test_safety_evaluate_send_allowed_with_demo_flag():
    s = Settings(allow_demo_emails=True)
    res = evaluate(SideEffectLevel.SEND_EMAIL, execute=True, settings=s)
    assert res.decision == Decision.ALLOWED


def test_db_write_always_allowed():
    res = evaluate(SideEffectLevel.DB_WRITE, execute=False)
    assert res.decision == Decision.ALLOWED
