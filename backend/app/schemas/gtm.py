"""Pydantic schemas for GTM diagnostic agent input/output and API surface."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

SizeRange = Literal["solo", "2-10", "11-50", "51-200", "201+", "unknown"]


class SourceFile(BaseModel):
    name: str
    content_type: str | None = None
    size_bytes: int | None = None
    note: str | None = None


class CompanyAnalyzeRequest(BaseModel):
    raw_input: str = Field(..., min_length=1)
    files: list[SourceFile] = Field(default_factory=list)


class GtmDiagnostic(BaseModel):
    company_name: str
    business_context_summary: str
    icp_description: str
    campaign_target_company_count: int = Field(..., ge=0)
    internal_company_size_range: SizeRange = "unknown"
    suggested_domain_names: list[str] = Field(default_factory=list)
    notes: str | None = None

    @field_validator("suggested_domain_names")
    @classmethod
    def _normalize_domains(cls, v: list[str]) -> list[str]:
        seen: list[str] = []
        for d in v:
            d2 = d.strip().lower()
            if d2 and d2 not in seen:
                seen.append(d2)
        return seen


class CompanyConfirmRequest(BaseModel):
    company_name: str | None = None
    icp_description: str | None = None
    campaign_target_company_count: int | None = Field(default=None, ge=0)
    internal_company_size_range: SizeRange | None = None
    suggested_domain_names: list[str] | None = None


class CompanyOut(BaseModel):
    id: str
    name: str
    business_context_summary: str | None
    icp_description: str | None
    internal_company_size_range: str | None
    target_company_count: int
    suggested_domain_names: list[str] | None = None
    confirmation_status: str
    agent_run_id: str | None = None

    model_config = {"from_attributes": True}
