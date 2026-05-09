"""Authentication helpers for the deployed backend.

Two surfaces:

1. ``require_api_key`` (FastAPI Dependency): validates the
   ``X-Api-Key`` header against ``BACKEND_API_KEY``. Applied to all
   business endpoints except ``/health`` and the Mailgun webhooks
   (which authenticate with HMAC).

2. ``StreamTokenStore``: short-lived in-memory tokens used to
   authenticate ``EventSource`` subscriptions, since the browser's
   ``EventSource`` API cannot send custom headers. The flow is:

       POST /companies/analyze/stream-token   (X-Api-Key auth)
            -> {token, ttl_seconds}
       GET  /companies/analyze/stream?token=  (validates and consumes)

The token is single-use and bound to a specific intent (e.g. the
diagnostic input that was previously persisted). For multi-instance
deploys, swap the in-memory store for Redis or Supabase.
"""
from __future__ import annotations

import secrets
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Header, HTTPException, status

from app.core.settings import Settings, get_settings


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
) -> None:
    settings = get_settings()
    expected = settings.backend_api_key
    if not expected:
        # No key configured -> deny by default in production-like env.
        # In local dev the user can set BACKEND_API_KEY=dev to disable.
        if settings.app_env != "local":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="BACKEND_API_KEY not configured",
            )
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-Api-Key",
        )


@dataclass
class _TokenEntry:
    payload: dict[str, Any]
    expires_at: float


class StreamTokenStore:
    """Single-process token store for SSE auth.

    Tokens are random 32-byte URL-safe strings, single-use, with a
    short TTL (60s by default). Sufficient while the backend runs as
    one process. For multi-instance, replace with Redis SETEX.
    """

    def __init__(self) -> None:
        self._store: dict[str, _TokenEntry] = {}

    def issue(self, payload: dict[str, Any], ttl_seconds: int) -> str:
        self._gc()
        token = secrets.token_urlsafe(32)
        self._store[token] = _TokenEntry(
            payload=payload, expires_at=time.monotonic() + ttl_seconds
        )
        return token

    def consume(self, token: str) -> dict[str, Any] | None:
        self._gc()
        entry = self._store.pop(token, None)
        if entry is None:
            return None
        if entry.expires_at < time.monotonic():
            return None
        return entry.payload

    def _gc(self) -> None:
        now = time.monotonic()
        stale = [k for k, v in self._store.items() if v.expires_at < now]
        for k in stale:
            self._store.pop(k, None)


_default_store = StreamTokenStore()


def get_stream_token_store() -> StreamTokenStore:
    return _default_store


def issue_stream_token(payload: dict[str, Any], settings: Settings | None = None) -> tuple[str, int]:
    s = settings or get_settings()
    token = _default_store.issue(payload, s.stream_token_ttl_seconds)
    return token, s.stream_token_ttl_seconds
