"""Schemas for domain planning, purchase, DNS configuration."""
from __future__ import annotations

from pydantic import BaseModel, Field


class DomainPlan(BaseModel):
    company_id: str
    target_company_count: int
    required_domains: int
    capped_domains: int
    suggested_candidates: list[str]


class DomainPurchaseRequest(BaseModel):
    execute: bool = False
    candidates: list[str] | None = None


class PurchasedDomainOut(BaseModel):
    id: str
    domain: str
    status: str
    price_usd: float | None = None
    porkbun_order_id: str | None = None
    idempotency_key: str
    warmup_email: str | None = None

    model_config = {"from_attributes": True}


class DomainPurchaseResult(BaseModel):
    company_id: str
    dry_run: bool
    purchased: list[PurchasedDomainOut]
    rejected: list[dict] = Field(default_factory=list)
    audit_decision: str


class DnsConfigureRequest(BaseModel):
    execute: bool = False


class DnsRecordOut(BaseModel):
    id: str
    record_type: str
    host: str | None
    value: str
    priority: int | None = None
    status: str
    external_record_id: str | None = None

    model_config = {"from_attributes": True}


class DnsConfigureResult(BaseModel):
    domain_id: str
    domain: str
    dry_run: bool
    mailgun_status: str
    records: list[DnsRecordOut]


class DnsVerifyResult(BaseModel):
    domain_id: str
    domain: str
    status: str
    pending_records: list[str] = Field(default_factory=list)
