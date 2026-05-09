"""GTM Diagnostic helper tools.

These are exposed to the GTM Diagnostic agent. They never touch external
services and are safe to call freely.
"""
from __future__ import annotations

from typing import Any

from app.core.safety import SideEffectLevel
from app.tools.registry import Tool, register_tool


def _parse_company_input(*, raw_input: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    return {"length": len(raw_input), "preview": raw_input[:200]}


def _summarize_business_context(*, raw_input: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    return {"summary": raw_input[:600]}


def _suggest_domain_candidates(*, company_name: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    slug = "".join(ch for ch in company_name.lower() if ch.isalnum())[:24] or "company"
    return {
        "candidates": [
            f"{slug}.com",
            f"try{slug}.com",
            f"{slug}-outbound.com",
            f"{slug}.io",
        ]
    }


def _estimate_target_count(*, raw_input: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    text = raw_input.lower()
    if "enterprise" in text or "fortune" in text:
        return {"target_company_count": 25}
    if "small" in text or "boutique" in text:
        return {"target_company_count": 50}
    return {"target_company_count": 60}


def _estimate_internal_size(*, raw_input: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    text = raw_input.lower()
    for marker, size in (
        ("solo", "solo"),
        ("just me", "solo"),
        ("small team", "2-10"),
        ("dozen", "11-50"),
        ("hundred", "51-200"),
        ("thousand", "201+"),
    ):
        if marker in text:
            return {"internal_company_size_range": size}
    return {"internal_company_size_range": "unknown"}


def _save_gtm_diagnostic_result(*, payload: dict, session=None, dry_run: bool = False, **_: Any) -> dict:
    return {"saved": True, "echo": payload}


def _extract_company_profile(*, raw_input: str, session=None, dry_run: bool = False, **_: Any) -> dict:
    name = raw_input.strip().split("\n", 1)[0][:80]
    return {"company_name_guess": name}


_STRING_INPUT = {"type": "object", "properties": {"raw_input": {"type": "string"}}, "required": ["raw_input"]}


def register_all() -> None:
    register_tool(
        Tool(
            name="parse_company_input",
            description="Return basic stats and a preview of the input text.",
            input_schema=_STRING_INPUT,
            implementation=_parse_company_input,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="summarize_business_context",
            description="Summarize the business context.",
            input_schema=_STRING_INPUT,
            implementation=_summarize_business_context,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="suggest_domain_candidates",
            description="Suggest 3–5 domain candidates derived from the company name.",
            input_schema={
                "type": "object",
                "properties": {"company_name": {"type": "string"}},
                "required": ["company_name"],
            },
            implementation=_suggest_domain_candidates,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="estimate_campaign_target_count",
            description="Heuristic target-company-count estimator from input text.",
            input_schema=_STRING_INPUT,
            implementation=_estimate_target_count,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="estimate_internal_org_size",
            description="Heuristic internal company size estimator.",
            input_schema=_STRING_INPUT,
            implementation=_estimate_internal_size,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="extract_company_profile",
            description="Extract a company-name guess from the first line of input.",
            input_schema=_STRING_INPUT,
            implementation=_extract_company_profile,
            side_effect_level=SideEffectLevel.NONE,
        )
    )
    register_tool(
        Tool(
            name="save_gtm_diagnostic_result",
            description="Acknowledge a structured diagnostic payload (no-op DB write in MVP).",
            input_schema={
                "type": "object",
                "properties": {"payload": {"type": "object"}},
                "required": ["payload"],
            },
            implementation=_save_gtm_diagnostic_result,
            side_effect_level=SideEffectLevel.DB_WRITE,
        )
    )
