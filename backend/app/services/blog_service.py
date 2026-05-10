"""Blog publication service.

Pipeline:
  1. Pick a PurchasedDomain for the company (the email domain we'll alias).
  2. Generate a single-page HTML blog with Anthropic, themed for the company.
  3. Deploy the HTML to Vercel (REST API) — auto-creates the project.
  4. Attach `blog.<email_domain>` to the project.
  5. Add a CNAME record at the registrar (Spaceship) pointing the subdomain
     to Vercel's edge (`cname.vercel-dns.com`).
  6. Persist a BlogPublication row with the URLs.

Safety: the Vercel + Spaceship side effects are gated by
`Settings.allow_blog_publish`. When disabled (default), the service runs in
"dry_run" mode — it still calls Anthropic to generate HTML and persists the
row, but skips the network calls and returns a placeholder URL.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.agents.runner import record_audit
from app.clients.anthropic_client import AnthropicLike, get_anthropic_client
from app.clients.spaceship import SpaceshipClient, get_spaceship_client
from app.clients.vercel import VercelClient, VercelError, get_vercel_client
from app.core.logging import get_logger
from app.core.safety import Decision, SafetyEvaluation, SideEffectLevel
from app.core.settings import Settings, get_settings
from app.db.models import BlogPublication, Company, PurchasedDomain

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


def _fallback_html(company: Company) -> tuple[str, str]:
    title = f"{company.name} Insights"
    subtitle = company.business_context_summary or "Notes from the team."
    posts_html = "\n".join(
        f"<article><h2>Post {i + 1}: A note about {company.name}</h2>"
        f"<div class=\"meta\">Draft · placeholder</div>"
        f"<p>This is placeholder copy generated without an LLM. "
        f"Configure ANTHROPIC_API_KEY to get tailored content.</p></article>"
        for i in range(3)
    )
    html = _FALLBACK_HTML_TEMPLATE.format(
        title=title, subtitle=subtitle, posts_html=posts_html, company=company.name
    )
    return title, html


_BLOG_SYSTEM = (
    "You are a senior content designer. You produce a single complete HTML "
    "document (no markdown, no commentary) for a small company blog. "
    "Output MUST be a valid `<!doctype html>` document with inline CSS, no "
    "external assets, no JavaScript. Visual style: editorial, generous "
    "whitespace, strong typographic hierarchy, one accent color, mobile-first. "
    "Page structure: <header> with company name + tagline, then 3 to 5 "
    "<article> elements (each: h2 title, small date/author meta line, 2-4 "
    "short paragraphs), then a <footer>. Content must be specific to the "
    "company described — talk about their actual ICP, value prop and use "
    "cases. Articles should feel like real short-form thought leadership, "
    "not lorem ipsum. Length per article: 120-220 words."
)


def _generate_blog_html(
    *,
    company: Company,
    client: AnthropicLike,
    settings: Settings,
) -> tuple[str, str]:
    """Returns (title, html). Falls back to a static template if no API key."""
    if not settings.anthropic_api_key:
        return _fallback_html(company)

    user_msg = (
        f"Company: {company.name}\n"
        f"Context: {company.business_context_summary or '(none provided)'}\n"
        f"ICP: {company.icp_description or '(unspecified)'}\n"
        f"Target countries: {', '.join(company.target_countries or []) or '(unspecified)'}\n\n"
        "Generate the full HTML blog page now. Return ONLY the HTML document."
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
        return _fallback_html(company)

    html = ""
    for block in response.content:
        if block.type == "text" and block.text:
            html = block.text
            break
    html = html.strip()
    # Strip markdown fences if the model wrapped the document.
    if html.startswith("```"):
        html = re.sub(r"^```(?:html)?\s*", "", html)
        html = re.sub(r"\s*```\s*$", "", html)
    if "<html" not in html.lower():
        return _fallback_html(company)

    title_match = re.search(r"<title[^>]*>([^<]+)</title>", html, re.IGNORECASE)
    title = title_match.group(1).strip() if title_match else f"{company.name} Blog"
    return title, html


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
    title, html = _generate_blog_html(
        company=company, client=anthropic_client, settings=settings
    )
    publication.title = title
    publication.html_content = html
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
            files=[{"file": "index.html", "data": html}],
            target="production",
        ).body
    except VercelError as exc:
        publication.status = "deploy_failed"
        publication.error_message = str(exc)
        publication.raw_response = exc.payload if isinstance(exc.payload, dict) else {"error": str(exc)}
        session.flush()
        raise

    deployment_id = deploy_resp.get("id") or deploy_resp.get("uid")
    deploy_url = deploy_resp.get("url") or deploy_resp.get("alias", [None])[0]
    if deploy_url and not deploy_url.startswith("http"):
        deploy_url = f"https://{deploy_url}"
    publication.vercel_deployment_id = deployment_id
    publication.vercel_deployment_url = deploy_url
    publication.raw_response = deploy_resp
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
    try:
        spaceship_client.save_dns_records(
            email_domain,
            [
                {
                    "type": "CNAME",
                    "name": "blog",
                    "cname": settings.vercel_dns_target,
                    "ttl": 600,
                }
            ],
            force=False,
        )
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
