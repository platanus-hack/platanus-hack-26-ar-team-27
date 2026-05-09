"""Engine + session factory."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.settings import get_settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _normalize_postgres_url(url: str) -> str:
    """Drop URL params that psycopg2 doesn't understand (e.g. ``pgbouncer=true``)."""
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(url)
    if not parts.scheme.startswith("postgres"):
        return url
    if not parts.query:
        return url
    keep_params: list[str] = []
    for chunk in parts.query.split("&"):
        if not chunk:
            continue
        key = chunk.split("=", 1)[0].lower()
        if key in {"pgbouncer", "schema"}:
            continue
        keep_params.append(chunk)
    new_query = "&".join(keep_params)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))


def _build_engine() -> Engine:
    settings = get_settings()
    url = _normalize_postgres_url(settings.database_url)
    connect_args: dict = {}
    engine_kwargs: dict = {"future": True}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    elif url.startswith("postgres"):
        # Supabase pooler runs PgBouncer in transaction mode → disable
        # SQLAlchemy's connection-level statement cache (prepared statements
        # are not safe across pooled connections).
        engine_kwargs["pool_pre_ping"] = True
    return create_engine(url, connect_args=connect_args, **engine_kwargs)


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = _build_engine()
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)
    return _SessionLocal


def session_scope() -> Iterator[Session]:
    """Context-manager friendly session for FastAPI dependencies and CLI."""
    factory = get_session_factory()
    db = factory()
    try:
        yield db
    finally:
        db.close()


def reset_engine_for_tests() -> None:
    global _engine, _SessionLocal
    _engine = None
    _SessionLocal = None
