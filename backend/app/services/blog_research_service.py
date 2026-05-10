"""Editorial research helpers for blog generation.

The blog flow needs a compact, reusable market brief: enough context to
ground the HTML generator in the company's vertical without turning this
into the full prospecting pipeline. This module therefore does two small
things:

1. Infer an "industry/topic brief" from the company's stored diagnostic.
2. Optionally enrich that brief with live web research via Anthropic's
   server-side ``web_search`` and ``web_fetch`` tools.
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from typing import Any, Protocol

from app.core.logging import get_logger
from app.core.settings import Settings, get_settings
from app.db.models import Company

logger = get_logger(__name__)


_WS_RE = re.compile(r"\s+")
_PARENS_RE = re.compile(r"\([^)]*\)")


@dataclass
class BlogIndustryBrief:
    company_name: str
    industry_label: str
    offer_summary: str
    audience_summary: str
    geography_summary: str
    gtm_summary: str | None
    diagnostic_context: str

    def as_prompt_payload(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BlogEditorialResearch:
    generation_mode: str
    industry_label: str
    editorial_angles: list[str]
    pain_points: list[str]
    market_language: list[str]
    evidence_urls: list[str]
    fallback_reason: str | None = None

    def as_prompt_payload(self) -> dict[str, Any]:
        return {
            "generation_mode": self.generation_mode,
            "industry_label": self.industry_label,
            "editorial_angles": list(self.editorial_angles),
            "pain_points": list(self.pain_points),
            "market_language": list(self.market_language),
            "evidence_urls": list(self.evidence_urls),
            "fallback_reason": self.fallback_reason,
        }

    @classmethod
    def internal_fallback(
        cls,
        *,
        brief: BlogIndustryBrief,
        reason: str | None = None,
    ) -> "BlogEditorialResearch":
        industry = brief.industry_label or "the company's market"
        audience = brief.audience_summary or "their buying committee"
        offer = brief.offer_summary or "the company's offer"
        geography = brief.geography_summary or "their priority markets"
        return cls(
            generation_mode="internal_fallback",
            industry_label=industry,
            editorial_angles=[
                f"What buyers in {industry} need before they commit",
                f"How {audience} evaluate operational trade-offs",
                f"Why teams in {geography} expect clearer thinking from vendors",
            ],
            pain_points=[
                f"Turning {industry.lower()} priorities into repeatable execution",
                f"Explaining the ROI of {offer.lower()} to multiple stakeholders",
                "Reducing adoption risk without slowing down commercial momentum",
            ],
            market_language=[
                industry,
                offer,
                audience,
            ],
            evidence_urls=[],
            fallback_reason=reason,
        )


class BlogEditorialResearcher(Protocol):
    def research(self, *, brief: BlogIndustryBrief) -> BlogEditorialResearch: ...


_RESEARCH_SYSTEM_PROMPT = """\
Sos un research editor B2B con acceso a búsqueda web en vivo.

Tu trabajo: devolver un brief editorial corto, usable y evergreen sobre
el vertical de la empresa del usuario.

Reglas duras:
- Empezá por el brief interno para entender qué vende la empresa y a qué buyer le habla.
- Usá `web_search` para encontrar fuentes públicas confiables del vertical.
- Usá `web_fetch` para verificar pains recurrentes, casos de uso, lenguaje del mercado y ángulos editoriales.
- Devolvé señales evergreen: problemas repetidos, buyer friction, vocabulario del mercado, ideas de thought leadership.
- No incluyas noticias efímeras, anuncios puntuales, eventos, quarters ni referencias temporales.
- `evidence_urls` DEBE incluir las URLs públicas concretas que respaldan el brief.
- Si una idea no se puede groundear con la búsqueda, no la incluyas.
- Cada lista debe tener entre 3 y 5 items cortos y accionables.

Output: respondé con UN solo objeto JSON con esta forma:

{
  "industry_label": "Industrial automation software",
  "editorial_angles": [
    "How operators evaluate reliability without bloated implementation plans"
  ],
  "pain_points": [
    "Pressure to modernize operations without disrupting throughput"
  ],
  "market_language": [
    "uptime",
    "workflow visibility",
    "operator adoption"
  ],
  "evidence_urls": [
    "https://example.com/industry-report"
  ]
}

Sin markdown, sin texto fuera del JSON.
"""


class AnthropicBlogResearchProvider:
    """Small, blog-specific web research provider."""

    name = "anthropic_blog_editorial"

    def __init__(
        self,
        settings: Settings | None = None,
        client: Any = None,
    ) -> None:
        self._settings = settings or get_settings()
        if not self._settings.anthropic_api_key:
            raise RuntimeError(
                "anthropic blog research requires ANTHROPIC_API_KEY"
            )
        if client is not None:
            self._client = client
        else:
            try:
                import anthropic
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError("anthropic package is not installed") from exc
            self._client = anthropic.Anthropic(
                api_key=self._settings.anthropic_api_key,
                timeout=180.0,
            )

    def research(self, *, brief: BlogIndustryBrief) -> BlogEditorialResearch:
        data = self._call_with_web_tools(
            user_payload={
                "company_name": brief.company_name,
                "industry_brief": brief.as_prompt_payload(),
                "task": (
                    "Investigá el vertical y devolvé un brief editorial breve para un blog "
                    "single-page. El contenido tiene que servir para escribir thought leadership "
                    "específico, no un resumen genérico del mercado."
                ),
            },
            max_search_uses=4,
            max_fetch_uses=6,
        )
        industry_label = _clean_fragment(
            data.get("industry_label") or brief.industry_label,
            max_words=10,
        ) or brief.industry_label
        editorial_angles = _clean_list(data.get("editorial_angles"), max_items=5)
        pain_points = _clean_list(data.get("pain_points"), max_items=5)
        market_language = _clean_list(data.get("market_language"), max_items=5)
        evidence_urls = _clean_urls(data.get("evidence_urls"), max_items=8)
        if not evidence_urls:
            raise RuntimeError("blog web research returned no evidence URLs")
        if not (editorial_angles or pain_points or market_language):
            raise RuntimeError("blog web research returned no usable editorial signals")
        return BlogEditorialResearch(
            generation_mode="web_research",
            industry_label=industry_label,
            editorial_angles=editorial_angles,
            pain_points=pain_points,
            market_language=market_language,
            evidence_urls=evidence_urls,
        )

    def _call_with_web_tools(
        self,
        *,
        user_payload: dict[str, Any],
        max_search_uses: int,
        max_fetch_uses: int,
    ) -> dict[str, Any]:
        tools: list[dict[str, Any]] = [
            {
                "type": "web_search_20250305",
                "name": "web_search",
                "max_uses": max_search_uses,
            },
            {
                "type": "web_fetch_20250910",
                "name": "web_fetch",
                "max_uses": max_fetch_uses,
                "max_content_tokens": 18000,
                "citations": {"enabled": True},
            },
        ]
        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            }
        ]
        max_resumes = 4
        for _ in range(max_resumes + 1):
            response = self._client.messages.create(
                model=self._settings.anthropic_model,
                max_tokens=4096,
                temperature=self._settings.anthropic_temperature,
                system=_RESEARCH_SYSTEM_PROMPT,
                messages=messages,
                tools=tools,
            )
            if getattr(response, "stop_reason", None) == "pause_turn":
                messages.append({"role": "assistant", "content": response.content})
                continue
            text = self._extract_text(response)
            try:
                return self._extract_json(text)
            except ValueError as exc:
                raise RuntimeError(
                    f"blog web research did not return valid JSON: {exc}"
                ) from exc
        raise RuntimeError("blog web research exceeded resume budget")

    @staticmethod
    def _extract_text(response: Any) -> str:
        parts: list[str] = []
        for block in getattr(response, "content", []) or []:
            if getattr(block, "type", None) == "text":
                parts.append(getattr(block, "text", "") or "")
        return "".join(parts).strip()

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any]:
        payload = (text or "").strip()
        if payload.startswith("```"):
            payload = payload.strip("`")
            if "\n" in payload:
                payload = payload.split("\n", 1)[1]
            if payload.endswith("```"):
                payload = payload[:-3]
        try:
            return json.loads(payload)
        except json.JSONDecodeError:
            start = payload.find("{")
            end = payload.rfind("}")
            if start >= 0 and end > start:
                return json.loads(payload[start : end + 1])
            raise ValueError(f"could not extract JSON from response: {text[:200]}")


def infer_industry_brief(company: Company) -> BlogIndustryBrief:
    summary = _compact(company.business_context_summary)
    gtm = _compact(company.gtm_strategy)
    icp = _compact(company.icp_description)
    countries = [
        _compact(str(country))
        for country in (company.target_countries or [])
        if _compact(str(country))
    ]

    offer_summary = _extract_offer_summary(summary, gtm, icp)
    audience_summary = _extract_audience_summary(icp, gtm)
    industry_label = _extract_industry_label(
        summary=summary,
        gtm=gtm,
        icp=icp,
        fallback=offer_summary,
        company_name=company.name,
    )
    geography_summary = ", ".join(countries) if countries else "their priority markets"

    context_parts = [
        part
        for part in [
            summary,
            icp,
            gtm,
            f"Target countries: {', '.join(countries)}" if countries else "",
        ]
        if part
    ]
    diagnostic_context = " ".join(context_parts) or company.name

    return BlogIndustryBrief(
        company_name=company.name,
        industry_label=industry_label,
        offer_summary=offer_summary,
        audience_summary=audience_summary,
        geography_summary=geography_summary,
        gtm_summary=gtm or None,
        diagnostic_context=diagnostic_context,
    )


def _compact(value: str | None) -> str:
    return _WS_RE.sub(" ", value or "").strip()


def _clean_fragment(value: str | None, *, max_words: int) -> str:
    text = _compact(_PARENS_RE.sub("", value or ""))
    text = text.strip(" -–—:;,.")
    if not text:
        return ""
    words = text.split()
    if len(words) > max_words:
        text = " ".join(words[:max_words]).strip(" -–—:;,.")
    return text


def _clean_list(values: Any, *, max_items: int) -> list[str]:
    if not isinstance(values, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in values:
        text = _clean_fragment(str(raw), max_words=14)
        key = text.lower()
        if not text or key in seen:
            continue
        cleaned.append(text)
        seen.add(key)
        if len(cleaned) >= max_items:
            break
    return cleaned


def _clean_urls(values: Any, *, max_items: int) -> list[str]:
    if not isinstance(values, list):
        return []
    urls: list[str] = []
    seen: set[str] = set()
    for raw in values:
        url = _compact(str(raw))
        if not url.startswith(("http://", "https://")) or url in seen:
            continue
        urls.append(url)
        seen.add(url)
        if len(urls) >= max_items:
            break
    return urls


def _extract_offer_summary(summary: str, gtm: str, icp: str) -> str:
    sources = [summary, gtm, icp]
    patterns = (
        r"(?i)\b(?:builds?|develops?|provides?|offers?|sells?|delivers?)\s+([^.;]+)",
        r"(?i)\b(?:helps?|supports?|enables?)\s+([^.;]+)",
        r"(?i)\b(?:focus(?:es|ed)? on|specializ(?:es|ed) in)\s+([^.;]+)",
    )
    for source in sources:
        for pattern in patterns:
            match = re.search(pattern, source)
            if match:
                fragment = _clean_fragment(match.group(1), max_words=14)
                if fragment:
                    return fragment
    fallback = _clean_fragment(summary or gtm or icp, max_words=14)
    return fallback or "the company's offer"


def _extract_audience_summary(icp: str, gtm: str) -> str:
    audience = _clean_fragment(icp, max_words=14)
    if audience:
        return audience
    patterns = (
        r"(?i)\b(?:targets?|serves?|sells? to)\s+([^.;]+)",
        r"(?i)\b(?:buyers?|decision makers?)\s*:\s*([^.;]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, gtm)
        if match:
            fragment = _clean_fragment(match.group(1), max_words=14)
            if fragment:
                return fragment
    return "their priority buyers"


def _extract_industry_label(
    *,
    summary: str,
    gtm: str,
    icp: str,
    fallback: str,
    company_name: str,
) -> str:
    sources = [summary, gtm, icp]
    patterns = (
        r"(?i)\b(?:for|in)\s+([^.;]+)",
        r"(?i)\b(?:vertical|industry|market)\s*:\s*([^.;]+)",
    )
    candidates: list[str] = []
    if fallback:
        candidates.append(fallback)
    for source in sources:
        for pattern in patterns:
            match = re.search(pattern, source)
            if match:
                candidates.append(match.group(1))
    for candidate in candidates:
        fragment = _clean_fragment(candidate, max_words=8)
        if fragment:
            return fragment
    return _clean_fragment(company_name, max_words=8) or "the company's market"


__all__ = [
    "AnthropicBlogResearchProvider",
    "BlogEditorialResearch",
    "BlogEditorialResearcher",
    "BlogIndustryBrief",
    "infer_industry_brief",
]
