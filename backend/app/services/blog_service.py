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
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{title}</title>
<style>
  :root {{ --fg:#111; --muted:#555; --bg:#fafaf7; --accent:#0b5cff; }}
  * {{ box-sizing:border-box; }}
  body {{ font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif; margin:0; color:var(--fg); background:var(--bg); }}
  .wrap {{ max-width:760px; margin:0 auto; padding:64px 24px; }}
  header h1 {{ font-size:2.4rem; margin:0 0 12px; letter-spacing:-0.02em; }}
  header p {{ color:var(--muted); font-size:1.1rem; }}
  article {{ margin:48px 0; padding-bottom:32px; border-bottom:1px solid #e5e5e0; }}
  article:last-child {{ border-bottom:none; }}
  article h2 {{ font-size:1.5rem; margin:0 0 8px; }}
  article .meta {{ color:var(--muted); font-size:0.9rem; margin-bottom:16px; }}
  article p {{ line-height:1.7; }}
  footer {{ color:var(--muted); font-size:0.85rem; margin-top:64px; }}
  a {{ color:var(--accent); }}
</style></head>
<body><main class="wrap">
<header><h1>{title}</h1><p>{subtitle}</p></header>
{posts_html}
<footer>© {company} — built with care.</footer>
</main></body></html>"""


_TEMPORAL_MARKERS = (
    re.compile(r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
               r"jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|"
               r"nov(?:ember)?|dec(?:ember)?)\b", re.IGNORECASE),
    re.compile(r"\b20\d{2}\b"),
    re.compile(r"\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b"),
    re.compile(r"\bQ[1-4]\b", re.IGNORECASE),
    re.compile(r"\bPublished on\b", re.IGNORECASE),
)


def _fallback_html(
    *,
    company: Company,
    brief: BlogIndustryBrief,
    research: BlogEditorialResearch,
    reason: str | None = None,
) -> BlogHtmlResult:
    title = f"{company.name} Insights"
    subtitle = _evergreen_text(
        company.business_context_summary,
        fallback=f"Evergreen notes for teams evaluating {research.industry_label}.",
    )
    audience = _evergreen_text(
        brief.audience_summary,
        fallback="their buying committee",
    )
    geography = _evergreen_text(
        brief.geography_summary,
        fallback="their priority markets",
    )
    category = _evergreen_text(
        research.industry_label or brief.industry_label,
        fallback="their market",
    )
    primary_angle = _evergreen_text(
        _first(
            research.editorial_angles,
            f"What buyers in {category} need before they commit",
        ),
        fallback=f"What buyers in {category} need before they commit",
    )
    secondary_angle = _evergreen_text(
        _first(
            research.editorial_angles[1:],
            f"How {audience} evaluate operational trade-offs",
        ),
        fallback=f"How {audience} evaluate operational trade-offs",
    )
    primary_pain = _evergreen_text(
        _first(
            research.pain_points,
            f"Teams in {category} still need clearer ways to turn priorities into execution.",
        ),
        fallback=f"Teams in {category} still need clearer ways to turn priorities into execution.",
    )
    secondary_pain = _evergreen_text(
        _first(
            research.pain_points[1:],
            "Buyers keep looking for faster alignment, lower adoption risk and cleaner ROI stories.",
        ),
        fallback="Buyers keep looking for faster alignment, lower adoption risk and cleaner ROI stories.",
    )
    market_language = _evergreen_text(
        ", ".join(research.market_language[:3]),
        fallback=f"{category}, {brief.offer_summary}, {audience}",
    )
    offer_summary = _evergreen_text(brief.offer_summary, fallback=company.name)
    gtm_summary = _evergreen_text(
        brief.gtm_summary,
        fallback="The strongest point of view is the one that sounds operational rather than promotional.",
    )

    posts_html = "\n".join(
        [
            (
                "<article>"
                f"<h2>{escape(primary_angle)}</h2>"
                f"<div class=\"meta\">Audience · {escape(audience)}</div>"
                f"<p>{escape(company.name)} operates in {escape(category)}, where buying teams often face a simple tension: "
                f"{escape(primary_pain)} Thought leadership earns attention when it names that friction clearly and avoids generic market talk.</p>"
                f"<p>For readers in {escape(geography)}, the most useful language is practical and specific: "
                f"{escape(market_language)}. That is the editorial lane this blog is built to occupy.</p>"
                "</article>"
            ),
            (
                "<article>"
                f"<h2>{escape(secondary_angle)}</h2>"
                f"<div class=\"meta\">Category · {escape(category)}</div>"
                f"<p>{escape(company.name)} sells {escape(offer_summary)}. The relevant story is not the feature list; "
                f"it is how that offer helps buyers move through procurement, implementation and internal alignment with less friction.</p>"
                f"<p>{escape(secondary_pain)} The best editorial pieces unpack those trade-offs in plain language and show the reader that the company understands the job behind the purchase.</p>"
                "</article>"
            ),
            (
                "<article>"
                f"<h2>{escape(company.name)}'s point of view in practice</h2>"
                f"<div class=\"meta\">Angle · {escape(category)}</div>"
                f"<p>This site should sound like a team that knows the category from the inside. That means writing about decision quality, operational risk, adoption, execution speed and the hard parts that appear after the sale.</p>"
                f"<p>{escape(gtm_summary)} A strong editorial cadence turns that perspective into durable market trust instead of one more generic company blog.</p>"
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
    "You are a senior content designer and B2B editorial strategist. "
    "You produce a single complete HTML document (no markdown, no commentary) "
    "for a small company thought-leadership site. "
    "Output MUST be a valid `<!doctype html>` document with inline CSS, no "
    "external assets, no JavaScript. Visual style: editorial, generous "
    "whitespace, strong typographic hierarchy, one accent color, mobile-first. "
    "Page structure: <header> with company name + tagline, then 3 to 5 "
    "<article> elements (each: h2 title, small evergreen meta line about "
    "category, audience or angle, 2-4 short paragraphs), then a <footer>. "
    "Keep the page timeless: no publication metadata, no timestamps, no "
    "calendar references, no bylines. Content must be specific to the company "
    "described — talk about their actual ICP, value prop, researched market "
    "friction and use cases. Articles should feel like real short-form thought "
    "leadership from the company, not generic industry commentary. Length per "
    "article: 120-220 words."
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
                "gtm_strategy": company.gtm_strategy or "(unspecified)",
                "target_countries": company.target_countries or [],
            },
            "industry_brief": brief.as_prompt_payload(),
            "editorial_research": research.as_prompt_payload(),
            "requirements": [
                "Return only the full HTML document.",
                "Use a timeless editorial tone.",
                "Meta labels must describe category, audience or angle.",
                "Do not add publication metadata or bylines.",
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
    if _contains_temporal_markers(html):
        logger.warning("blog HTML contained temporal markers; using fallback")
        return _fallback_html(
            company=company,
            brief=brief,
            research=research,
            reason="anthropic_html_contains_temporal_markers",
        )

    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else f"{company.name} Blog"
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
    return "Evergreen market context"


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
