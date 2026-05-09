"""Agent base class.

An Agent declares which tools it is allowed to call, the Pydantic schema
of its final output, and the system prompt. The runner does the heavy
lifting (tool-use loop, safety, persistence).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel


@dataclass
class Agent:
    name: str
    system_prompt: str
    output_schema: type[BaseModel]
    allowed_tools: list[str] = field(default_factory=list)
    model: str | None = None
    max_tokens: int | None = None
    temperature: float | None = None
    extra_context: dict[str, Any] = field(default_factory=dict)
