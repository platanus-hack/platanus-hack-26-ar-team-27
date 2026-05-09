"""Campaign endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import Session, get_db
from app.schemas.research import (
    CampaignApproveRequest,
    CampaignOut,
    CampaignResearchRequest,
    CampaignResearchResult,
    CampaignSendRequest,
    CampaignSendResult,
    EmailDraftOut,
)
from app.services.campaign_service import (
    CampaignNotFound,
    approve_drafts,
    generate_drafts,
    get_campaign,
    research_targets,
    send_campaign,
)
from app.services.diagnostic_service import CompanyNotConfirmed, CompanyNotFound

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("/{company_id}/research", response_model=CampaignResearchResult)
def research(
    company_id: str,
    payload: CampaignResearchRequest = CampaignResearchRequest(),
    db: Session = Depends(get_db),
) -> CampaignResearchResult:
    try:
        return research_targets(db, company_id, csv_path=payload.csv_path, limit=payload.limit or 5)
    except CompanyNotFound:
        raise HTTPException(404, "company not found")
    except CompanyNotConfirmed:
        raise HTTPException(409, {"code": "company_not_confirmed"})


@router.post("/{campaign_id}/drafts", response_model=list[EmailDraftOut])
def drafts(campaign_id: str, db: Session = Depends(get_db)) -> list[EmailDraftOut]:
    try:
        return generate_drafts(db, campaign_id)
    except CampaignNotFound:
        raise HTTPException(404, "campaign not found")


@router.post("/{campaign_id}/approve")
def approve(campaign_id: str, payload: CampaignApproveRequest, db: Session = Depends(get_db)) -> dict:
    try:
        n = approve_drafts(db, campaign_id, draft_ids=payload.draft_ids, approve_all=payload.approve_all)
    except CampaignNotFound:
        raise HTTPException(404, "campaign not found")
    return {"approved": n}


@router.post("/{campaign_id}/send", response_model=CampaignSendResult)
def send(campaign_id: str, payload: CampaignSendRequest, db: Session = Depends(get_db)) -> CampaignSendResult:
    try:
        return send_campaign(db, campaign_id, execute=payload.execute)
    except CampaignNotFound:
        raise HTTPException(404, "campaign not found")


@router.get("/{campaign_id}", response_model=CampaignOut)
def get(campaign_id: str, db: Session = Depends(get_db)) -> CampaignOut:
    try:
        return get_campaign(db, campaign_id)
    except CampaignNotFound:
        raise HTTPException(404, "campaign not found")
