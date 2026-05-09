"""Company endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import Session, get_db
from app.schemas.gtm import (
    CompanyAnalyzeRequest,
    CompanyConfirmRequest,
    CompanyOut,
)
from app.services.diagnostic_service import (
    CompanyNotFound,
    analyze_company,
    confirm_company,
    get_company_or_404,
)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("/analyze", response_model=CompanyOut)
def analyze(payload: CompanyAnalyzeRequest, db: Session = Depends(get_db)) -> CompanyOut:
    company = analyze_company(db, payload)
    return CompanyOut.model_validate(company)


@router.post("/{company_id}/confirm", response_model=CompanyOut)
def confirm(company_id: str, payload: CompanyConfirmRequest, db: Session = Depends(get_db)) -> CompanyOut:
    try:
        company = confirm_company(db, company_id, payload)
    except CompanyNotFound:
        raise HTTPException(status_code=404, detail="company not found")
    return CompanyOut.model_validate(company)


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(company_id: str, db: Session = Depends(get_db)) -> CompanyOut:
    try:
        company = get_company_or_404(db, company_id)
    except CompanyNotFound:
        raise HTTPException(status_code=404, detail="company not found")
    return CompanyOut.model_validate(company)
