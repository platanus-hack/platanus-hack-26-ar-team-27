"""Warmup Lite agent factory."""
from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, Field

from app.agents.base import Agent

_PROMPT = (Path(__file__).resolve().parent.parent / "prompts" / "warmup_lite.md").read_text(encoding="utf-8")


class WarmupSummary(BaseModel):
    sends: int = 0
    replies: int = 0
    paused_domains: list[str] = Field(default_factory=list)
    promoted_domains: list[str] = Field(default_factory=list)
    notes: str = ""


def build_agent() -> Agent:
    return Agent(
        name="warmup-lite",
        system_prompt=_PROMPT,
        output_schema=WarmupSummary,
        allowed_tools=[
            "get_warmup_pairs",
            "send_warmup_email",
            "record_reply",
            "mark_domain_paused",
            "mark_domain_active",
        ],
    )
