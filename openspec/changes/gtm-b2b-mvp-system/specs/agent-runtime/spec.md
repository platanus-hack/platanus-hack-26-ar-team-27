## ADDED Requirements

### Requirement: Generic agent runner over Anthropic Messages API
The system SHALL provide a generic agent runner in `app/agents/runner.py` that accepts a system prompt, a structured input, an output Pydantic schema, and a list of allowed tool names; that calls Anthropic Messages API; that detects `tool_use` blocks; that executes the corresponding local tool; and that returns the model's `tool_result` until a final assistant message is produced.

#### Scenario: Tool use loop completes
- **WHEN** the model emits a `tool_use` block for an allowed tool
- **THEN** the runner invokes the tool's Python implementation, captures its output, sends it back as a `tool_result`, and continues the conversation.

#### Scenario: Final answer validated
- **WHEN** the model emits a final assistant message
- **THEN** the runner parses the JSON output, validates it against the agent's Pydantic schema, and returns the validated object.

### Requirement: Bounded tool-use iteration
The runner SHALL enforce a per-run hard limit `MAX_TOOL_ITERATIONS` (default 8) and a total timeout, and SHALL fail the run with a controlled error when either is exceeded.

#### Scenario: Iteration cap hit
- **WHEN** the model has issued 8 tool-use rounds without a final answer
- **THEN** the runner stops, persists the `AgentRun` with `status=failed` and `error_code=max_iterations_exceeded`, and returns a controlled error.

### Requirement: Single repair attempt for invalid structured outputs
The runner SHALL attempt one repair pass when the final assistant JSON fails Pydantic validation, sending the validation error back to the model. If the second attempt also fails, the runner SHALL persist the run as failed.

#### Scenario: First attempt fails, second succeeds
- **WHEN** the first JSON output fails validation but the second does not
- **THEN** the runner returns the validated object and stores both attempts in the `AgentRun.transcript`.

### Requirement: Tool registry with safety metadata
The system SHALL maintain a tool registry in `app/tools/registry.py` where every tool declares `name`, `description`, `input_schema` (JSON Schema), `implementation`, `side_effect_level` (one of `none|db_write|external_read|external_write|purchase|send_email`), `requires_confirmation` (bool), and `supports_dry_run` (bool). Each agent SHALL receive only the subset of tools it is authorized to call.

#### Scenario: Agent calls an unauthorized tool
- **WHEN** an agent emits a `tool_use` for a tool not in its authorized list
- **THEN** the runner returns an error `tool_result`, writes an `AuditLog` entry with `decision=unauthorized_tool`, and does not execute the implementation.

### Requirement: Persist every agent run and tool call
The system SHALL persist one `AgentRun` row per agent invocation (with `agent_name`, `status`, `started_at`, `finished_at`, `model`, `input_payload`, `final_output`, `error_message`) and one `ToolCall` row per tool execution (with `agent_run_id`, `tool_name`, `request_payload`, `response_payload`, `status`, `latency_ms`, `idempotency_key`).

#### Scenario: Successful run with multiple tools
- **WHEN** an agent run executes three tools and returns a valid final output
- **THEN** one `AgentRun` row and three `ToolCall` rows are written, each linked by `agent_run_id`.

### Requirement: Configurable Anthropic client
The system SHALL wrap the Anthropic Python SDK in `app/clients/anthropic_client.py`, reading `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MAX_TOKENS`, and `ANTHROPIC_TEMPERATURE` from settings, and SHALL allow tests to inject a mock client without modifying agent code.

#### Scenario: Mock client in tests
- **WHEN** a test sets the mock client on the dependency container
- **THEN** all agent runs in that test return the mock's scripted responses without performing network I/O.
