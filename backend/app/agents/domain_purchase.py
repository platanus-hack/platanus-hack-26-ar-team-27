"""Domain Purchase agent factory."""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.base import Agent

_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "domain_purchase.md").read_text(encoding="utf-8")


class DomainPurchaseSummary(BaseModel):
    purchased: list[str] = Field(default_factory=list)
    rejected: list[dict] = Field(default_factory=list)
    notes: str = ""


def build_agent() -> Agent:
    return Agent(
        name="domain-purchase",
        system_prompt=_PROMPT,
        output_schema=DomainPurchaseSummary,
        allowed_tools=[
            "porkbun_check_availability",
            "porkbun_register_domain",
        ],
    )
