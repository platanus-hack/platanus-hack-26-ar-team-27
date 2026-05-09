"""Engine + session factory."""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.settings import get_settings

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None


def _build_engine() -> Engine:
    settings = get_settings()
    url = settings.database_url
    connect_args: dict = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, future=True, connect_args=connect_args)


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
