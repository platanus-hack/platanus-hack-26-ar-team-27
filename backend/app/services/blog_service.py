"""Blog publication service.

Pipeline:
  1. Pick a PurchasedDomain for the company (the email domain we'll alias).
  2. Infer a small industry brief from the stored diagnostic.
  3. Optionally enrich that brief with live web research.
  4. Generate a single-page HTML blog with Anthropic, themed for the company.
  5. Deploy the HTML to Vercel (REST API) — auto-creates the project.
  6. Attach `blog.<email_domain>` to the project.
  7. Add a CNAME record at the registrar (Spaceship) pointing the subdomain
     to Vercel's edge (`cname.vercel-dns.com`).
  8. Persist a BlogPublication row with the URLs.

Safety: the Vercel + Spaceship side effects are gated by
`Settings.allow_blog_publish`. When disabled (default), the service runs in
"dry_run" mode — it still calls Anthropic to generate HTML and persists the
row, but skips the network calls and returns a placeholder URL.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from html import escape

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.anthropic_client import AnthropicLike, get_anthropic_client
from app.clients.spaceship import SpaceshipClient, get_spaceship_client
from app.clients.vercel import VercelClient, VercelError, get_vercel_client
from app.core.logging import get_logger
from app.core.safety import Decision, SafetyEvaluation, SideEffectLevel
from app.core.settings import Settings, get_settings
from app.db.models import BlogPublication, Company, PurchasedDomain
from app.services.blog_research_service import (
    AnthropicBlogResearchProvider,
    BlogEditorialResearch,
    BlogEditorialResearcher,
    BlogIndustryBrief,
    infer_industry_brief,
)

logger = get_logger(__name__)


class BlogServiceError(RuntimeError):
    pass


class CompanyNotFound(BlogServiceError):
    pass


class NoDomainAvailable(BlogServiceError):
    pass


@dataclass
class BlogPublishResult:
    publication_id: str
    company_id: str
    custom_url: str | None
    vercel_deployment_url: str | None
    subdomain_host: str | None
    status: str
    dry_run: bool


@dataclass
class BlogHtmlResult:
    title: str
    html: str
    mode: str
    fallback_reason: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _slugify(value: str) -> str:
    s = (value or "").strip().lower()
    s = s.replace(" ", "-")
    s = _SLUG_RE.sub("-", s).strip("-")
    return s[:48] or "blog"


def _project_name_for(company: Company, domain: str) -> str:
    base = _slugify(domain.replace(".", "-"))
    return f"blog-{base}"[:50]


def _evaluate(execute: bool, settings: Settings) -> SafetyEvaluation:
    """Custom evaluation for the blog flow.

    The generic `evaluate(EXTERNAL_WRITE)` requires either ALLOW_COLD_EMAILS
    or ALLOW_DOMAIN_PURCHASES, which conflate this feature with email/domain
    flows. We gate on a dedicated `allow_blog_publish` flag instead.
    """
    if not execute:
        return SafetyEvaluation(
            Decision.DRY_RUN,
            None,
            "execute=false → simulating Vercel deploy",
        )
    if not settings.allow_blog_publish:
        return SafetyEvaluation(
            Decision.BLOCKED_BY_FLAG,
            "ALLOW_BLOG_PUBLISH",
            "real Vercel deploy requires ALLOW_BLOG_PUBLISH=true",
        )
    if not settings.vercel_token:
        return SafetyEvaluation(
            Decision.BLOCKED_BY_FLAG,
            "VERCEL_TOKEN",
            "VERCEL_TOKEN is empty",
        )
    return SafetyEvaluation(Decision.ALLOWED, "ALLOW_BLOG_PUBLISH", "blog publish allowed")


def _pick_purchased_domain(company: Company) -> PurchasedDomain:
    purchased = sorted(company.purchased_domains, key=lambda d: d.created_at)
    if not purchased:
        raise NoDomainAvailable(
            f"company {company.id} has no purchased_domains to alias"
        )
    return purchased[0]


# ---------------------------------------------------------------------------
# HTML generation
# ---------------------------------------------------------------------------


_FALLBACK_HTML_TEMPLATE = """<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<style>
  :root {{
    --bg:#f5f1e8;
    --bg-soft:#fbf8f2;
    --surface:rgba(255,255,255,0.68);
    --fg:#161514;
    --muted:#666157;
    --line:rgba(22,21,20,0.12);
    --accent:#b45d3d;
    --accent-soft:rgba(180,93,61,0.12);
    --shadow:0 20px 60px rgba(31,26,21,0.08);
  }}
  * {{ box-sizing:border-box; }}
  body {{
    margin:0;
    color:var(--fg);
    background:
      radial-gradient(circle at top left, rgba(180,93,61,0.12), transparent 34%),
      linear-gradient(180deg, var(--bg-soft) 0%, var(--bg) 100%);
    font-family:"Avenir Next","Helvetica Neue","Segoe UI",sans-serif;
  }}
  main.wrap {{
    max-width:1080px;
    margin:0 auto;
    padding:40px 20px 80px;
  }}
  .hero {{
    padding:24px 0 32px;
    margin-bottom:20px;
    border-top:1px solid var(--line);
  }}
  .eyebrow {{
    display:inline-flex;
    align-items:center;
    gap:10px;
    padding:8px 14px;
    border:1px solid var(--line);
    border-radius:999px;
    background:rgba(255,255,255,0.45);
    color:var(--muted);
    font-size:0.74rem;
    letter-spacing:0.16em;
    text-transform:uppercase;
  }}
  .eyebrow::before {{
    content:"";
    width:8px;
    height:8px;
    border-radius:999px;
    background:var(--accent);
    box-shadow:0 0 0 6px var(--accent-soft);
  }}
  header h1 {{
    max-width:8ch;
    margin:20px 0 12px;
    font-family:"Iowan Old Style","Palatino Linotype","Book Antiqua",serif;
    font-size:clamp(3rem,8vw,5.6rem);
    line-height:0.94;
    letter-spacing:-0.05em;
    text-wrap:balance;
  }}
  header p {{
    max-width:620px;
    margin:0;
    color:var(--muted);
    font-size:1.05rem;
    line-height:1.75;
  }}
  .editorial-grid {{
    display:grid;
    grid-template-columns:1fr;
    gap:18px;
  }}
  article {{
    position:relative;
    padding:28px;
    border:1px solid var(--line);
    border-radius:28px;
    background:var(--surface);
    backdrop-filter:blur(8px);
    box-shadow:var(--shadow);
    overflow:hidden;
  }}
  article::after {{
    content:"";
    position:absolute;
    inset:auto -18% -32% auto;
    width:220px;
    height:220px;
    border-radius:999px;
    background:var(--accent-soft);
    pointer-events:none;
  }}
  article h2 {{
    position:relative;
    margin:0 0 12px;
    font-family:"Iowan Old Style","Palatino Linotype","Book Antiqua",serif;
    font-size:clamp(1.7rem,3vw,2.45rem);
    line-height:1.02;
    letter-spacing:-0.03em;
    text-wrap:balance;
  }}
  article .meta {{
    position:relative;
    margin-bottom:18px;
    color:var(--muted);
    font-size:0.76rem;
    letter-spacing:0.14em;
    text-transform:uppercase;
  }}
  article p {{
    position:relative;
    margin:0 0 14px;
    max-width:60ch;
    line-height:1.82;
    font-size:1rem;
  }}
  article p:last-child {{ margin-bottom:0; }}
  footer {{
    margin-top:28px;
    padding-top:18px;
    border-top:1px solid var(--line);
    color:var(--muted);
    font-size:0.82rem;
    letter-spacing:0.06em;
    text-transform:uppercase;
  }}
  a {{ color:var(--accent); }}
</style>
</head>
<body><main class="wrap">
<header class="hero">
  <span class="eyebrow">Editorial atemporal</span>
  <h1>{title}</h1>
  <p>{subtitle}</p>
</header>
<section class="editorial-grid">
{posts_html}
</section>
<footer>© {company} · criterio editorial sin fecha.</footer>
</main></body></html>"""


_TEMPORAL_MARKERS = (
    re.compile(
        r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
        r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|"
        r"nov(?:ember)?|dec(?:ember)?|ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|"
        r"abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|"
        r"sep(?:tiembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b20\d{2}\b"),
    re.compile(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b"),
    re.compile(r"\bQ[1-4]\b", re.IGNORECASE),
    re.compile(r"\bPublished on\b", re.IGNORECASE),
    re.compile(r"\bPublicado el\b", re.IGNORECASE),
)
_SPANISH_HTML_RE = re.compile(r"<html[^>]*\blang=[\"']es(?:-[^\"']*)?[\"']", re.IGNORECASE)


def _fallback_html(
    *,
    company: Company,
    brief: BlogIndustryBrief,
    research: BlogEditorialResearch,
    reason: str | None = None,
) -> BlogHtmlResult:
    title = f"Perspectivas de {company.name}"
    subtitle = _evergreen_text(
        f"Notas editoriales para equipos que evalúan {research.industry_label}.",
        fallback="Notas editoriales de mercado sin referencias temporales.",
    )
    audience = _evergreen_text(
        brief.audience_summary,
        fallback="su comité comprador",
    )
    geography = _evergreen_text(
        brief.geography_summary,
        fallback="sus mercados prioritarios",
    )
    category = _evergreen_text(
        research.industry_label or brief.industry_label,
        fallback="su mercado",
    )
    primary_angle = f"Cómo compra {audience} en {category}"
    secondary_angle = f"Qué señales reducen fricción en {category}"
    market_language = _evergreen_text(
        ", ".join(research.market_language[:3]),
        fallback=f"{category}, {brief.offer_summary}, {audience}",
    )
    offer_summary = _evergreen_text(brief.offer_summary, fallback=company.name)

    posts_html = "\n".join(
        [
            (
                "<article>"
                f"<h2>{escape(primary_angle)}</h2>"
                f"<div class=\"meta\">Audiencia · {escape(audience)}</div>"
                f"<p>{escape(company.name)} compite en {escape(category)}, donde los equipos compradores suelen convivir con una tensión concreta: "
                f"alinear compra, implementación y adopción sin perder foco operativo. El contenido que genera confianza nombra ese problema con claridad y evita el discurso genérico.</p>"
                f"<p>Para lectores en {escape(geography)}, el lenguaje más útil es práctico y específico: "
                f"{escape(market_language)}. Ese es el territorio editorial que este blog debe ocupar.</p>"
                "</article>"
            ),
            (
                "<article>"
                f"<h2>{escape(secondary_angle)}</h2>"
                f"<div class=\"meta\">Categoría · {escape(category)}</div>"
                f"<p>{escape(company.name)} vende {escape(offer_summary)}. La historia relevante no es la lista de features, sino cómo esa oferta ayuda a atravesar compra, implementación y alineación interna con menos fricción.</p>"
                f"<p>Los compradores siguen buscando mejor alineación, menor riesgo de adopción y una historia de ROI más clara. Las mejores piezas editoriales traducen esos trade-offs a lenguaje simple y muestran que la empresa entiende el trabajo real que existe detrás de la compra.</p>"
                "</article>"
            ),
            (
                "<article>"
                f"<h2>{escape(company.name)} y una voz propia en {escape(category)}</h2>"
                f"<div class=\"meta\">Enfoque · {escape(category)}</div>"
                f"<p>Este sitio tiene que sonar como un equipo que conoce la categoría desde adentro. Eso implica escribir sobre calidad de decisión, riesgo operativo, adopción, velocidad de ejecución y los problemas que aparecen después de vender.</p>"
                f"<p>Una cadencia editorial sólida convierte esa mirada en confianza de mercado de largo plazo, en lugar de sumar otro blog corporativo indistinto.</p>"
                "</article>"
            ),
        ]
    )
    html = _FALLBACK_HTML_TEMPLATE.format(
        title=escape(title),
        subtitle=escape(subtitle),
        posts_html=posts_html,
        company=escape(company.name),
    )
    return BlogHtmlResult(
        title=title,
        html=html,
        mode="deterministic_fallback",
        fallback_reason=reason,
    )


_BLOG_SYSTEM = (
    "Sos un/a content designer senior y estratega editorial B2B. "
    "Debés producir un documento HTML completo (sin markdown ni comentarios) "
    "para un sitio de thought leadership de una pyme. "
    "El resultado DEBE ser un `<!doctype html>` válido, con CSS inline, sin "
    "assets externos y sin JavaScript. El documento debe usar `<html lang=\"es\">` "
    "y todo el texto visible debe estar en español neutro. Dirección de arte: "
    "minimalismo editorial sobrio pero con personalidad; fondo cálido o marfil, "
    "mezcla de serif para títulos y sans para cuerpo, mucho aire, bordes finos, "
    "paneles livianos, detalles sutiles de acento y una composición elegante. "
    "Nada de look SaaS genérico ni bloques pesados. Mobile-first. Estructura: "
    "<header> con nombre de la empresa + tagline, luego 3 a 5 <article> "
    "(cada uno con h2, una meta breve y atemporal sobre categoría, audiencia o "
    "enfoque, y 2-4 párrafos cortos), y finalmente un <footer>. Mantené el "
    "contenido atemporal: sin metadata de publicación, sin timestamps, sin "
    "referencias de calendario y sin bylines. El contenido debe ser específico "
    "de la empresa: hablar de su ICP real, propuesta de valor, fricción de "
    "mercado investigada y casos de uso. Los artículos deben sentirse como "
    "thought leadership breve y real de la empresa, no como commentary genérico "
    "del sector. Longitud por artículo: 120-220 palabras."
)


def _generate_blog_html(
    *,
    company: Company,
    brief: BlogIndustryBrief,
    research: BlogEditorialResearch,
    client: AnthropicLike,
    settings: Settings,
) -> BlogHtmlResult:
    """Returns HTML with a deterministic fallback if the LLM path misbehaves."""
    if not settings.anthropic_api_key:
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason="ANTHROPIC_API_KEY is empty",
        )

    user_msg = json.dumps(
        {
            "company": {
                "name": company.name,
                "business_context_summary": company.business_context_summary
                or "(none provided)",
                "icp_description": company.icp_description or "(unspecified)",
                "target_countries": company.target_countries or [],
            },
            "industry_brief": brief.as_prompt_payload(),
            "editorial_research": research.as_prompt_payload(),
            "requirements": [
                "Devolvé únicamente el documento HTML completo.",
                "Usá un tono editorial atemporal.",
                "Las meta labels deben describir categoría, audiencia o enfoque.",
                "No agregues metadata de publicación ni bylines.",
                "Todo el texto visible debe estar en español.",
                "El tag <html> debe declarar lang=\"es\".",
                "El estilo visual debe verse premium, minimalista y editorial.",
            ],
        },
        ensure_ascii=False,
    )
    try:
        response = client.messages_create(
            model=settings.anthropic_model,
            max_tokens=settings.anthropic_max_tokens,
            system=_BLOG_SYSTEM,
            messages=[{"role": "user", "content": user_msg}],
            temperature=settings.anthropic_temperature,
        )
    except Exception as exc:  # pragma: no cover - network failure
        logger.warning("blog HTML generation failed, using fallback: %s", exc)
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason=f"anthropic_html_error: {exc}",
        )

    html = ""
    for block in response.content:
        if block.type == "text" and block.text:
            html = block.text
            break
    html = _clean_html_document(html)
    # Strip markdown fences if the model wrapped the document.
    if "<html" not in html.lower():
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason="anthropic_html_missing_html_tag",
        )
    if not _SPANISH_HTML_RE.search(html):
        logger.warning("blog HTML did not declare lang=es; using fallback")
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason="anthropic_html_missing_spanish_lang_tag",
        )
    if _contains_temporal_markers(html):
        logger.warning("blog HTML contained temporal markers; using fallback")
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason="anthropic_html_contains_temporal_markers",
        )

    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else f"Blog de {company.name}"
    return BlogHtmlResult(title=title, html=html, mode="anthropic_html")


def _clean_html_document(html: str) -> str:
    content = (html or "").strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:html)?\s*", "", content)
        content = re.sub(r"\s*```\s*$", "", content)
    return content.strip()


def _contains_temporal_markers(text: str) -> bool:
    return any(pattern.search(text or "") for pattern in _TEMPORAL_MARKERS)


def _plain_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _evergreen_text(value: str | None, *, fallback: str) -> str:
    primary = _plain_text(value)
    if primary and not _contains_temporal_markers(primary):
        return primary
    secondary = _plain_text(fallback)
    if secondary and not _contains_temporal_markers(secondary):
        return secondary
    return "Contexto de mercado atemporal"


def _first(values: list[str], fallback: str) -> str:
    for value in values:
        if _plain_text(value):
            return _plain_text(value)
    return fallback


def _generation_metadata(
    *,
    brief: BlogIndustryBrief,
    research: BlogEditorialResearch,
    html_result: BlogHtmlResult,
) -> dict:
    return {
        "generation_mode": research.generation_mode,
        "industry_label": research.industry_label or brief.industry_label,
        "editorial_angles": list(research.editorial_angles),
        "pain_points": list(research.pain_points),
        "market_language": list(research.market_language),
        "evidence_urls": list(research.evidence_urls),
        "fallback_reason": research.fallback_reason,
        "html_mode": html_result.mode,
        "html_fallback_reason": html_result.fallback_reason,
        "industry_brief": brief.as_prompt_payload(),
    }


def _merge_raw_response(publication: BlogPublication, section: str, payload: dict) -> None:
    raw = dict(publication.raw_response or {})
    raw[section] = payload
    publication.raw_response = raw


def _build_editorial_research(
    *,
    brief: BlogIndustryBrief,
    settings: Settings,
    researcher: BlogEditorialResearcher | None = None,
) -> BlogEditorialResearch:
    try:
        if researcher is None:
            if not settings.anthropic_api_key:
                return BlogEditorialResearch.internal_fallback(
                    brief=brief,
                    reason="ANTHROPIC_API_KEY is empty",
                )
            researcher = AnthropicBlogResearchProvider(settings=settings)
        return researcher.research(brief=brief)
    except Exception as exc:  # pragma: no cover - network / provider failures
        logger.warning("blog editorial research failed, using internal fallback: %s", exc)
        return BlogEditorialResearch.internal_fallback(
            brief=brief,
            reason=str(exc),
        )


# ---------------------------------------------------------------------------
# Main entrypoint
# ---------------------------------------------------------------------------


def publish_blog(
    session: Session,
    company_id: str,
    *,
    execute: bool,
    anthropic: AnthropicLike | None = None,
    vercel: VercelClient | None = None,
    spaceship: SpaceshipClient | None = None,
    editorial_research: BlogEditorialResearcher | None = None,
) -> BlogPublishResult:
    company = session.get(Company, company_id)
    if company is None:
        raise CompanyNotFound(company_id)

    settings = get_settings()
    evaluation = _evaluate(execute=execute, settings=settings)
    real = evaluation.decision == Decision.ALLOWED

    domain_row = _pick_purchased_domain(company)
    email_domain = domain_row.domain
    subdomain_host = f"blog.{email_domain}"
    project_name = _project_name_for(company, email_domain)

    record_audit(
        session,
        actor="blog-service",
        tool_name="publish_blog",
        decision=evaluation.decision.value,
        flag=evaluation.flag,
        side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
        request={
            "company_id": company.id,
            "email_domain": email_domain,
            "subdomain_host": subdomain_host,
            "execute": execute,
        },
        response={"reason": evaluation.reason},
    )

    publication = BlogPublication(
        company_id=company.id,
        purchased_domain_id=domain_row.id,
        subdomain_host=subdomain_host,
        vercel_project_name=project_name,
        status="generating",
    )
    session.add(publication)
    session.flush()

    anthropic_client = anthropic or get_anthropic_client()
    brief = infer_industry_brief(company)
    research = _build_editorial_research(
        brief=brief,
        settings=settings,
        researcher=editorial_research,
    )
    html_result = _generate_blog_html(
        company=company,
        brief=brief,
        research=research,
        client=anthropic_client,
        settings=settings,
    )
    publication.title = html_result.title
    publication.html_content = html_result.html
    publication.error_message = None
    _merge_raw_response(
        publication,
        "generation",
        _generation_metadata(
            brief=brief,
            research=research,
            html_result=html_result,
        ),
    )
    publication.status = "html_ready"
    session.flush()

    if not real:
        publication.status = "dry_run"
        publication.custom_url = f"https://{subdomain_host}"
        publication.vercel_deployment_url = (
            f"https://{project_name}-dryrun.vercel.app"
        )
        session.flush()
        return BlogPublishResult(
            publication_id=publication.id,
            company_id=company.id,
            custom_url=publication.custom_url,
            vercel_deployment_url=publication.vercel_deployment_url,
            subdomain_host=subdomain_host,
            status=publication.status,
            dry_run=True,
        )

    vercel_client = vercel or get_vercel_client()
    spaceship_client = spaceship or get_spaceship_client()

    try:
        deploy_resp = vercel_client.create_deployment(
            project_name=project_name,
            files=[{"file": "index.html", "data": html_result.html}],
            target="production",
        ).body
    except VercelError as exc:
        publication.status = "deploy_failed"
        publication.error_message = str(exc)
        _merge_raw_response(
            publication,
            "deploy_error",
            exc.payload if isinstance(exc.payload, dict) else {"error": str(exc)},
        )
        session.flush()
        raise

    deployment_id = deploy_resp.get("id") or deploy_resp.get("uid")
    deploy_url = deploy_resp.get("url") or deploy_resp.get("alias", [None])[0]
    if deploy_url and not deploy_url.startswith("http"):
        deploy_url = f"https://{deploy_url}"
    publication.vercel_deployment_id = deployment_id
    publication.vercel_deployment_url = deploy_url
    _merge_raw_response(publication, "deploy", deploy_resp)
    publication.status = "deployed"
    session.flush()

    # Attach the custom subdomain. If it's already attached (e.g. on a re-publish)
    # Vercel returns 4xx — we surface as "already attached" rather than fail.
    try:
        vercel_client.add_project_domain(project_name, subdomain_host)
    except VercelError as exc:
        if exc.status not in (400, 409):
            publication.status = "domain_attach_failed"
            publication.error_message = str(exc)
            session.flush()
            raise
        logger.info("vercel domain already attached: %s", subdomain_host)

    # Add CNAME at Spaceship: blog → cname.vercel-dns.com
    # Spaceship's PUT replaces the zone with `items`, so we merge: list
    # current records, drop any prior `blog` CNAME, append ours, PUT all.
    try:
        listing = spaceship_client.list_dns_records(email_domain).body
        current_items = listing.get("items") or listing.get("records") or []
        merged: list[dict] = []
        for rec in current_items:
            rtype = (rec.get("type") or "").upper()
            rname = rec.get("name") or rec.get("host") or ""
            if rtype == "CNAME" and rname == "blog":
                continue  # drop stale blog CNAME if any — re-publish path
            merged.append(rec)
        merged.append(
            {
                "type": "CNAME",
                "name": "blog",
                "cname": settings.vercel_dns_target,
                "ttl": 600,
            }
        )
        spaceship_client.save_dns_records(email_domain, merged, force=True)
    except Exception as exc:
        publication.status = "dns_failed"
        publication.error_message = str(exc)
        session.flush()
        raise

    publication.custom_url = f"https://{subdomain_host}"
    publication.status = "live"
    session.flush()

    return BlogPublishResult(
        publication_id=publication.id,
        company_id=company.id,
        custom_url=publication.custom_url,
        vercel_deployment_url=publication.vercel_deployment_url,
        subdomain_host=subdomain_host,
        status=publication.status,
        dry_run=False,
    )


def get_latest_publication(session: Session, company_id: str) -> BlogPublication | None:
    return (
        session.query(BlogPublication)
        .filter(BlogPublication.company_id == company_id)
        .order_by(BlogPublication.created_at.desc())
        .first()
    )


__all__ = [
    "BlogPublishResult",
    "BlogServiceError",
    "CompanyNotFound",
    "NoDomainAvailable",
    "get_latest_publication",
    "publish_blog",
]
