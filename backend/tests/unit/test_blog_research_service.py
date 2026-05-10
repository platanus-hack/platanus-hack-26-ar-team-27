from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import pytest

from app.core.settings import Settings
from app.db.models import Company
from app.services.blog_research_service import (
    AnthropicBlogResearchProvider,
    infer_industry_brief,
)


@dataclass
class _Block:
    type: str
    text: str = ""


@dataclass
class _Response:
    content: list[_Block]
    stop_reason: str = "end_turn"


class _StubAnthropic:
    def __init__(self, scripted: list[_Response]):
        self._scripted = list(scripted)
        self.calls: list[dict[str, Any]] = []
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._scripted:
            raise AssertionError("no scripted responses left")
        return self._scripted.pop(0)


def _company() -> Company:
    return Company(
        name="Helio Robotics",
        business_context_summary=(
            "Helio Robotics builds predictive-maintenance SaaS for industrial robots."
        ),
        gtm_strategy=(
            "Position the brand around uptime, implementation clarity and operational ROI."
        ),
        icp_description="Plant managers in mid-market manufacturing teams across LATAM",
        target_countries=["Mexico", "Chile"],
    )


def _settings() -> Settings:
    return Settings(
        anthropic_api_key="sk-test",
        anthropic_model="claude-sonnet-4-5",
        anthropic_temperature=0.0,
    )


def test_infer_industry_brief_uses_existing_diagnostic_fields():
    brief = infer_industry_brief(_company())
    assert brief.company_name == "Helio Robotics"
    assert "predictive-maintenance SaaS" in brief.industry_label
    assert "Plant managers" in brief.audience_summary
    assert brief.geography_summary == "Mexico, Chile"
    assert "operational ROI" in (brief.gtm_summary or "")


def test_blog_editorial_research_parses_json_and_tracks_urls():
    payload = """
    {
      "industry_label": "Industrial automation software",
      "editorial_angles": [
        "How operators evaluate reliability without bloated implementation plans",
        "Where implementation friction quietly kills adoption"
      ],
      "pain_points": [
        "Pressure to modernize operations without disrupting throughput",
        "Need to prove ROI to multiple stakeholders"
      ],
      "market_language": ["uptime", "workflow visibility", "operator adoption"],
      "evidence_urls": [
        "https://example.com/report",
        "https://example.com/buyer-guide"
      ]
    }
    """
    stub = _StubAnthropic([_Response(content=[_Block(type="text", text=payload)])])
    provider = AnthropicBlogResearchProvider(settings=_settings(), client=stub)

    result = provider.research(brief=infer_industry_brief(_company()))

    assert result.generation_mode == "web_research"
    assert result.industry_label == "Industrial automation software"
    assert result.editorial_angles[0].startswith("How operators evaluate")
    assert result.evidence_urls == [
        "https://example.com/report",
        "https://example.com/buyer-guide",
    ]
    tools = stub.calls[0]["tools"]
    assert {tool["type"] for tool in tools} == {
        "web_search_20250305",
        "web_fetch_20250910",
    }


def test_blog_editorial_research_resumes_on_pause_turn():
    payload = """
    {
      "industry_label": "Industrial automation software",
      "editorial_angles": ["A grounded editorial angle"],
      "pain_points": ["A grounded pain point"],
      "market_language": ["uptime"],
      "evidence_urls": ["https://example.com/report"]
    }
    """
    stub = _StubAnthropic(
        [
            _Response(content=[], stop_reason="pause_turn"),
            _Response(content=[_Block(type="text", text=payload)]),
        ]
    )
    provider = AnthropicBlogResearchProvider(settings=_settings(), client=stub)

    result = provider.research(brief=infer_industry_brief(_company()))

    assert len(stub.calls) == 2
    assert result.evidence_urls == ["https://example.com/report"]


def test_blog_editorial_research_requires_api_key():
    with pytest.raises(RuntimeError):
        AnthropicBlogResearchProvider(settings=Settings(anthropic_api_key=""))
