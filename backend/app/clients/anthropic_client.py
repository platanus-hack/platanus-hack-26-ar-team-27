"""Anthropic SDK wrapper.

Centralizes model + auth config and exposes a small interface so tests can
inject a mock without monkey-patching the SDK. The runner only depends on
``messages_create`` returning an object with the SDK's response shape.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.core.logging import get_logger
from app.core.settings import Settings, get_settings

logger = get_logger(__name__)


class AnthropicLike(Protocol):
    def messages_create(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
    ) -> Any: ...


@dataclass
class AnthropicResponseBlock:
    type: str
    text: str | None = None
    id: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None


@dataclass
class AnthropicResponse:
    content: list[AnthropicResponseBlock]
    stop_reason: str | None
    usage: dict[str, Any] | None = None


class AnthropicClient:
    """Thin sync wrapper around `anthropic.Anthropic`."""

    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()
        self._client = None  # lazy

    def _ensure(self):
        if self._client is None:
            try:
                import anthropic
            except ImportError as exc:  # pragma: no cover
                raise RuntimeError("anthropic package is not installed") from exc
            self._client = anthropic.Anthropic(api_key=self._settings.anthropic_api_key)
        return self._client

    def messages_create(
        self,
        *,
        model: str,
        max_tokens: int,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        temperature: float | None = None,
    ) -> AnthropicResponse:
        client = self._ensure()
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        if temperature is not None:
            kwargs["temperature"] = temperature
        raw = client.messages.create(**kwargs)
        blocks: list[AnthropicResponseBlock] = []
        for block in raw.content:
            kind = getattr(block, "type", None)
            if kind == "text":
                blocks.append(AnthropicResponseBlock(type="text", text=getattr(block, "text", "")))
            elif kind == "tool_use":
                blocks.append(
                    AnthropicResponseBlock(
                        type="tool_use",
                        id=getattr(block, "id", None),
                        name=getattr(block, "name", None),
                        input=getattr(block, "input", {}) or {},
                    )
                )
        return AnthropicResponse(
            content=blocks,
            stop_reason=getattr(raw, "stop_reason", None),
            usage=getattr(raw, "usage", None),
        )


# Default singleton (overridable in tests).
_default_client: AnthropicLike | None = None


def get_anthropic_client() -> AnthropicLike:
    global _default_client
    if _default_client is None:
        _default_client = AnthropicClient()
    return _default_client


def set_anthropic_client(client: AnthropicLike) -> None:
    global _default_client
    _default_client = client
