from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from app.core.settings import Settings
from app.services.research.anthropic_web import AnthropicWebResearchProvider
from app.services.research.provider import SellerContext


@dataclass
class _Block:
    type: str
    text: str = ""


@dataclass
class _Response:
    content: list[_Block]
    stop_reason: str = "end_turn"


class _StubAnthropic:
    """Pretends to be `anthropic.Anthropic` for the provider's `messages.create`."""

    def __init__(self, scripted: list[_Response]):
        self._scripted = list(scripted)
        self.calls: list[dict[str, Any]] = []
        self.messages = self  # so client.messages.create works

    def create(self, **kwargs):  # noqa: D401
        self.calls.append(kwargs)
        if not self._scripted:
            raise AssertionError("no scripted responses left")
        return self._scripted.pop(0)


def _seller() -> SellerContext:
    return SellerContext(
        name="Helio Robotics",
        business_context_summary=(
            "Helio Robotics builds predictive-maintenance SaaS for industrial robots."
        ),
        icp_description="Plant managers in mid-market manufacturing in LATAM (50–500 employees)",
        target_company_count=25,
        internal_company_size_range="2-10",
    )


def _settings() -> Settings:
    return Settings(
        anthropic_api_key="sk-test",
        anthropic_model="claude-sonnet-4-5",
        anthropic_temperature=0.0,
        research_provider="anthropic_web",
    )


def test_find_target_companies_parses_json_and_validates_evidence(monkeypatch):
    payload = """
    {"accounts": [
      {"name": "Aurora Manufacturing", "domain": "auroramfg.com.ar",
       "industry": "Industrial manufacturing", "size_range": "201+",
       "location": "Buenos Aires, Argentina", "score": 0.82,
       "score_rationale": "matches ICP, downtime is a public KPI",
       "evidence_url": "https://auroramfg.com.ar/about"},
      {"name": "Empty Account",
       "evidence_url": "https://example.com/found"},
      {"name": "No Evidence Co", "evidence_url": ""}
    ]}
    """
    stub = _StubAnthropic([_Response(content=[_Block(type="text", text=payload)])])
    provider = AnthropicWebResearchProvider(settings=_settings(), client=stub)
    accounts = provider.find_target_companies(seller=_seller(), limit=5)
    # First two have evidence_url; third is dropped.
    assert [a.name for a in accounts] == ["Aurora Manufacturing", "Empty Account"]
    aurora = accounts[0]
    assert aurora.domain == "auroramfg.com.ar"
    assert aurora.size_range == "201+"
    assert aurora.score == 0.82
    assert aurora.evidence_url == "https://auroramfg.com.ar/about"
    # Tool definitions must include both web_search and web_fetch.
    tools = stub.calls[0]["tools"]
    types = {t["type"] for t in tools}
    assert types == {"web_search_20250305", "web_fetch_20250910"}


def test_find_target_companies_resumes_on_pause_turn(monkeypatch):
    final = """{"accounts": [{"name":"X","evidence_url":"https://x.example"}]}"""
    stub = _StubAnthropic(
        [
            _Response(content=[], stop_reason="pause_turn"),
            _Response(content=[_Block(type="text", text=final)]),
        ]
    )
    provider = AnthropicWebResearchProvider(settings=_settings(), client=stub)
    accounts = provider.find_target_companies(seller=_seller(), limit=2)
    assert len(stub.calls) == 2
    assert [a.name for a in accounts] == ["X"]


def test_find_contacts_drops_unverifiable(monkeypatch):
    payload = """
    {"contacts": [
      {"full_name":"Lucia Mendoza","title":"Plant Manager",
       "email":null,"linkedin_url":"https://linkedin.com/in/lucia",
       "evidence_url":"https://auroramfg.com.ar/about"},
      {"full_name":"","title":"","email":null,"linkedin_url":null}
    ]}
    """
    stub = _StubAnthropic([_Response(content=[_Block(type="text", text=payload)])])
    provider = AnthropicWebResearchProvider(settings=_settings(), client=stub)
    from app.services.research.provider import TargetAccount

    target = TargetAccount(
        name="Aurora",
        domain="auroramfg.com.ar",
        industry="Manufacturing",
        size_range="201+",
        location="Buenos Aires",
        raw={},
        evidence_url="https://auroramfg.com.ar/about",
    )
    contacts = provider.find_contacts(target, seller=_seller(), limit=3)
    assert len(contacts) == 1
    assert contacts[0].full_name == "Lucia Mendoza"
    assert contacts[0].email is None  # null in source -> stays null


def test_invalid_json_raises():
    stub = _StubAnthropic([_Response(content=[_Block(type="text", text="not json at all")])])
    provider = AnthropicWebResearchProvider(settings=_settings(), client=stub)
    with pytest.raises(RuntimeError):
        provider.find_target_companies(seller=_seller(), limit=2)


def test_requires_api_key():
    s = Settings(anthropic_api_key="", research_provider="anthropic_web")
    with pytest.raises(RuntimeError):
        AnthropicWebResearchProvider(settings=s)
