"""Schemas for research, drafts and sending."""
from __future__ import annotations

from pydantic import BaseModel, Field


class TargetCompanyIn(BaseModel):
    name: str
    domain: str | None = None
    industry: str | None = None
    size_range: str | None = None
    location: str | None = None


class TargetCompanyOut(TargetCompanyIn):
    id: str
    score: float | None = None
    score_rationale: str | None = None
    selection_status: str
    evidence_url: str | None = None

    model_config = {"from_attributes": True}


class ContactOut(BaseModel):
    id: str
    full_name: str | None
    title: str | None
    email: str | None
    validation_status: str
    linkedin_url: str | None = None
    target_company_id: str | None = None

    model_config = {"from_attributes": True}


class CampaignResearchRequest(BaseModel):
    csv_path: str | None = None
    limit: int | None = Field(default=None, ge=1, le=500)


class CampaignResearchResult(BaseModel):
    campaign_id: str
    targets: list[TargetCompanyOut]
    contacts: list[ContactOut]


class EmailDraftOut(BaseModel):
    id: str
    contact_id: str
    target_company_id: str
    from_email: str | None
    subject: str
    body_text: str
    status: str
    personalization_notes: str | None = None

    model_config = {"from_attributes": True}


class CampaignApproveRequest(BaseModel):
    draft_ids: list[str] = Field(default_factory=list)
    approve_all: bool = False


class CampaignSendRequest(BaseModel):
    execute: bool = False


class EmailSendOut(BaseModel):
    id: str
    draft_id: str
    status: str
    mailgun_message_id: str | None = None
    error_message: str | None = None

    model_config = {"from_attributes": True}


class CampaignSendResult(BaseModel):
    campaign_id: str
    dry_run: bool
    sends: list[EmailSendOut]


class CampaignOut(BaseModel):
    id: str
    name: str
    status: str
    total_drafts: int
    total_approved: int
    total_sent: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_replied: int
    total_failed: int
    total_complained: int
    total_unsubscribed: int

    model_config = {"from_attributes": True}
