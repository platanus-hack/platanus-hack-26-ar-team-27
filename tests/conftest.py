"""Shared pytest fixtures.

We use a per-test in-memory SQLite database (faster than tmpdir files,
isolated per session) and reset the engine cached in app.db.session.
"""
from __future__ import annotations

import os

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Make sure pydantic-settings doesn't pick up an unrelated .env when running
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("ALLOW_DOMAIN_PURCHASES", "false")
os.environ.setdefault("ALLOW_COLD_EMAILS", "false")
os.environ.setdefault("ALLOW_DEMO_EMAILS", "false")
os.environ.setdefault("MAILGUN_WEBHOOK_SIGNING_KEY", "test-signing-key")
os.environ.setdefault("PORKBUN_API_KEY", "test-pk")
os.environ.setdefault("PORKBUN_SECRET_API_KEY", "test-sk")
os.environ.setdefault("MAILGUN_API_KEY", "test-mg")

import app.db.models  # noqa: F401,E402  ensure mappers are registered
from app.core.settings import get_settings  # noqa: E402
from app.db import session as db_session  # noqa: E402
from app.db.base import Base  # noqa: E402


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture()
def db_engine():
    engine = create_engine("sqlite:///:memory:", future=True, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session_factory(db_engine):
    return sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)


@pytest.fixture()
def session(db_session_factory):
    s = db_session_factory()
    try:
        yield s
    finally:
        s.close()


@pytest.fixture()
def app_session_factory(db_engine, monkeypatch):
    """Wire the application's session helper to the in-memory DB."""
    db_session.reset_engine_for_tests()
    monkeypatch.setattr(db_session, "get_engine", lambda: db_engine)
    factory = sessionmaker(bind=db_engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(db_session, "get_session_factory", lambda: factory)
    yield factory
    db_session.reset_engine_for_tests()
