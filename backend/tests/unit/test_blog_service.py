from __future__ import annotations

import json
from types import SimpleNamespace

from app.clients.anthropic_client import AnthropicResponse, AnthropicResponseBlock
from app.db.models import Company, PurchasedDomain
from app.services.blog_research_service import (
    BlogEditorialResearch,
    infer_industry_brief,
)
from app.services.blog_service import (
    _BLOG_SYSTEM,
    _contains_temporal_markers,
    _fallback_html,
    get_latest_publication,
    publish_blog,
)


class _StubHtmlClient:
    def __init__(self, responses: list[AnthropicResponse]):
        self._responses = list(responses)
        self.calls: list[dict] = []

    def messages_create(self, **kwargs):
        self.calls.append(kwargs)
        if not self._responses:
            raise AssertionError("no scripted responses left")
        return self._responses.pop(0)


class _StubResearcher:
    def __init__(
        self,
        *,
        result: BlogEditorialResearch | None = None,
        error: Exception | None = None,
    ):
        self.result = result
        self.error = error
        self.briefs = []

    def research(self, *, brief):
        self.briefs.append(brief)
        if self.error is not None:
            raise self.error
        assert self.result is not None
        return self.result


class _StubVercel:
    def __init__(self):
        self.deployments: list[dict] = []
        self.domains: list[tuple[str, str]] = []

    def create_deployment(self, *, project_name: str, files: list[dict], target: str = "production"):
        self.deployments.append(
            {"project_name": project_name, "files": files, "target": target}
        )
        return SimpleNamespace(
            body={
                "id": "dep_123",
                "url": "blog-preview.vercel.app",
            }
        )

    def add_project_domain(self, project: str, domain: str):
        self.domains.append((project, domain))
        return SimpleNamespace(body={"name": domain})


class _StubSpaceship:
    def __init__(self):
        self.saved: list[dict] = []

    def list_dns_records(self, domain: str):
        return SimpleNamespace(body={"items": [{"type": "TXT", "name": "@", "value": "demo"}]})

    def save_dns_records(self, domain: str, records: list[dict], force: bool = True):
        self.saved.append({"domain": domain, "records": records, "force": force})
        return SimpleNamespace(body={"ok": True})


def _seed_company(session) -> Company:
    company = Company(
        name="Helio Robotics",
        business_context_summary=(
            "Helio Robotics builds predictive-maintenance SaaS for industrial robots."
        ),
        gtm_strategy=(
            "Position the brand around uptime, implementation clarity and operational ROI."
        ),
        icp_description="Plant managers in mid-market manufacturing teams across LATAM",
        target_countries=["Mexico", "Chile"],
        confirmation_status="confirmed",
    )
    session.add(company)
    session.flush()
    session.add(
        PurchasedDomain(
            company_id=company.id,
            domain="helio.mx",
            status="active_for_demo",
            idempotency_key=f"pd-{company.id}",
        )
    )
    session.flush()
    return company


def _html_response(html: str) -> AnthropicResponse:
    return AnthropicResponse(
        content=[AnthropicResponseBlock(type="text", text=html)],
        stop_reason="end_turn",
    )


def _web_research_result() -> BlogEditorialResearch:
    return BlogEditorialResearch(
        generation_mode="web_research",
        industry_label="Industrial automation software",
        editorial_angles=[
            "How operators evaluate reliability without bloated implementation plans",
            "Where implementation friction quietly kills adoption",
        ],
        pain_points=[
            "Pressure to modernize operations without disrupting throughput",
            "Need to prove ROI to multiple stakeholders",
        ],
        market_language=["uptime", "workflow visibility", "operator adoption"],
        evidence_urls=[
            "https://example.com/report",
            "https://example.com/buyer-guide",
        ],
    )


def test_publish_blog_dry_run_uses_web_research_and_persists_generation_metadata(
    session,
    monkeypatch,
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    company = _seed_company(session)
    html = """<!doctype html>
    <html lang="es"><head><title>Perspectivas de Helio Robotics</title></head>
    <body>
      <header><h1>Perspectivas de Helio Robotics</h1><p>Notas editoriales atemporales.</p></header>
      <article><h2>La confiabilidad como lenguaje de compra</h2><div class="meta">Audiencia · Plant managers</div><p>Párrafo uno.</p><p>Párrafo dos.</p></article>
      <article><h2>La claridad de implementación como diferenciador</h2><div class="meta">Categoría · Industrial automation software</div><p>Párrafo uno.</p><p>Párrafo dos.</p></article>
      <article><h2>ROI operativo sin promesas infladas</h2><div class="meta">Enfoque · Operator adoption</div><p>Párrafo uno.</p><p>Párrafo dos.</p></article>
    </body></html>"""
    anthropic = _StubHtmlClient([_html_response(html)])
    researcher = _StubResearcher(result=_web_research_result())

    result = publish_blog(
        session,
        company.id,
        execute=False,
        anthropic=anthropic,
        editorial_research=researcher,
    )

    publication = get_latest_publication(session, company.id)
    assert result.status == "dry_run"
    assert publication is not None
    assert publication.status == "dry_run"
    assert not _contains_temporal_markers(publication.html_content or "")
    metadata = publication.raw_response["generation"]
    assert metadata["generation_mode"] == "web_research"
    assert metadata["industry_label"] == "Industrial automation software"
    assert metadata["evidence_urls"] == [
        "https://example.com/report",
        "https://example.com/buyer-guide",
    ]
    assert metadata["html_mode"] == "anthropic_html"
    prompt_payload = json.loads(anthropic.calls[0]["messages"][0]["content"])
    assert prompt_payload["editorial_research"]["industry_label"] == "Industrial automation software"
    assert "gtm_strategy" not in prompt_payload["company"]
    assert "gtm_summary" not in metadata["industry_brief"]
    assert "español" in _BLOG_SYSTEM.lower()
    assert "minimalismo editorial" in _BLOG_SYSTEM.lower()
    assert 'lang="es"' in _BLOG_SYSTEM
    assert "date" not in _BLOG_SYSTEM.lower()
    assert "author meta line" not in _BLOG_SYSTEM.lower()


def test_publish_blog_falls_back_to_internal_research_without_showing_temporal_markers(
    session,
    monkeypatch,
):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    company = _seed_company(session)
    html = """<!doctype html>
    <html lang="es"><head><title>Perspectivas de Helio Robotics</title></head>
    <body>
      <article><h2>Punto de vista atemporal</h2><div class="meta">Categoría · Industrial automation software</div><p>Párrafo uno.</p><p>Párrafo dos.</p></article>
    </body></html>"""
    anthropic = _StubHtmlClient([_html_response(html)])

    publish_blog(
        session,
        company.id,
        execute=False,
        anthropic=anthropic,
        editorial_research=_StubResearcher(error=RuntimeError("web search timeout")),
    )

    publication = get_latest_publication(session, company.id)
    assert publication is not None
    assert publication.status == "dry_run"
    assert not _contains_temporal_markers(publication.html_content or "")
    metadata = publication.raw_response["generation"]
    assert metadata["generation_mode"] == "internal_fallback"
    assert metadata["fallback_reason"] == "web search timeout"
    assert metadata["evidence_urls"] == []


def test_publish_blog_live_keeps_generation_metadata_and_deploys(session, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("ALLOW_BLOG_PUBLISH", "true")
    monkeypatch.setenv("VERCEL_TOKEN", "vercel-token")
    company = _seed_company(session)
    vercel = _StubVercel()
    spaceship = _StubSpaceship()

    result = publish_blog(
        session,
        company.id,
        execute=True,
        vercel=vercel,
        spaceship=spaceship,
    )

    publication = get_latest_publication(session, company.id)
    assert result.status == "live"
    assert publication is not None
    assert publication.status == "live"
    assert publication.custom_url == "https://blog.helio.mx"
    assert publication.vercel_deployment_url == "https://blog-preview.vercel.app"
    assert publication.raw_response["generation"]["generation_mode"] == "internal_fallback"
    assert publication.raw_response["deploy"]["id"] == "dep_123"
    assert vercel.domains == [("blog-helio-mx", "blog.helio.mx")]
    assert spaceship.saved


def test_fallback_html_is_publishable_and_evergreen():
    company = Company(
        name="Helio Robotics",
        business_context_summary="Predictive-maintenance ideas for industrial operators.",
        icp_description="Plant managers in mid-market manufacturing teams across LATAM",
        target_countries=["Mexico"],
    )
    research = _web_research_result()
    fallback = _fallback_html(
        company=company,
        brief=infer_industry_brief(company),
        research=research,
    )

    lower = fallback.html.lower()
    assert fallback.mode == "deterministic_fallback"
    assert '<html lang="es">' in lower
    assert "perspectivas de helio robotics" in lower
    assert "editorial-grid" in lower
    assert "editorial atemporal" in lower
    assert "iowan old style" in lower
    assert "draft · placeholder" not in lower
    assert "published on" not in lower
    assert "audience ·" not in lower
    assert "category ·" not in lower
    assert "angle ·" not in lower
    assert "how operators evaluate reliability" not in lower
    assert not _contains_temporal_markers(fallback.html)
