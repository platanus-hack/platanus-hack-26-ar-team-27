"""FastAPI entrypoint."""
from __future__ import annotations

from fastapi import FastAPI

from app.api.campaigns import router as campaigns_router
from app.api.companies import router as companies_router
from app.api.domains import companies_router as company_domains_router
from app.api.domains import domains_router
from app.api.warmup import router as warmup_router
from app.api.webhooks import router as webhooks_router
from app.core.logging import configure_logging
from app.tools.bootstrap import ensure_registered


def create_app() -> FastAPI:
    configure_logging()
    ensure_registered()
    app = FastAPI(title="GTM B2B MVP", version="0.1.0")
    app.include_router(companies_router)
    app.include_router(company_domains_router)
    app.include_router(domains_router)
    app.include_router(warmup_router)
    app.include_router(campaigns_router)
    app.include_router(webhooks_router)

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
