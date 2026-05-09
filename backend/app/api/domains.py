"""Domain plan/purchase + DNS endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import Session, get_db
from app.db.models import PurchasedDomain
from app.schemas.domains import (
    DnsConfigureRequest,
    DnsConfigureResult,
    DnsVerifyResult,
    DomainPlan,
    DomainPurchaseRequest,
    DomainPurchaseResult,
    PurchasedDomainOut,
)
from app.services.diagnostic_service import CompanyNotConfirmed, CompanyNotFound
from app.services.dns_service import DomainNotFound, configure_dns, verify_dns
from app.services.domain_service import plan_domains, purchase_domains

companies_router = APIRouter(prefix="/companies", tags=["domains"])
domains_router = APIRouter(prefix="/domains", tags=["dns"])


@companies_router.post("/{company_id}/domains/plan", response_model=DomainPlan)
def plan(company_id: str, db: Session = Depends(get_db)) -> DomainPlan:
    try:
        return plan_domains(db, company_id)
    except CompanyNotFound:
        raise HTTPException(404, "company not found")
    except CompanyNotConfirmed:
        raise HTTPException(409, {"code": "company_not_confirmed"})


@companies_router.post("/{company_id}/domains/purchase", response_model=DomainPurchaseResult)
def purchase(
    company_id: str,
    payload: DomainPurchaseRequest = DomainPurchaseRequest(),
    db: Session = Depends(get_db),
) -> DomainPurchaseResult:
    try:
        return purchase_domains(db, company_id, execute=payload.execute, candidates=payload.candidates)
    except CompanyNotFound:
        raise HTTPException(404, "company not found")
    except CompanyNotConfirmed:
        raise HTTPException(409, {"code": "company_not_confirmed"})


@companies_router.get("/{company_id}/domains", response_model=list[PurchasedDomainOut])
def list_domains(company_id: str, db: Session = Depends(get_db)) -> list[PurchasedDomainOut]:
    rows = db.query(PurchasedDomain).filter(PurchasedDomain.company_id == company_id).all()
    return [PurchasedDomainOut.model_validate(r) for r in rows]


@domains_router.post("/{domain_id}/dns/configure", response_model=DnsConfigureResult)
def configure(
    domain_id: str,
    payload: DnsConfigureRequest = DnsConfigureRequest(),
    db: Session = Depends(get_db),
) -> DnsConfigureResult:
    try:
        return configure_dns(db, domain_id, execute=payload.execute)
    except DomainNotFound:
        raise HTTPException(404, "domain not found")


@domains_router.post("/{domain_id}/dns/verify", response_model=DnsVerifyResult)
def verify(
    domain_id: str,
    payload: DnsConfigureRequest = DnsConfigureRequest(),
    db: Session = Depends(get_db),
) -> DnsVerifyResult:
    try:
        return verify_dns(db, domain_id, execute=payload.execute)
    except DomainNotFound:
        raise HTTPException(404, "domain not found")
