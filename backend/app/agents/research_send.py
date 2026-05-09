"""Research & Send agent factory."""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.base import Agent

_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "research_send.md").read_text(encoding="utf-8")


class ResearchSendSummary(BaseModel):
    drafts_created: int = 0
    sends: int = 0
    skipped: list[dict] = Field(default_factory=list)
    notes: str = ""


def build_agent() -> Agent:
    return Agent(
        name="research-and-send",
        system_prompt=_PROMPT,
        output_schema=ResearchSendSummary,
        allowed_tools=[
            "find_target_companies",
            "find_contacts",
            "score_target_company",
            "compose_campaign_email",
            "save_email_draft",
            "approve_email_batch",
            "check_suppression",
            "send_campaign_email",
        ],
    )
