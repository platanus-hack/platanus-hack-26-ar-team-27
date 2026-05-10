"""Blog publication tool — thin wrapper over the BlogService for agents."""
from __future__ import annotations

from typing import Any

from app.core.safety import SideEffectLevel
from app.services.blog_service import publish_blog
from app.tools.registry import Tool, register_tool


def _publish_blog(
    *,
    company_id: str,
    session=None,
    dry_run: bool = False,
    **_: Any,
) -> dict:
    result = publish_blog(session, company_id, execute=not dry_run)
    return {
        "publication_id": result.publication_id,
        "company_id": result.company_id,
        "custom_url": result.custom_url,
        "vercel_deployment_url": result.vercel_deployment_url,
        "subdomain_host": result.subdomain_host,
        "status": result.status,
        "dry_run": result.dry_run,
    }


def register_all() -> None:
    register_tool(
        Tool(
            name="publish_blog",
            description=(
                "Generate a single-page HTML blog tailored to the company's "
                "context and deploy it to Vercel under a `blog.<email_domain>` "
                "subdomain. Returns the public URL. EXTERNAL_WRITE side effect "
                "gated by ALLOW_BLOG_PUBLISH."
            ),
            input_schema={
                "type": "object",
                "properties": {"company_id": {"type": "string"}},
                "required": ["company_id"],
            },
            implementation=_publish_blog,
            side_effect_level=SideEffectLevel.EXTERNAL_WRITE,
            requires_confirmation=True,
        )
    )
