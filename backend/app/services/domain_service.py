"""Domain plan + purchase orchestration."""
from __future__ import annotations

import hashlib
import re

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.porkbun import PorkbunClient, get_porkbun_client
from app.core.safety import Decision, SideEffectLevel, evaluate
from app.core.settings import get_settings
from app.db.models import Company, DomainCandidate, PurchasedDomain
from app.schemas.domains import DomainPlan, DomainPurchaseResult, PurchasedDomainOut
from app.services.diagnostic_service import (
    CompanyNotConfirmed,
    get_company_or_404,
    require_confirmed,
)
from app.services.dry_run_fixtures import porkbun_check_availability, porkbun_register

_DOMAIN_RE = re.compile(r"^[a-z0-9](?:[a-z0-9\-]{0,60}[a-z0-9])?\.[a-z]{2,12}$")


def _idempotency_key(company_id: str, domain: str) -> str:
    raw = f"{company_id}:{domain}:register".encode()
    return hashlib.sha256(raw).hexdigest()


def _candidates_for(company: Company) -> list[str]:
    base = (company.suggested_domain_names or [])[:]
    if company.name:
        slug = re.sub(r"[^a-z0-9]+", "", company.name.lower())[:24] or "company"
        # Mix budget-friendly TLDs (≤ USD 4) with the typical .com/.io.
        base += [
            f"{slug}.xyz",
            f"try{slug}.xyz",
            f"{slug}.shop",
            f"go{slug}.shop",
            f"{slug}.site",
            f"{slug}-outbound.site",
            f"{slug}.online",
            f"{slug}.com",
            f"try{slug}.com",
            f"{slug}.io",
        ]
    out: list[str] = []
    seen: set[str] = set()
    for cand in base:
        cand = cand.strip().lower()
        if cand and cand not in seen and _DOMAIN_RE.match(cand):
            seen.add(cand)
            out.append(cand)
    return out


def plan_domains(session: Session, company_id: str) -> DomainPlan:
    company = get_company_or_404(session, company_id)
    require_confirmed(company)
    settings = get_settings()
    raw_required = max(1, (company.target_company_count + 24) // 25)
    capped = min(raw_required, settings.domain_purchase_max_count, settings.HARD_DOMAIN_COUNT_CEILING)
    fixed = (settings.demo_fixed_domain or "").strip().lower()
    if fixed:
        return DomainPlan(
            company_id=company.id,
            target_company_count=company.target_company_count,
            required_domains=1,
            capped_domains=1,
            suggested_candidates=[fixed],
        )
    return DomainPlan(
        company_id=company.id,
        target_company_count=company.target_company_count,
        required_domains=raw_required,
        capped_domains=capped,
        suggested_candidates=_candidates_for(company),
    )


def purchase_domains(
    session: Session,
    company_id: str,
    *,
    execute: bool,
    candidates: list[str] | None = None,
    porkbun: PorkbunClient | None = None,
) -> DomainPurchaseResult:
    company = get_company_or_404(session, company_id)
    require_confirmed(company)
    settings = get_settings()

    # Demo override: skip Porkbun entirely and seed the fixed demo domain.
    fixed = (settings.demo_fixed_domain or "").strip().lower()
    if fixed:
        from app.services.seed_real_domains import seed_domains

        seeded = seed_domains(session, company.id, [fixed])
        record_audit(
            session,
            actor="domain-purchase",
            tool_name="purchase_domains",
            decision="demo_fixed_domain",
            side_effect_level=SideEffectLevel.PURCHASE,
            request={"company_id": company_id, "execute": execute},
            response={"reason": "demo_fixed_domain set", "domain": fixed},
        )
        return DomainPurchaseResult(
            company_id=company.id,
            dry_run=True,
            purchased=[PurchasedDomainOut.model_validate(d) for d in seeded],
            rejected=[],
            audit_decision="demo_fixed_domain",
        )

    plan = plan_domains(session, company_id)

    # If the company already has domains marked purchased/external (e.g. seeded
    # because the user bought them outside the system), skip the purchase flow
    # and return them as-is.
    pre_existing = (
        session.query(PurchasedDomain)
        .filter(PurchasedDomain.company_id == company.id)
        .filter(
            PurchasedDomain.status.in_(
                [
                    "purchased",
                    "purchase_pending",
                    "dns_pending",
                    "dns_verified",
                    "active_for_demo",
                    "active",
                ]
            )
        )
        .all()
    )
    if len(pre_existing) >= plan.capped_domains:
        record_audit(
            session,
            actor="domain-purchase",
            tool_name="purchase_domains",
            decision="idempotent_skip",
            side_effect_level=SideEffectLevel.PURCHASE,
            request={"company_id": company_id, "execute": execute},
            response={
                "reason": "domains already present (seeded or previously purchased)",
                "domains": [d.domain for d in pre_existing],
            },
        )
        return DomainPurchaseResult(
            company_id=company.id,
            dry_run=True,
            purchased=[PurchasedDomainOut.model_validate(d) for d in pre_existing[: plan.capped_domains]],
            rejected=[],
            audit_decision="idempotent_skip",
        )

    pool = candidates or plan.suggested_candidates
    pool = [d for d in pool if _DOMAIN_RE.match(d)]

    evaluation = evaluate(SideEffectLevel.PURCHASE, execute=execute, settings=settings)
    record_audit(
        session,
        actor="domain-purchase",
        tool_name="purchase_domains",
        decision=evaluation.decision.value,
        flag=evaluation.flag,
        side_effect_level=SideEffectLevel.PURCHASE,
        request={"company_id": company_id, "candidates": pool, "execute": execute},
        response={"reason": evaluation.reason},
    )

    purchased: list[PurchasedDomain] = []
    rejected: list[dict] = []
    porkbun = porkbun or get_porkbun_client() if evaluation.decision == Decision.ALLOWED else None
    quota = plan.capped_domains

    for cand in pool:
        if len(purchased) >= quota:
            break
        if evaluation.decision == Decision.ALLOWED:
            availability = porkbun.check_domain_availability(cand).body  # type: ignore[union-attr]
        else:
            availability = porkbun_check_availability(cand)
        available = bool(availability.get("available"))
        try:
            price = float(availability.get("price", "9999"))
        except ValueError:
            price = 9999.0
        premium = bool(availability.get("premium"))
        candidate_row = DomainCandidate(
            company_id=company.id,
            candidate=cand,
            available=available,
            price_usd=price,
            premium=premium,
            selection_status="evaluated",
            raw_response=availability,
        )
        session.add(candidate_row)

        if not available:
            candidate_row.selection_status = "rejected_unavailable"
            rejected.append({"domain": cand, "reason": "unavailable"})
            continue
        if premium:
            candidate_row.selection_status = "rejected_premium"
            rejected.append({"domain": cand, "reason": "premium"})
            continue
        if price > settings.domain_purchase_max_price_usd:
            candidate_row.selection_status = "rejected_price"
            rejected.append({"domain": cand, "reason": "price", "price_usd": price})
            continue

        idem = _idempotency_key(company.id, cand)
        existing = session.query(PurchasedDomain).filter_by(idempotency_key=idem).one_or_none()
        if existing and existing.status in ("purchased", "purchase_pending"):
            purchased.append(existing)
            candidate_row.selection_status = "idempotent_skip"
            continue

        if evaluation.decision == Decision.ALLOWED:
            try:
                resp = porkbun.register_domain(cand).body  # type: ignore[union-attr]
                if resp.get("status") != "SUCCESS":
                    raise RuntimeError(resp.get("message") or "register failed")
                pd = PurchasedDomain(
                    company_id=company.id,
                    domain=cand,
                    status="purchased",
                    price_usd=price,
                    cost_cents=int(price * 100),
                    porkbun_order_id=str(resp.get("id") or ""),
                    porkbun_response_json=resp,
                    idempotency_key=idem,
                    warmup_email=f"{settings.default_from_local_part}@{cand}",
                )
            except Exception as exc:
                pd = PurchasedDomain(
                    company_id=company.id,
                    domain=cand,
                    status="failed",
                    price_usd=price,
                    idempotency_key=idem,
                    error_message=str(exc),
                )
                session.add(pd)
                session.flush()
                rejected.append({"domain": cand, "reason": "register_failed", "error": str(exc)})
                candidate_row.selection_status = "register_failed"
                continue
        else:
            resp = porkbun_register(cand)
            pd = PurchasedDomain(
                company_id=company.id,
                domain=cand,
                status="dry_run_planned",
                price_usd=price,
                cost_cents=int(price * 100),
                porkbun_order_id=str(resp.get("id") or ""),
                porkbun_response_json=resp,
                idempotency_key=idem,
                warmup_email=f"{settings.default_from_local_part}@{cand}",
            )
        session.add(pd)
        session.flush()
        purchased.append(pd)
        candidate_row.selection_status = "selected"

    session.flush()
    return DomainPurchaseResult(
        company_id=company.id,
        dry_run=evaluation.decision != Decision.ALLOWED,
        purchased=[PurchasedDomainOut.model_validate(p) for p in purchased],
        rejected=rejected,
        audit_decision=evaluation.decision.value,
    )


__all__ = ["CompanyNotConfirmed", "plan_domains", "purchase_domains"]
