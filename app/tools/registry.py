"""Tool registry.

Tools wrap a Python callable plus the metadata Anthropic needs (name,
description, input_schema) and the safety metadata our runner uses
(side_effect_level, requires_confirmation, supports_dry_run).
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.safety import SideEffectLevel


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    input_schema: dict[str, Any]
    implementation: Callable[..., Any]
    side_effect_level: SideEffectLevel = SideEffectLevel.NONE
    requires_confirmation: bool = False
    supports_dry_run: bool = True

    def to_anthropic(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
        }


@dataclass
class ToolRegistry:
    tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, tool: Tool) -> None:
        if tool.name in self.tools:
            raise ValueError(f"tool already registered: {tool.name}")
        self.tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self.tools.get(name)

    def subset(self, names: list[str]) -> ToolRegistry:
        sub = ToolRegistry()
        for n in names:
            t = self.get(n)
            if t is None:
                raise KeyError(f"unknown tool {n}")
            sub.register(t)
        return sub

    def to_anthropic(self) -> list[dict[str, Any]]:
        return [t.to_anthropic() for t in self.tools.values()]


_global = ToolRegistry()


def get_global_registry() -> ToolRegistry:
    return _global


def register_tool(tool: Tool) -> Tool:
    _global.register(tool)
    return tool
