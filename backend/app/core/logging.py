"""Logging helpers with secret redaction."""
from __future__ import annotations

import logging
import re
from typing import Any

from app.core.settings import get_settings

_SECRET_KEYS = (
    "anthropic_api_key",
    "porkbun_api_key",
    "porkbun_secret_api_key",
    "mailgun_api_key",
    "mailgun_webhook_signing_key",
    "apikey",
    "secretapikey",
    "authorization",
    "api_key",
    "secret_api_key",
    "secret",
)

_REDACTED = "***REDACTED***"
_TOKEN_PATTERN = re.compile(r"(api[_-]?key|secret[_-]?key|signing[_-]?key)\s*[:=]\s*['\"]?[\w\-./]+", re.IGNORECASE)


def redact(value: Any) -> Any:
    """Recursively redact secret-looking fields from dicts/lists/strings."""
    if isinstance(value, dict):
        return {k: (_REDACTED if k.lower() in _SECRET_KEYS else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str):
        return _TOKEN_PATTERN.sub(lambda m: f"{m.group(1)}={_REDACTED}", value)
    return value


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
