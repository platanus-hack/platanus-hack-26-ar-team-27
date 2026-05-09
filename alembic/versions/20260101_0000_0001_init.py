"""init schema

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _ts_columns() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("agent_name", sa.String(length=64), nullable=False),
        sa.Column("company_id", sa.String(length=36), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="running"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("input_payload", sa.JSON(), nullable=True),
        sa.Column("final_output", sa.JSON(), nullable=True),
        sa.Column("transcript", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_code", sa.String(length=64), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "companies",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("raw_input", sa.Text(), nullable=True),
        sa.Column("business_context_summary", sa.Text(), nullable=True),
        sa.Column("icp_description", sa.Text(), nullable=True),
        sa.Column("internal_company_size_range", sa.String(length=32), nullable=True),
        sa.Column("target_company_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("suggested_domain_names", sa.JSON(), nullable=True),
        sa.Column("source_files_metadata", sa.JSON(), nullable=True),
        sa.Column(
            "confirmation_status",
            sa.String(length=32),
            nullable=False,
            server_default="pending_user_confirmation",
        ),
        sa.Column(
            "agent_run_id",
            sa.String(length=36),
            sa.ForeignKey("agent_runs.id", ondelete="SET NULL"),
            nullable=True,
        ),
        *_ts_columns(),
    )

    op.create_table(
        "tool_calls",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "agent_run_id",
            sa.String(length=36),
            sa.ForeignKey("agent_runs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tool_name", sa.String(length=128), nullable=False),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("response_payload", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ok"),
        sa.Column("side_effect_level", sa.String(length=32), nullable=True),
        sa.Column("decision", sa.String(length=64), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "campaign_plans",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("required_domains", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("capped_domains", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_company_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "domain_candidates",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("candidate", sa.String(length=255), nullable=False),
        sa.Column("available", sa.Boolean(), nullable=True),
        sa.Column("price_usd", sa.Float(), nullable=True),
        sa.Column("premium", sa.Boolean(), nullable=True),
        sa.Column("selection_status", sa.String(length=32), nullable=False, server_default="evaluated"),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "purchased_domains",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", sa.String(length=255), nullable=False, unique=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="dry_run_planned"),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="spaceship"),
        sa.Column("price_usd", sa.Float(), nullable=True),
        sa.Column("cost_cents", sa.Integer(), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="USD"),
        sa.Column("porkbun_order_id", sa.String(length=128), nullable=True),
        sa.Column("porkbun_response_json", sa.JSON(), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("api_access_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("auto_renew", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("security_lock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("warmup_email", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        *_ts_columns(),
        sa.UniqueConstraint("idempotency_key", name="uq_purchased_domains_idem"),
    )

    op.create_table(
        "domain_dns_records",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="spaceship"),
        sa.Column("record_type", sa.String(length=16), nullable=False),
        sa.Column("host", sa.String(length=255), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("ttl", sa.Integer(), nullable=True, server_default="600"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="mailgun"),
        sa.Column("external_record_id", sa.String(length=128), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "mailgun_domains",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("mailgun_domain_name", sa.String(length=255), nullable=False),
        sa.Column("region", sa.String(length=8), nullable=False, server_default="US"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="unverified"),
        sa.Column("sending_dns_records_json", sa.JSON(), nullable=True),
        sa.Column("receiving_dns_records_json", sa.JSON(), nullable=True),
        sa.Column("tracking_dns_records_json", sa.JSON(), nullable=True),
        sa.Column("raw_response_json", sa.JSON(), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "warmup_interactions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "from_domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "to_domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("from_email", sa.String(length=255), nullable=False),
        sa.Column("to_email", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=512), nullable=True),
        sa.Column("body_text", sa.Text(), nullable=True),
        sa.Column("mailgun_message_id", sa.String(length=255), nullable=True),
        sa.Column("reply_to_message_id", sa.String(length=255), nullable=True),
        sa.Column("interaction_type", sa.String(length=32), nullable=False, server_default="initial"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="sent"),
        sa.Column("opened_simulated", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("clicked_internal_link", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw_event_json", sa.JSON(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "target_companies",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=True),
        sa.Column("industry", sa.String(length=128), nullable=True),
        sa.Column("size_range", sa.String(length=32), nullable=True),
        sa.Column("location", sa.String(length=128), nullable=True),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("score_rationale", sa.Text(), nullable=True),
        sa.Column("selection_status", sa.String(length=32), nullable=False, server_default="candidate"),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "contacts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "target_company_id",
            sa.String(length=36),
            sa.ForeignKey("target_companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("linkedin_url", sa.String(length=255), nullable=True),
        sa.Column("validation_status", sa.String(length=32), nullable=False, server_default="unverified"),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "campaigns",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "company_id",
            sa.String(length=36),
            sa.ForeignKey("companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False, server_default="default"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="draft"),
        sa.Column("total_drafts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_approved", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_sent", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_delivered", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_opened", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_clicked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_replied", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_failed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_complained", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_unsubscribed", sa.Integer(), nullable=False, server_default="0"),
        *_ts_columns(),
    )

    op.create_table(
        "email_drafts",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "campaign_id",
            sa.String(length=36),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.String(length=36),
            sa.ForeignKey("contacts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "target_company_id",
            sa.String(length=36),
            sa.ForeignKey("target_companies.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("from_email", sa.String(length=255), nullable=True),
        sa.Column("subject", sa.String(length=512), nullable=False),
        sa.Column("body_text", sa.Text(), nullable=False),
        sa.Column("body_html", sa.Text(), nullable=True),
        sa.Column("personalization_notes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="pending_approval"),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "email_sends",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "draft_id",
            sa.String(length=36),
            sa.ForeignKey("email_drafts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "campaign_id",
            sa.String(length=36),
            sa.ForeignKey("campaigns.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_domain_id",
            sa.String(length=36),
            sa.ForeignKey("purchased_domains.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("mailgun_message_id", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=48), nullable=False, server_default="queued"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "email_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "email_send_id",
            sa.String(length=36),
            sa.ForeignKey("email_sends.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("mailgun_message_id", sa.String(length=255), nullable=True),
        sa.Column("event_type", sa.String(length=48), nullable=False),
        sa.Column("severity", sa.String(length=32), nullable=True),
        sa.Column("recipient", sa.String(length=255), nullable=True),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "suppressions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("reason", sa.String(length=48), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="mailgun_webhook"),
        sa.Column("note", sa.Text(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "webhook_events",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False, server_default="mailgun"),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="event"),
        sa.Column("valid_signature", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("raw_payload", sa.JSON(), nullable=True),
        sa.Column("processing_status", sa.String(length=32), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        *_ts_columns(),
    )

    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("actor", sa.String(length=64), nullable=False, server_default="system"),
        sa.Column("tool_name", sa.String(length=128), nullable=True),
        sa.Column("decision", sa.String(length=64), nullable=False),
        sa.Column("flag", sa.String(length=64), nullable=True),
        sa.Column("side_effect_level", sa.String(length=32), nullable=True),
        sa.Column("request_summary", sa.JSON(), nullable=True),
        sa.Column("response_summary", sa.JSON(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        *_ts_columns(),
    )


def downgrade() -> None:
    for table in (
        "audit_logs",
        "webhook_events",
        "suppressions",
        "email_events",
        "email_sends",
        "email_drafts",
        "campaigns",
        "contacts",
        "target_companies",
        "warmup_interactions",
        "mailgun_domains",
        "domain_dns_records",
        "purchased_domains",
        "domain_candidates",
        "campaign_plans",
        "tool_calls",
        "companies",
        "agent_runs",
    ):
        op.drop_table(table)
