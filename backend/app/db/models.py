"""ORM models for the GTM B2B MVP.

All tables use UUID strings as primary keys (so SQLite + Postgres behave
identically) and JSON columns for raw payloads. Timestamps are timezone-aware
UTC. Enum-like fields are stored as strings to avoid SQLite enum quirks.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(tz=UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_utcnow,
        onupdate=_utcnow,
        nullable=False,
    )


# ---------------------------------------------------------------------------
# Companies + agent runs
# ---------------------------------------------------------------------------


class Company(Base, TimestampMixin):
    __tablename__ = "companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_input: Mapped[str | None] = mapped_column(Text)
    business_context_summary: Mapped[str | None] = mapped_column(Text)
    icp_description: Mapped[str | None] = mapped_column(Text)
    internal_company_size_range: Mapped[str | None] = mapped_column(String(32))
    target_company_count: Mapped[int] = mapped_column(Integer, default=0)
    suggested_domain_names: Mapped[list | None] = mapped_column(JSON)
    source_files_metadata: Mapped[list | None] = mapped_column(JSON)
    confirmation_status: Mapped[str] = mapped_column(
        String(32), default="pending_user_confirmation", nullable=False
    )
    agent_run_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True
    )

    purchased_domains: Mapped[list[PurchasedDomain]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    campaigns: Mapped[list[Campaign]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class AgentRun(Base, TimestampMixin):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    agent_name: Mapped[str] = mapped_column(String(64), nullable=False)
    company_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=True
    )
    model: Mapped[str] = mapped_column(String(128), default="")
    status: Mapped[str] = mapped_column(String(32), default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    input_payload: Mapped[dict | None] = mapped_column(JSON)
    final_output: Mapped[dict | None] = mapped_column(JSON)
    transcript: Mapped[list | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(64))

    tool_calls: Mapped[list[ToolCall]] = relationship(
        back_populates="agent_run", cascade="all, delete-orphan"
    )


class ToolCall(Base, TimestampMixin):
    __tablename__ = "tool_calls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    agent_run_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(128), nullable=False)
    request_payload: Mapped[dict | None] = mapped_column(JSON)
    response_payload: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(32), default="ok")
    side_effect_level: Mapped[str | None] = mapped_column(String(32))
    decision: Mapped[str | None] = mapped_column(String(64))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    idempotency_key: Mapped[str | None] = mapped_column(String(128))

    agent_run: Mapped[AgentRun] = relationship(back_populates="tool_calls")


# ---------------------------------------------------------------------------
# Campaign plan + domains
# ---------------------------------------------------------------------------


class CampaignPlan(Base, TimestampMixin):
    __tablename__ = "campaign_plans"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    required_domains: Mapped[int] = mapped_column(Integer, default=0)
    capped_domains: Mapped[int] = mapped_column(Integer, default=0)
    target_company_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class DomainCandidate(Base, TimestampMixin):
    __tablename__ = "domain_candidates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    candidate: Mapped[str] = mapped_column(String(255), nullable=False)
    available: Mapped[bool | None] = mapped_column(Boolean)
    price_usd: Mapped[float | None] = mapped_column(Float)
    premium: Mapped[bool | None] = mapped_column(Boolean)
    selection_status: Mapped[str] = mapped_column(String(32), default="evaluated")
    raw_response: Mapped[dict | None] = mapped_column(JSON)


class PurchasedDomain(Base, TimestampMixin):
    __tablename__ = "purchased_domains"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    status: Mapped[str] = mapped_column(String(32), default="dry_run_planned", nullable=False)
    provider: Mapped[str] = mapped_column(String(32), default="spaceship")
    price_usd: Mapped[float | None] = mapped_column(Float)
    cost_cents: Mapped[int | None] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    porkbun_order_id: Mapped[str | None] = mapped_column(String(128))
    porkbun_response_json: Mapped[dict | None] = mapped_column(JSON)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    api_access_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=False)
    security_lock: Mapped[bool] = mapped_column(Boolean, default=False)
    warmup_email: Mapped[str | None] = mapped_column(String(255))
    error_message: Mapped[str | None] = mapped_column(Text)

    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_purchased_domains_idem"),)

    company: Mapped[Company] = relationship(back_populates="purchased_domains")
    dns_records: Mapped[list[DomainDnsRecord]] = relationship(
        back_populates="domain", cascade="all, delete-orphan"
    )
    mailgun_domain: Mapped[MailgunDomain | None] = relationship(
        back_populates="domain", cascade="all, delete-orphan", uselist=False
    )


class DomainDnsRecord(Base, TimestampMixin):
    __tablename__ = "domain_dns_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    domain_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), default="spaceship")
    record_type: Mapped[str] = mapped_column(String(16), nullable=False)
    host: Mapped[str | None] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(255))
    value: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[int | None] = mapped_column(Integer)
    ttl: Mapped[int | None] = mapped_column(Integer, default=600)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    source: Mapped[str] = mapped_column(String(32), default="mailgun")
    external_record_id: Mapped[str | None] = mapped_column(String(128))

    domain: Mapped[PurchasedDomain] = relationship(back_populates="dns_records")


class MailgunDomain(Base, TimestampMixin):
    __tablename__ = "mailgun_domains"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    domain_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    mailgun_domain_name: Mapped[str] = mapped_column(String(255), nullable=False)
    region: Mapped[str] = mapped_column(String(8), default="US")
    status: Mapped[str] = mapped_column(String(32), default="unverified")
    sending_dns_records_json: Mapped[list | None] = mapped_column(JSON)
    receiving_dns_records_json: Mapped[list | None] = mapped_column(JSON)
    tracking_dns_records_json: Mapped[list | None] = mapped_column(JSON)
    raw_response_json: Mapped[dict | None] = mapped_column(JSON)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    domain: Mapped[PurchasedDomain] = relationship(back_populates="mailgun_domain")


# ---------------------------------------------------------------------------
# Warmup
# ---------------------------------------------------------------------------


class WarmupInteraction(Base, TimestampMixin):
    __tablename__ = "warmup_interactions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    from_domain_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="CASCADE"), nullable=False
    )
    to_domain_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="SET NULL"), nullable=True
    )
    from_email: Mapped[str] = mapped_column(String(255), nullable=False)
    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(512))
    body_text: Mapped[str | None] = mapped_column(Text)
    mailgun_message_id: Mapped[str | None] = mapped_column(String(255))
    reply_to_message_id: Mapped[str | None] = mapped_column(String(255))
    interaction_type: Mapped[str] = mapped_column(String(32), default="initial")
    status: Mapped[str] = mapped_column(String(32), default="sent")
    opened_simulated: Mapped[bool] = mapped_column(Boolean, default=False)
    clicked_internal_link: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_event_json: Mapped[dict | None] = mapped_column(JSON)


# ---------------------------------------------------------------------------
# Campaigns + targets + contacts
# ---------------------------------------------------------------------------


class TargetCompany(Base, TimestampMixin):
    __tablename__ = "target_companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str | None] = mapped_column(String(255))
    industry: Mapped[str | None] = mapped_column(String(128))
    size_range: Mapped[str | None] = mapped_column(String(32))
    location: Mapped[str | None] = mapped_column(String(128))
    score: Mapped[float | None] = mapped_column(Float)
    score_rationale: Mapped[str | None] = mapped_column(Text)
    selection_status: Mapped[str] = mapped_column(String(32), default="candidate")
    raw_payload: Mapped[dict | None] = mapped_column(JSON)


class Contact(Base, TimestampMixin):
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    target_company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("target_companies.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    linkedin_url: Mapped[str | None] = mapped_column(String(255))
    validation_status: Mapped[str] = mapped_column(String(32), default="unverified")
    raw_payload: Mapped[dict | None] = mapped_column(JSON)


class Campaign(Base, TimestampMixin):
    __tablename__ = "campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), default="default")
    status: Mapped[str] = mapped_column(String(32), default="draft")
    total_drafts: Mapped[int] = mapped_column(Integer, default=0)
    total_approved: Mapped[int] = mapped_column(Integer, default=0)
    total_sent: Mapped[int] = mapped_column(Integer, default=0)
    total_delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_opened: Mapped[int] = mapped_column(Integer, default=0)
    total_clicked: Mapped[int] = mapped_column(Integer, default=0)
    total_replied: Mapped[int] = mapped_column(Integer, default=0)
    total_failed: Mapped[int] = mapped_column(Integer, default=0)
    total_complained: Mapped[int] = mapped_column(Integer, default=0)
    total_unsubscribed: Mapped[int] = mapped_column(Integer, default=0)

    company: Mapped[Company] = relationship(back_populates="campaigns")
    drafts: Mapped[list[EmailDraft]] = relationship(
        back_populates="campaign", cascade="all, delete-orphan"
    )


class EmailDraft(Base, TimestampMixin):
    __tablename__ = "email_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    contact_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False
    )
    target_company_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("target_companies.id", ondelete="CASCADE"), nullable=False
    )
    from_domain_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="SET NULL"), nullable=True
    )
    from_email: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    body_text: Mapped[Text] = mapped_column(Text, nullable=False)
    body_html: Mapped[str | None] = mapped_column(Text)
    personalization_notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending_approval")
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    campaign: Mapped[Campaign] = relationship(back_populates="drafts")


class EmailSend(Base, TimestampMixin):
    __tablename__ = "email_sends"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    draft_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("email_drafts.id", ondelete="CASCADE"), nullable=False
    )
    campaign_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False
    )
    from_domain_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("purchased_domains.id", ondelete="SET NULL"), nullable=True
    )
    mailgun_message_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(48), default="queued")
    error_message: Mapped[str | None] = mapped_column(Text)
    raw_response: Mapped[dict | None] = mapped_column(JSON)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EmailEvent(Base, TimestampMixin):
    __tablename__ = "email_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email_send_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("email_sends.id", ondelete="SET NULL"), nullable=True
    )
    mailgun_message_id: Mapped[str | None] = mapped_column(String(255))
    event_type: Mapped[str] = mapped_column(String(48), nullable=False)
    severity: Mapped[str | None] = mapped_column(String(32))
    recipient: Mapped[str | None] = mapped_column(String(255))
    raw_payload: Mapped[dict | None] = mapped_column(JSON)
    occurred_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Suppression(Base, TimestampMixin):
    __tablename__ = "suppressions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    reason: Mapped[str] = mapped_column(String(48), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="mailgun_webhook")
    note: Mapped[str | None] = mapped_column(Text)


class WebhookEvent(Base, TimestampMixin):
    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    provider: Mapped[str] = mapped_column(String(32), default="mailgun")
    kind: Mapped[str] = mapped_column(String(32), default="event")
    valid_signature: Mapped[bool] = mapped_column(Boolean, default=False)
    raw_payload: Mapped[dict | None] = mapped_column(JSON)
    processing_status: Mapped[str] = mapped_column(String(32), default="pending")
    error_message: Mapped[str | None] = mapped_column(Text)


class AuditLog(Base, TimestampMixin):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    actor: Mapped[str] = mapped_column(String(64), default="system")
    tool_name: Mapped[str | None] = mapped_column(String(128))
    decision: Mapped[str] = mapped_column(String(64), nullable=False)
    flag: Mapped[str | None] = mapped_column(String(64))
    side_effect_level: Mapped[str | None] = mapped_column(String(32))
    request_summary: Mapped[Any | None] = mapped_column(JSON)
    response_summary: Mapped[Any | None] = mapped_column(JSON)
    note: Mapped[str | None] = mapped_column(Text)


class OwnedDomainPool(Base, TimestampMixin):
    """Pre-owned domains the demo can pull from instead of purchasing.

    Statuses:
      - ``available``: free to be assigned to a company by the seeding step.
      - ``in_use``: already attached to a company's PurchasedDomain row.
      - ``retired``: kept for history; not eligible for new runs.
    """

    __tablename__ = "owned_domain_pool"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="available", nullable=False)


__all__ = [
    "AgentRun",
    "AuditLog",
    "Campaign",
    "CampaignPlan",
    "Company",
    "Contact",
    "DomainCandidate",
    "DomainDnsRecord",
    "EmailDraft",
    "EmailEvent",
    "EmailSend",
    "MailgunDomain",
    "OwnedDomainPool",
    "PurchasedDomain",
    "Suppression",
    "TargetCompany",
    "ToolCall",
    "WarmupInteraction",
    "WebhookEvent",
]
