"""Blog publication endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import Depends, Session, get_db
from app.clients.vercel import VercelError
from app.services.blog_service import (
    CompanyNotFound,
    NoDomainAvailable,
    get_latest_publication,
    publish_blog,
)

router = APIRouter(prefix="/companies", tags=["blog"])


class PublishBlogRequest(BaseModel):
    execute: bool = Field(
        default=False,
        description=(
            "When false (default) generates the HTML and persists a draft "
            "but skips Vercel + DNS calls. When true and ALLOW_BLOG_PUBLISH=true "
            "in settings, performs the real deploy."
        ),
    )


class BlogPublicationOut(BaseModel):
    id: str
    company_id: str
    custom_url: str | None
    vercel_deployment_url: str | None
    subdomain_host: str | None
    title: str | None
    status: str
    error_message: str | None = None


@router.post("/{company_id}/blog/publish", response_model=BlogPublicationOut)
def publish(
    company_id: str,
    payload: PublishBlogRequest | None = None,
    db: Session = Depends(get_db),
) -> BlogPublicationOut:
    payload = payload or PublishBlogRequest()
    try:
        result = publish_blog(db, company_id, execute=payload.execute)
    except CompanyNotFound:
        raise HTTPException(status_code=404, detail="company not found")
    except NoDomainAvailable as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except VercelError as exc:
        raise HTTPException(status_code=502, detail=f"vercel: {exc}")

    publication = get_latest_publication(db, company_id)
    assert publication is not None
    return BlogPublicationOut(
        id=publication.id,
        company_id=publication.company_id,
        custom_url=publication.custom_url,
        vercel_deployment_url=publication.vercel_deployment_url,
        subdomain_host=publication.subdomain_host,
        title=publication.title,
        status=publication.status,
        error_message=publication.error_message,
    )


@router.get("/{company_id}/blog", response_model=BlogPublicationOut)
def get_blog(company_id: str, db: Session = Depends(get_db)) -> BlogPublicationOut:
    publication = get_latest_publication(db, company_id)
    if publication is None:
        raise HTTPException(status_code=404, detail="no blog publication for company")
    return BlogPublicationOut(
        id=publication.id,
        company_id=publication.company_id,
        custom_url=publication.custom_url,
        vercel_deployment_url=publication.vercel_deployment_url,
        subdomain_host=publication.subdomain_host,
        title=publication.title,
        status=publication.status,
        error_message=publication.error_message,
    )
