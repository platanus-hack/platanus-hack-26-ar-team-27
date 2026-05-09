"""ResearchProvider strategy + concrete implementations.

A ``ResearchProvider`` finds **prospects** for the seller (the company
running our system). Given the seller's context (what they sell, ICP),
the provider returns a list of real prospect accounts and, optionally,
contacts inside those accounts.

The deployed backend defaults to ``AnthropicWebResearchProvider``: the
research is grounded in real-time `web_search` + `web_fetch`. The
``mock`` and ``csv`` providers exist for local development and tests.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from app.core.settings import get_settings


@dataclass
class SellerContext:
    """Information the research provider needs about the user's company.

    Built from the confirmed ``Company`` row.
    """

    name: str
    business_context_summary: str
    icp_description: str | None
    target_company_count: int
    internal_company_size_range: str | None = None


@dataclass
class TargetAccount:
    name: str
    domain: str | None
    industry: str | None
    size_range: str | None
    location: str | None
    raw: dict
    score: float | None = None
    score_rationale: str | None = None
    evidence_url: str | None = None


@dataclass
class ContactDraft:
    full_name: str | None
    title: str | None
    email: str | None
    linkedin_url: str | None
    raw: dict


class ResearchProvider(Protocol):
    name: str

    def find_target_companies(
        self, *, seller: SellerContext, limit: int
    ) -> list[TargetAccount]: ...

    def find_contacts(
        self, account: TargetAccount, *, seller: SellerContext, limit: int = 1
    ) -> list[ContactDraft]: ...


# ---------------------------------------------------------------------------
# Mock + CSV (development / tests only)
# ---------------------------------------------------------------------------


class MockResearchProvider:
    """Deterministic provider for unit tests. Never used in production."""

    name = "mock"

    _ACCOUNTS = [
        ("Northwind Logistics", "northwindlogistics.example", "Logistics", "51-200", "Buenos Aires"),
        ("Helio Robotics", "heliorobotics.example", "Robotics", "11-50", "São Paulo"),
        ("Cobalt Health", "cobalthealth.example", "Healthcare", "201+", "Mexico City"),
        ("Kintsugi Studio", "kintsugi.example", "Design", "2-10", "Bogotá"),
        ("Lumen Foods", "lumenfoods.example", "FoodTech", "51-200", "Santiago"),
    ]

    _CONTACTS = [
        ("Carolina Pereyra", "Head of Operations", "carolina.pereyra"),
        ("Mateo Suárez", "VP Engineering", "mateo.suarez"),
        ("Aisha Patel", "Director of Growth", "aisha.patel"),
    ]

    def find_target_companies(
        self, *, seller: SellerContext, limit: int
    ) -> list[TargetAccount]:
        out: list[TargetAccount] = []
        for i, (name, domain, industry, size, location) in enumerate(self._ACCOUNTS[:limit]):
            out.append(
                TargetAccount(
                    name=name,
                    domain=domain,
                    industry=industry,
                    size_range=size,
                    location=location,
                    raw={"source": "mock", "index": i, "seller": seller.name},
                )
            )
        return out

    def find_contacts(
        self, account: TargetAccount, *, seller: SellerContext, limit: int = 1
    ) -> list[ContactDraft]:
        out: list[ContactDraft] = []
        for full_name, title, local in self._CONTACTS[:limit]:
            email = f"{local}@{account.domain}" if account.domain else None
            out.append(
                ContactDraft(
                    full_name=full_name,
                    title=title,
                    email=email,
                    linkedin_url=None,
                    raw={"source": "mock", "company": account.name},
                )
            )
        return out


class CSVResearchProvider:
    name = "csv"

    def __init__(self, path: str):
        self._path = Path(path)
        if not self._path.exists():
            raise FileNotFoundError(self._path)

    def find_target_companies(
        self, *, seller: SellerContext, limit: int
    ) -> list[TargetAccount]:
        out: list[TargetAccount] = []
        with self._path.open() as fh:
            reader = csv.DictReader(fh)
            for i, row in enumerate(reader):
                if i >= limit:
                    break
                out.append(
                    TargetAccount(
                        name=row.get("name") or "Unknown",
                        domain=row.get("domain") or None,
                        industry=row.get("industry") or None,
                        size_range=row.get("size_range") or None,
                        location=row.get("location") or None,
                        raw=dict(row),
                    )
                )
        return out

    def find_contacts(
        self, account: TargetAccount, *, seller: SellerContext, limit: int = 1
    ) -> list[ContactDraft]:
        if account.raw.get("contact_email"):
            return [
                ContactDraft(
                    full_name=account.raw.get("contact_name") or None,
                    title=account.raw.get("contact_title") or None,
                    email=account.raw.get("contact_email"),
                    linkedin_url=account.raw.get("linkedin_url") or None,
                    raw=account.raw,
                )
            ][:limit]
        return []


class StubExternalProvider:
    """Placeholder for SerpAPI/Tavily/Apollo/PDL — wires up only if a key is set."""

    def __init__(self, name: str, key: str | None):
        self.name = name
        self._key = key

    def find_target_companies(
        self, *, seller: SellerContext, limit: int
    ) -> list[TargetAccount]:
        if not self._key:
            raise RuntimeError(f"{self.name} requested but no API key is configured")
        raise NotImplementedError(f"{self.name} integration is intentionally stubbed for the MVP")

    def find_contacts(
        self, account: TargetAccount, *, seller: SellerContext, limit: int = 1
    ) -> list[ContactDraft]:
        return self.find_target_companies(seller=seller, limit=0)  # raises


def get_provider(*, csv_path: str | None = None) -> ResearchProvider:
    settings = get_settings()
    name = (settings.research_provider or "anthropic_web").lower()
    if name == "mock":
        return MockResearchProvider()
    if name == "csv":
        if not csv_path:
            raise ValueError("csv provider requires --csv-path")
        return CSVResearchProvider(csv_path)
    if name == "anthropic_web":
        # Imported here to avoid circular imports; the provider depends on settings
        from app.services.research.anthropic_web import AnthropicWebResearchProvider

        return AnthropicWebResearchProvider(settings=settings)
    if name == "serpapi":
        return StubExternalProvider("serpapi", settings.serpapi_api_key)
    if name == "tavily":
        return StubExternalProvider("tavily", settings.tavily_api_key)
    if name == "apollo":
        return StubExternalProvider("apollo", settings.apollo_api_key)
    if name == "peopledatalabs":
        return StubExternalProvider("peopledatalabs", settings.peopledatalabs_api_key)
    raise ValueError(f"unknown RESEARCH_PROVIDER: {name}")
