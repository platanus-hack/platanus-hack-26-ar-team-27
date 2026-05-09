"""DNS Configuration agent factory."""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel

from app.agents.base import Agent

_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "dns_configuration.md").read_text(encoding="utf-8")


class DnsSummary(BaseModel):
    domain: str
    records_created: int
    verified: bool
    notes: str = ""


def build_agent() -> Agent:
    return Agent(
        name="dns-configuration",
        system_prompt=_PROMPT,
        output_schema=DnsSummary,
        allowed_tools=[
            "mailgun_create_domain",
            "mailgun_verify_domain",
            "porkbun_create_record",
        ],
    )
