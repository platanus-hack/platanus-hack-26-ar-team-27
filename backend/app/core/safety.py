"""Single source of truth for feature flags and safety gates.

Every code path that triggers an external side effect classified as
purchase / send_email / external_write MUST consult `evaluate` before
executing. The runner enforces this for tool calls; services call the
helpers directly when they orchestrate flows outside a tool.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

from app.core.settings import Settings, get_settings


class SideEffectLevel(str, Enum):
    NONE = "none"
    DB_WRITE = "db_write"
    EXTERNAL_READ = "external_read"
    EXTERNAL_WRITE = "external_write"
    PURCHASE = "purchase"
    SEND_EMAIL = "send_email"


class Decision(str, Enum):
    ALLOWED = "allowed"
    DRY_RUN = "dry_run"
    BLOCKED_BY_FLAG = "blocked_by_flag"
    BLOCKED_BY_CAP = "blocked_by_cap"
    UNAUTHORIZED_TOOL = "unauthorized_tool"
    IDEMPOTENT_SKIP = "idempotent_skip"
    WEBHOOK_SIGNATURE_INVALID = "webhook_signature_invalid"


@dataclass(frozen=True)
class SafetyEvaluation:
    decision: Decision
    flag: str | None
    reason: str

    @property
    def allowed(self) -> bool:
        return self.decision == Decision.ALLOWED


def evaluate(
    side_effect: SideEffectLevel,
    *,
    execute: bool = False,
    settings: Settings | None = None,
) -> SafetyEvaluation:
    s = settings or get_settings()
    if side_effect in (SideEffectLevel.NONE, SideEffectLevel.DB_WRITE, SideEffectLevel.EXTERNAL_READ):
        return SafetyEvaluation(Decision.ALLOWED, None, "non-dangerous side effect")
    if not execute:
        return SafetyEvaluation(
            Decision.DRY_RUN,
            None,
            "execute=false → simulating instead of running real action",
        )
    if side_effect == SideEffectLevel.PURCHASE:
        if not s.allow_domain_purchases:
            return SafetyEvaluation(
                Decision.BLOCKED_BY_FLAG,
                "ALLOW_DOMAIN_PURCHASES",
                "real domain purchases require ALLOW_DOMAIN_PURCHASES=true",
            )
        return SafetyEvaluation(Decision.ALLOWED, "ALLOW_DOMAIN_PURCHASES", "purchase allowed")
    if side_effect == SideEffectLevel.SEND_EMAIL:
        if not s.allow_cold_emails and not s.allow_demo_emails:
            return SafetyEvaluation(
                Decision.BLOCKED_BY_FLAG,
                "ALLOW_COLD_EMAILS",
                "real email sends require ALLOW_COLD_EMAILS or ALLOW_DEMO_EMAILS",
            )
        return SafetyEvaluation(Decision.ALLOWED, "ALLOW_COLD_EMAILS", "send allowed")
    if side_effect == SideEffectLevel.EXTERNAL_WRITE:
        if not s.allow_cold_emails and not s.allow_domain_purchases:
            return SafetyEvaluation(
                Decision.BLOCKED_BY_FLAG,
                "ALLOW_COLD_EMAILS|ALLOW_DOMAIN_PURCHASES",
                "external writes require an ALLOW_* flag aligned with the domain/email path",
            )
        return SafetyEvaluation(Decision.ALLOWED, None, "external write allowed")
    return SafetyEvaluation(Decision.BLOCKED_BY_FLAG, None, f"unknown side effect: {side_effect}")


def required_domains(target_company_count: int, settings: Settings | None = None) -> int:
    """Apply the 1-per-25 rule, capped by the hard ceiling."""
    s = settings or get_settings()
    if target_company_count <= 0:
        return 0
    raw = math.ceil(target_company_count / max(1, 25 // max(1, s.domain_purchase_domains_per_25_companies)))
    return min(raw, s.domain_purchase_max_count, s.HARD_DOMAIN_COUNT_CEILING)


def price_within_ceiling(price_usd: float, settings: Settings | None = None) -> bool:
    s = settings or get_settings()
    return price_usd <= s.domain_purchase_max_price_usd <= s.HARD_DOMAIN_PRICE_CEILING_USD
