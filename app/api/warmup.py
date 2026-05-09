"""Warmup endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import Session, get_db
from app.schemas.warmup import WarmupRunRequest, WarmupRunResult, WarmupStatusOut
from app.services.warmup_service import NoWarmupPairs, domain_status, run_warmup

router = APIRouter(prefix="/warmup", tags=["warmup"])


@router.post("/run", response_model=WarmupRunResult)
def run(payload: WarmupRunRequest, company_id: str, db: Session = Depends(get_db)) -> WarmupRunResult:
    try:
        return run_warmup(db, company_id, execute=payload.execute, accelerated=payload.accelerated)
    except NoWarmupPairs:
        raise HTTPException(409, {"code": "no_warmup_pairs"})


@router.get("/status/{domain_id}", response_model=WarmupStatusOut)
def status(domain_id: str, db: Session = Depends(get_db)) -> WarmupStatusOut:
    try:
        return domain_status(db, domain_id)
    except ValueError:
        raise HTTPException(404, "domain not found")
