"""FastAPI entrypoint."""
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.blog import router as blog_router
from app.api.campaigns import router as campaigns_router
from app.api.companies import public_router as companies_public_router
from app.api.companies import router as companies_router
from app.api.domains import companies_router as company_domains_router
from app.api.domains import domains_router
from app.api.security import require_api_key
from app.api.warmup import router as warmup_router
from app.api.webhooks import router as webhooks_router
from app.core.logging import configure_logging
from app.core.settings import get_settings
from app.tools.bootstrap import ensure_registered


def create_app() -> FastAPI:
    configure_logging()
    ensure_registered()
    settings = get_settings()
    app = FastAPI(title="GTM B2B MVP", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # /health and /webhooks/mailgun/* are public (HMAC-validated for webhooks).
    @app.get("/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    app.include_router(webhooks_router)
    # Public endpoints authenticated via short-lived stream tokens.
    app.include_router(companies_public_router)

    # Everything else requires the API key.
    auth = [Depends(require_api_key)]
    app.include_router(companies_router, dependencies=auth)
    app.include_router(company_domains_router, dependencies=auth)
    app.include_router(domains_router, dependencies=auth)
    app.include_router(warmup_router, dependencies=auth)
    app.include_router(campaigns_router, dependencies=auth)
    app.include_router(blog_router, dependencies=auth)

    return app


app = create_app()
