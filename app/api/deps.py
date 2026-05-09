"""FastAPI dependencies."""
from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends
from sqlalchemy.orm import Session

from app.db.session import get_session_factory


def get_db() -> Iterator[Session]:
    factory = get_session_factory()
    db = factory()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


__all__ = ["Depends", "Session", "get_db"]
