"""Schemas for warmup endpoints."""
from __future__ import annotations

from pydantic import BaseModel


class WarmupRunRequest(BaseModel):
    execute: bool = False
    accelerated: bool = True


class WarmupInteractionOut(BaseModel):
    id: str
    from_email: str
    to_email: str
    interaction_type: str
    status: str
    opened_simulated: bool
    clicked_internal_link: bool

    model_config = {"from_attributes": True}


class WarmupRunResult(BaseModel):
    company_id: str
    dry_run: bool
    interactions: list[WarmupInteractionOut]
    paused_domains: list[str]
    promoted_domains: list[str]


class WarmupStatusOut(BaseModel):
    domain_id: str
    domain: str
    status: str
    sent_count: int
    reply_count: int
    failure_count: int
    last_event_at: str | None = None
