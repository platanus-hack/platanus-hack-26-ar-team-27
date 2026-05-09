"""Agent runner.

Loops over Anthropic tool-use blocks, executing local tools after the
safety service approves them, until the model returns a final text
response that we validate against the agent's Pydantic output schema.

Persists every run as `AgentRun` and every executed tool as `ToolCall`.
"""
from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.agents.base import Agent
from app.clients.anthropic_client import AnthropicLike, AnthropicResponse, get_anthropic_client
from app.core.logging import get_logger, redact
from app.core.safety import Decision, SafetyEvaluation, SideEffectLevel, evaluate
from app.core.settings import Settings, get_settings
from app.db.models import AgentRun, AuditLog, ToolCall
from app.tools.registry import Tool, ToolRegistry

logger = get_logger(__name__)


class AgentRunError(RuntimeError):
    def __init__(self, message: str, code: str):
        super().__init__(message)
        self.code = code


class AgentRunner:
    def __init__(
        self,
        registry: ToolRegistry,
        *,
        client: AnthropicLike | None = None,
        settings: Settings | None = None,
    ):
        self._registry = registry
        self._client = client or get_anthropic_client()
        self._settings = settings or get_settings()

    # ------------------------------------------------------------------
    def run(
        self,
        agent: Agent,
        *,
        user_input: dict[str, Any],
        session: Session,
        company_id: str | None = None,
        execute: bool = False,
    ) -> dict[str, Any]:
        sub_registry = self._registry.subset(agent.allowed_tools)
        agent_run = AgentRun(
            agent_name=agent.name,
            company_id=company_id,
            model=agent.model or self._settings.anthropic_model,
            status="running",
            started_at=datetime.now(tz=UTC),
            input_payload=user_input,
            transcript=[],
        )
        session.add(agent_run)
        session.flush()

        try:
            output = self._run_inner(
                agent=agent,
                user_input=user_input,
                sub_registry=sub_registry,
                session=session,
                agent_run=agent_run,
                execute=execute,
            )
            agent_run.status = "succeeded"
            agent_run.final_output = output
            agent_run.finished_at = datetime.now(tz=UTC)
            session.flush()
            return output
        except AgentRunError as exc:
            agent_run.status = "failed"
            agent_run.error_code = exc.code
            agent_run.error_message = str(exc)
            agent_run.finished_at = datetime.now(tz=UTC)
            session.flush()
            raise
        except Exception as exc:  # pragma: no cover - safety net
            agent_run.status = "failed"
            agent_run.error_code = "internal_error"
            agent_run.error_message = str(exc)
            agent_run.finished_at = datetime.now(tz=UTC)
            session.flush()
            raise

    # ------------------------------------------------------------------
    def _run_inner(
        self,
        *,
        agent: Agent,
        user_input: dict[str, Any],
        sub_registry: ToolRegistry,
        session: Session,
        agent_run: AgentRun,
        execute: bool,
    ) -> dict[str, Any]:
        max_iterations = self._settings.max_tool_iterations
        total_timeout = self._settings.agent_total_timeout_seconds
        started = time.monotonic()

        messages: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": _format_initial_user_message(user_input, agent.output_schema.__name__),
            }
        ]
        repair_attempts = 0

        for iteration in range(max_iterations + 1):  # +1 because final answer iteration
            if time.monotonic() - started > total_timeout:
                raise AgentRunError("agent total timeout exceeded", "agent_timeout")

            response: AnthropicResponse = self._client.messages_create(
                model=agent.model or self._settings.anthropic_model,
                max_tokens=agent.max_tokens or self._settings.anthropic_max_tokens,
                temperature=agent.temperature if agent.temperature is not None else self._settings.anthropic_temperature,
                system=agent.system_prompt,
                messages=messages,
                tools=sub_registry.to_anthropic(),
            )
            transcript_entry = {
                "iteration": iteration,
                "stop_reason": response.stop_reason,
                "blocks": [
                    {"type": b.type, "name": b.name, "input": redact(b.input or {}), "text": (b.text or "")[:2000]}
                    for b in response.content
                ],
            }
            agent_run.transcript = (agent_run.transcript or []) + [transcript_entry]
            session.flush()

            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]
            text_blocks = [b for b in response.content if b.type == "text"]

            if tool_use_blocks:
                if iteration >= max_iterations:
                    raise AgentRunError("max tool iterations exceeded", "max_iterations_exceeded")
                assistant_content = []
                tool_results = []
                for block in response.content:
                    if block.type == "text":
                        assistant_content.append({"type": "text", "text": block.text or ""})
                    elif block.type == "tool_use":
                        assistant_content.append(
                            {
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input or {},
                            }
                        )
                        tool_result = self._execute_tool(
                            tool_name=block.name,
                            tool_use_id=block.id or "",
                            tool_input=block.input or {},
                            sub_registry=sub_registry,
                            session=session,
                            agent_run=agent_run,
                            agent=agent,
                            execute=execute,
                        )
                        tool_results.append(tool_result)
                messages.append({"role": "assistant", "content": assistant_content})
                messages.append({"role": "user", "content": tool_results})
                continue

            # No tool use → expect final answer
            text = "".join(b.text or "" for b in text_blocks)
            try:
                payload = _extract_json(text)
                validated = agent.output_schema.model_validate(payload)
                return validated.model_dump(mode="json")
            except (ValueError, ValidationError) as exc:
                if repair_attempts >= 1:
                    raise AgentRunError(
                        f"final output failed validation twice: {exc}",
                        "structured_output_invalid",
                    )
                repair_attempts += 1
                messages.append({"role": "assistant", "content": [{"type": "text", "text": text}]})
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": (
                                    "Your previous response did not match the required JSON schema. "
                                    f"Validation error: {exc}. Please respond with ONLY valid JSON "
                                    f"matching schema {agent.output_schema.__name__}."
                                ),
                            }
                        ],
                    }
                )
                continue

        raise AgentRunError("agent did not produce a final answer", "no_final_answer")

    # ------------------------------------------------------------------
    def _execute_tool(
        self,
        *,
        tool_name: str,
        tool_use_id: str,
        tool_input: dict[str, Any],
        sub_registry: ToolRegistry,
        session: Session,
        agent_run: AgentRun,
        agent: Agent,
        execute: bool,
    ) -> dict[str, Any]:
        tool: Tool | None = sub_registry.get(tool_name)
        if tool is None:
            self._record_audit(
                session,
                actor=agent.name,
                tool_name=tool_name,
                decision=Decision.UNAUTHORIZED_TOOL.value,
                flag=None,
                side_effect_level=None,
                request=tool_input,
                response={"error": "unauthorized"},
            )
            return _tool_error_result(tool_use_id, "unauthorized_tool", "this agent cannot call this tool")

        evaluation = evaluate(tool.side_effect_level, execute=execute, settings=self._settings)
        started = time.perf_counter()
        try:
            if evaluation.decision == Decision.ALLOWED:
                response = tool.implementation(**(tool_input or {}), session=session, dry_run=False)
                status = "ok"
            elif evaluation.decision == Decision.DRY_RUN:
                response = self._invoke_dry_run(tool, tool_input, session)
                status = "dry_run"
            elif evaluation.decision == Decision.BLOCKED_BY_FLAG:
                response = {
                    "blocked": True,
                    "flag": evaluation.flag,
                    "reason": evaluation.reason,
                }
                status = "blocked"
            else:
                response = {"decision": evaluation.decision.value, "reason": evaluation.reason}
                status = evaluation.decision.value
        except Exception as exc:
            latency = int((time.perf_counter() - started) * 1000)
            self._persist_tool_call(
                session=session,
                agent_run=agent_run,
                tool=tool,
                input_payload=tool_input,
                response={"error": str(exc)},
                status="error",
                decision=evaluation.decision.value,
                latency_ms=latency,
                idempotency_key=str(tool_input.get("idempotency_key") or ""),
            )
            return _tool_error_result(tool_use_id, "tool_execution_failed", str(exc))

        latency = int((time.perf_counter() - started) * 1000)
        self._persist_tool_call(
            session=session,
            agent_run=agent_run,
            tool=tool,
            input_payload=tool_input,
            response=_jsonable(response),
            status=status,
            decision=evaluation.decision.value,
            latency_ms=latency,
            idempotency_key=str(tool_input.get("idempotency_key") or ""),
        )
        if evaluation.decision in (Decision.BLOCKED_BY_FLAG, Decision.DRY_RUN):
            self._record_audit(
                session,
                actor=agent.name,
                tool_name=tool.name,
                decision=evaluation.decision.value,
                flag=evaluation.flag,
                side_effect_level=tool.side_effect_level.value,
                request=tool_input,
                response=_jsonable(response),
            )

        return {
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": json.dumps(_jsonable(response), default=str),
        }

    # ------------------------------------------------------------------
    def _invoke_dry_run(self, tool: Tool, tool_input: dict[str, Any], session: Session) -> Any:
        if not tool.supports_dry_run:
            raise RuntimeError(f"tool {tool.name} does not support dry-run")
        try:
            return tool.implementation(**(tool_input or {}), session=session, dry_run=True)
        except TypeError:
            return {"dry_run": True, "tool": tool.name, "input": tool_input}

    def _persist_tool_call(
        self,
        *,
        session: Session,
        agent_run: AgentRun,
        tool: Tool,
        input_payload: dict[str, Any],
        response: Any,
        status: str,
        decision: str,
        latency_ms: int,
        idempotency_key: str | None,
    ) -> None:
        session.add(
            ToolCall(
                agent_run_id=agent_run.id,
                tool_name=tool.name,
                request_payload=redact(input_payload),
                response_payload=response if isinstance(response, (dict, list)) else {"value": response},
                status=status,
                side_effect_level=tool.side_effect_level.value,
                decision=decision,
                latency_ms=latency_ms,
                idempotency_key=idempotency_key or None,
            )
        )
        session.flush()

    def _record_audit(
        self,
        session: Session,
        *,
        actor: str,
        tool_name: str | None,
        decision: str,
        flag: str | None,
        side_effect_level: str | None,
        request: Any,
        response: Any,
    ) -> None:
        session.add(
            AuditLog(
                actor=actor,
                tool_name=tool_name,
                decision=decision,
                flag=flag,
                side_effect_level=side_effect_level,
                request_summary=redact(request) if isinstance(request, (dict, list)) else {"value": str(request)},
                response_summary=response if isinstance(response, (dict, list)) else {"value": str(response)},
            )
        )
        session.flush()


# ----------------------------------------------------------------------
# Module-level helpers
# ----------------------------------------------------------------------


def record_audit(
    session: Session,
    *,
    actor: str,
    tool_name: str | None,
    decision: str,
    flag: str | None = None,
    side_effect_level: SideEffectLevel | None = None,
    request: Any = None,
    response: Any = None,
    note: str | None = None,
) -> AuditLog:
    """Public helper for services that act outside the runner."""
    log = AuditLog(
        actor=actor,
        tool_name=tool_name,
        decision=decision,
        flag=flag,
        side_effect_level=side_effect_level.value if side_effect_level else None,
        request_summary=redact(request) if isinstance(request, (dict, list)) else None,
        response_summary=response if isinstance(response, (dict, list)) else None,
        note=note,
    )
    session.add(log)
    session.flush()
    return log


def evaluate_for_service(side_effect: SideEffectLevel, *, execute: bool) -> SafetyEvaluation:
    return evaluate(side_effect, execute=execute)


def _tool_error_result(tool_use_id: str, code: str, msg: str) -> dict[str, Any]:
    return {
        "type": "tool_result",
        "tool_use_id": tool_use_id,
        "is_error": True,
        "content": json.dumps({"error_code": code, "message": msg}),
    }


def _format_initial_user_message(payload: dict[str, Any], schema_name: str) -> list[dict[str, Any]]:
    return [
        {
            "type": "text",
            "text": (
                f"Input payload (JSON):\n{json.dumps(payload, default=str)}\n\n"
                f"When you finish, respond with ONLY a JSON object matching the {schema_name} schema. "
                "No prose, no markdown fences."
            ),
        }
    ]


def _extract_json(text: str) -> dict[str, Any]:
    s = (text or "").strip()
    if s.startswith("```"):
        # strip code fences
        s = s.strip("`")
        if "\n" in s:
            s = s.split("\n", 1)[1]
        if s.endswith("```"):
            s = s[: -3]
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # try to find a JSON object
        start = s.find("{")
        end = s.rfind("}")
        if start >= 0 and end > start:
            return json.loads(s[start : end + 1])
        raise


def _jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return str(value)
