"""Diagnostic service.

Wraps the GTM Diagnostic Agent for the API/CLI surface. When no Anthropic
API key is set we fall back to a deterministic heuristic so the demo
runs end-to-end without any external dependency.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.agents.runner import AgentRunner
from app.core.logging import get_logger
from app.core.settings import get_settings
from app.db.models import AgentRun, Company
from app.schemas.gtm import CompanyAnalyzeRequest, CompanyConfirmRequest, GtmDiagnostic
from app.tools.registry import get_global_registry

logger = get_logger(__name__)


class CompanyNotFound(Exception):
    pass


class CompanyNotConfirmed(Exception):
    pass


def _heuristic_diagnostic(payload: CompanyAnalyzeRequest) -> GtmDiagnostic:
    text = payload.raw_input.strip()
    first_line = text.splitlines()[0] if text else ""
    candidate = first_line[:60].strip(" .:#-") or "Acme"
    name_match = re.search(r"^[#\s]*([A-Z][\w\-]+)", first_line)
    company_name = name_match.group(1) if name_match else candidate.split()[0].title()
    short = company_name.lower().replace(" ", "")
    suggested = [f"{short}.com", f"try{short}.com", f"{short}-outbound.com", f"{short}.io"]
    text_lower = text.lower()
    target_count = 50 if "small" in text_lower or "boutique" in text_lower else 60
    if "enterprise" in text_lower or "fortune" in text_lower:
        target_count = 25
    size = "unknown"
    if any(k in text_lower for k in ["solo", "founder ", "myself"]):
        size = "solo"
    elif any(k in text_lower for k in ["small team", "two of us", "couple"]):
        size = "2-10"
    elif "team" in text_lower:
        size = "11-50"
    return GtmDiagnostic(
        company_name=company_name,
        business_context_summary=text[:600],
        icp_description="Inferred from input; refine in confirmation step.",
        campaign_target_company_count=target_count,
        internal_company_size_range=size,  # type: ignore[arg-type]
        suggested_domain_names=suggested,
        notes="Generated heuristically — Anthropic key absent or demo dry-run path.",
    )


def analyze_company(session: Session, payload: CompanyAnalyzeRequest, *, force_heuristic: bool = False) -> Company:
    """Run the GTM Diagnostic Agent on the user's input.

    Uses the Anthropic-backed agent whenever an API key is configured. The
    heuristic path only runs in local development with ``force_heuristic=True``
    or when no key is set; in production the missing key surfaces as an
    error rather than silently degrading the output.
    """
    settings = get_settings()
    diagnostic: GtmDiagnostic
    agent_run_id: str | None = None
    is_production = (settings.app_env or "").lower() not in ("local", "test")

    if force_heuristic and is_production:
        raise RuntimeError(
            "force_heuristic is not allowed in production (APP_ENV != local/test)"
        )
    use_anthropic = bool(settings.anthropic_api_key) and not force_heuristic
    if use_anthropic:
        from app.agents.gtm_diagnostic import build_agent

        runner = AgentRunner(get_global_registry())
        output = runner.run(
            build_agent(),
            user_input=payload.model_dump(mode="json"),
            session=session,
        )
        diagnostic = GtmDiagnostic.model_validate(output)
        agent_run_id = (
            session.query(AgentRun)
            .order_by(AgentRun.started_at.desc())
            .filter(AgentRun.agent_name == "gtm-diagnostic")
            .first()
            .id
        )
    else:
        if is_production:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is required in production for company analysis"
            )
        diagnostic = _heuristic_diagnostic(payload)

    company = Company(
        name=diagnostic.company_name,
        raw_input=payload.raw_input,
        business_context_summary=diagnostic.business_context_summary,
        icp_description=diagnostic.icp_description,
        internal_company_size_range=diagnostic.internal_company_size_range,
        target_company_count=diagnostic.campaign_target_company_count,
        suggested_domain_names=diagnostic.suggested_domain_names,
        source_files_metadata=[f.model_dump() for f in payload.files] or None,
        confirmation_status="pending_user_confirmation",
        agent_run_id=agent_run_id,
    )
    session.add(company)
    session.flush()
    return company


def confirm_company(session: Session, company_id: str, payload: CompanyConfirmRequest) -> Company:
    company = session.get(Company, company_id)
    if company is None:
        raise CompanyNotFound(company_id)
    if payload.company_name:
        company.name = payload.company_name
    if payload.icp_description is not None:
        company.icp_description = payload.icp_description
    if payload.campaign_target_company_count is not None:
        company.target_company_count = payload.campaign_target_company_count
    if payload.internal_company_size_range is not None:
        company.internal_company_size_range = payload.internal_company_size_range
    if payload.suggested_domain_names is not None:
        company.suggested_domain_names = payload.suggested_domain_names
    company.confirmation_status = "confirmed"
    session.flush()
    return company


def get_company_or_404(session: Session, company_id: str) -> Company:
    company = session.get(Company, company_id)
    if company is None:
        raise CompanyNotFound(company_id)
    return company


def require_confirmed(company: Company) -> None:
    if company.confirmation_status != "confirmed":
        raise CompanyNotConfirmed(company.id)
