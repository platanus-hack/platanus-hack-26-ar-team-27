"""GTM Diagnostic agent factory."""
from __future__ import annotations

from pathlib import Path

from app.agents.base import Agent
from app.schemas.gtm import GtmDiagnostic

_PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "gtm_diagnostic.md"


def build_agent() -> Agent:
    return Agent(
        name="gtm-diagnostic",
        system_prompt=_PROMPT_PATH.read_text(encoding="utf-8"),
        output_schema=GtmDiagnostic,
        allowed_tools=["summarize_business_context", "suggest_domain_candidates"],
    )
