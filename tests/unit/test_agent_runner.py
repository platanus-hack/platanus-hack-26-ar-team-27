from __future__ import annotations

from typing import Any

import pytest
from pydantic import BaseModel

from app.agents.base import Agent
from app.agents.runner import AgentRunError, AgentRunner
from app.clients.anthropic_client import AnthropicResponse, AnthropicResponseBlock
from app.core.safety import SideEffectLevel
from app.core.settings import Settings
from app.db.models import AgentRun, AuditLog, ToolCall
from app.tools.registry import Tool, ToolRegistry


class _Stub:
    def __init__(self, scripted: list[AnthropicResponse]):
        self._scripted = list(scripted)
        self.calls: list[dict[str, Any]] = []

    def messages_create(self, **kwargs):  # type: ignore[override]
        self.calls.append(kwargs)
        if not self._scripted:
            raise AssertionError("no more scripted responses")
        return self._scripted.pop(0)


class FinalSchema(BaseModel):
    answer: str


def _final(text: str) -> AnthropicResponse:
    return AnthropicResponse(content=[AnthropicResponseBlock(type="text", text=text)], stop_reason="end_turn")


def _tool_use(name: str, input_payload: dict[str, Any], block_id: str = "tu_1") -> AnthropicResponse:
    return AnthropicResponse(
        content=[AnthropicResponseBlock(type="tool_use", id=block_id, name=name, input=input_payload)],
        stop_reason="tool_use",
    )


def _registry() -> ToolRegistry:
    reg = ToolRegistry()

    def _adder(*, a: int, b: int, session=None, dry_run: bool = False):
        return {"sum": a + b}

    reg.register(
        Tool(
            name="add_numbers",
            description="add two ints",
            input_schema={
                "type": "object",
                "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
                "required": ["a", "b"],
            },
            implementation=_adder,
            side_effect_level=SideEffectLevel.NONE,
        )
    )

    def _purchaser(*, domain: str, session=None, dry_run: bool = False):
        if dry_run:
            return {"dry_run": True, "domain": domain}
        return {"purchased": domain}

    reg.register(
        Tool(
            name="buy_domain",
            description="buy a domain (purchase side effect)",
            input_schema={"type": "object", "properties": {"domain": {"type": "string"}}, "required": ["domain"]},
            implementation=_purchaser,
            side_effect_level=SideEffectLevel.PURCHASE,
        )
    )
    return reg


def _agent(tools: list[str]) -> Agent:
    return Agent(
        name="test-agent",
        system_prompt="You are a test agent. Use tools, then return JSON.",
        output_schema=FinalSchema,
        allowed_tools=tools,
        model="test-model",
    )


def _settings(**kwargs) -> Settings:
    return Settings(
        anthropic_api_key="k",
        anthropic_model="test-model",
        anthropic_max_tokens=200,
        anthropic_temperature=0.0,
        max_tool_iterations=4,
        agent_total_timeout_seconds=10,
        **kwargs,
    )


def test_runner_completes_simple_tool_loop(session):
    stub = _Stub(
        [
            _tool_use("add_numbers", {"a": 1, "b": 2}),
            _final('{"answer": "3"}'),
        ]
    )
    runner = AgentRunner(_registry(), client=stub, settings=_settings())
    result = runner.run(_agent(["add_numbers"]), user_input={"q": "1+2"}, session=session)
    assert result == {"answer": "3"}
    assert session.query(AgentRun).count() == 1
    run_row = session.query(AgentRun).one()
    assert run_row.status == "succeeded"
    assert session.query(ToolCall).count() == 1


def test_runner_repairs_invalid_json_once(session):
    stub = _Stub(
        [
            _final("not-json"),
            _final('{"answer": "ok"}'),
        ]
    )
    runner = AgentRunner(_registry(), client=stub, settings=_settings())
    result = runner.run(_agent(["add_numbers"]), user_input={}, session=session)
    assert result == {"answer": "ok"}


def test_runner_fails_after_two_invalid_outputs(session):
    stub = _Stub([_final("nope"), _final("still nope")])
    runner = AgentRunner(_registry(), client=stub, settings=_settings())
    with pytest.raises(AgentRunError) as exc:
        runner.run(_agent(["add_numbers"]), user_input={}, session=session)
    assert exc.value.code == "structured_output_invalid"


def test_runner_blocks_unauthorized_tool(session):
    stub = _Stub(
        [
            _tool_use("buy_domain", {"domain": "x.com"}),
            _final('{"answer": "blocked"}'),
        ]
    )
    runner = AgentRunner(_registry(), client=stub, settings=_settings())
    runner.run(_agent(["add_numbers"]), user_input={}, session=session)
    audits = session.query(AuditLog).all()
    assert any(a.decision == "unauthorized_tool" for a in audits)


def test_runner_dry_runs_purchase_tool(session):
    stub = _Stub(
        [
            _tool_use("buy_domain", {"domain": "x.com"}),
            _final('{"answer": "queued"}'),
        ]
    )
    runner = AgentRunner(_registry(), client=stub, settings=_settings(allow_domain_purchases=False))
    runner.run(
        _agent(["buy_domain"]),
        user_input={},
        session=session,
        execute=True,
    )
    tool_calls = session.query(ToolCall).all()
    assert len(tool_calls) == 1
    assert tool_calls[0].decision == "blocked_by_flag"


def test_runner_caps_iterations(session):
    # Always return tool_use → forces hitting the cap
    responses = [_tool_use("add_numbers", {"a": 1, "b": 1}, block_id=f"tu_{i}") for i in range(10)]
    stub = _Stub(responses)
    runner = AgentRunner(_registry(), client=stub, settings=_settings())
    with pytest.raises(AgentRunError) as exc:
        runner.run(_agent(["add_numbers"]), user_input={}, session=session)
    assert exc.value.code == "max_iterations_exceeded"
