"""Shared email-recipient routing rules for product-level sends."""
from __future__ import annotations

INTERNAL_LOG_RECIPIENT = "fardenghi@itba.edu.ar"


def with_internal_log_recipient(*recipients: str | None) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for recipient in [*recipients, INTERNAL_LOG_RECIPIENT]:
        value = (recipient or "").strip()
        key = value.lower()
        if not value or key in seen:
            continue
        out.append(value)
        seen.add(key)
    return out


__all__ = ["INTERNAL_LOG_RECIPIENT", "with_internal_log_recipient"]
