"""Mailgun webhook endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.api.deps import Session, get_db
from app.services.webhook_service import process_event, process_inbound

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.post("/mailgun/events")
async def mailgun_events(request: Request, db: Session = Depends(get_db)) -> dict:
    payload = await request.json()
    result = process_event(db, payload)
    if not result.get("accepted"):
        raise HTTPException(401, "invalid signature")
    return result


@router.post("/mailgun/inbound")
async def mailgun_inbound(request: Request, db: Session = Depends(get_db)) -> dict:
    try:
        payload = await request.json()
    except Exception:
        form = await request.form()
        payload = {k: v for k, v in form.items()}
    return process_inbound(db, payload)
