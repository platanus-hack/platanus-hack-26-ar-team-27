"""Company endpoints."""
from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.api.deps import Session, get_db
from app.api.security import get_stream_token_store, issue_stream_token
from app.core.settings import get_settings
from app.db.session import get_session_factory
from app.schemas.gtm import (
    CompanyAnalyzeRequest,
    CompanyConfirmRequest,
    CompanyOut,
    SourceFile,
)
from app.services.diagnostic_service import (
    CompanyNotFound,
    analyze_company,
    confirm_company,
    get_company_or_404,
)

router = APIRouter(prefix="/companies", tags=["companies"])
# Public router for endpoints that authenticate via short-lived stream tokens
# rather than the X-Api-Key header (EventSource cannot send custom headers).
public_router = APIRouter(prefix="/companies", tags=["companies-public"])


class StreamTokenResponse(BaseModel):
    token: str
    ttl_seconds: int
    stream_url: str


@router.post("/analyze", response_model=CompanyOut)
def analyze(payload: CompanyAnalyzeRequest, db: Session = Depends(get_db)) -> CompanyOut:
    company = analyze_company(db, payload)
    return CompanyOut.model_validate(company)


@router.post("/analyze/stream-token", response_model=StreamTokenResponse)
def issue_analyze_token(payload: CompanyAnalyzeRequest) -> StreamTokenResponse:
    """Mint a single-use token to be passed to GET /analyze/stream.

    EventSource cannot send custom headers; this two-step flow keeps the
    streaming endpoint authenticated while the browser uses the token in
    the query string.
    """
    token, ttl = issue_stream_token(
        {"raw_input": payload.raw_input, "files": [f.model_dump() for f in payload.files]}
    )
    return StreamTokenResponse(
        token=token,
        ttl_seconds=ttl,
        stream_url=f"/companies/analyze/stream?token={token}",
    )


def _sse(event: str, data: Any) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n".encode()


@public_router.get("/analyze/stream")
async def analyze_stream(token: str) -> StreamingResponse:
    """SSE: stream the GTM Diagnostic agent's progress."""
    store = get_stream_token_store()
    payload_data = store.consume(token)
    if payload_data is None:
        raise HTTPException(status_code=401, detail="invalid or expired token")
    settings = get_settings()
    payload = CompanyAnalyzeRequest(
        raw_input=payload_data.get("raw_input", ""),
        files=[SourceFile(**f) for f in payload_data.get("files", [])],
    )
    use_anthropic = bool(settings.anthropic_api_key)

    async def event_generator():
        try:
            yield _sse("start", {"message": "Iniciando análisis del MVP", "use_anthropic": use_anthropic})
            await asyncio.sleep(0.25)
            yield _sse("step", {"label": "input", "message": "Procesando texto del usuario…"})
            await asyncio.sleep(0.4)
            yield _sse("step", {"label": "company", "message": "Identificando empresa y propuesta de valor…"})
            await asyncio.sleep(0.4)
            yield _sse(
                "step",
                {"label": "icp", "message": "Inferiendo el Ideal Customer Profile…"},
            )
            await asyncio.sleep(0.3)

            def _run() -> dict[str, Any]:
                factory = get_session_factory()
                with factory() as session:
                    company = analyze_company(
                        session, payload, force_heuristic=not use_anthropic
                    )
                    session.commit()
                    return CompanyOut.model_validate(company).model_dump(mode="json")

            try:
                company_json = await asyncio.wait_for(asyncio.to_thread(_run), timeout=120)
            except TimeoutError:
                yield _sse("error", {"message": "agent timeout"})
                return

            yield _sse(
                "step",
                {"label": "domains", "message": "Sugiriendo dominios para outbound…"},
            )
            await asyncio.sleep(0.25)
            yield _sse("done", {"company": company_json})
        except Exception as exc:
            yield _sse("error", {"message": str(exc)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # disable buffering on nginx (Render uses one)
        },
    )


@router.post("/{company_id}/confirm", response_model=CompanyOut)
def confirm(company_id: str, payload: CompanyConfirmRequest, db: Session = Depends(get_db)) -> CompanyOut:
    try:
        company = confirm_company(db, company_id, payload)
    except CompanyNotFound:
        raise HTTPException(status_code=404, detail="company not found")
    return CompanyOut.model_validate(company)


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(company_id: str, db: Session = Depends(get_db)) -> CompanyOut:
    try:
        company = get_company_or_404(db, company_id)
    except CompanyNotFound:
        raise HTTPException(status_code=404, detail="company not found")
    return CompanyOut.model_validate(company)
