## ADDED Requirements

### Requirement: Centralized safety service governs dangerous operations
The system SHALL provide `app/core/safety.py` as the single source of truth for feature flags and operational caps, and every code path that triggers a side effect classified as `purchase`, `send_email`, or `external_write` SHALL call the safety service before executing.

#### Scenario: Safety check denies a purchase
- **WHEN** a tool with `side_effect_level=purchase` is invoked while `ALLOW_DOMAIN_PURCHASES=false`
- **THEN** the safety service returns `denied`, the tool returns a simulated `dry_run` result, and an `AuditLog` row is written with `decision=blocked_by_flag` and `flag=ALLOW_DOMAIN_PURCHASES`.

#### Scenario: Safety check allows a send
- **WHEN** a `send_email` tool is invoked with `ALLOW_COLD_EMAILS=true`, `execute=true`, source domain `active_for_demo`, and contact not suppressed
- **THEN** the safety service returns `allowed` and the tool proceeds.

### Requirement: Dry-run is the default for the CLI and dangerous endpoints
The CLI subcommands that trigger external writes (`domains purchase`, `dns configure`, `warmup run`, `campaign send`, `demo run-end-to-end`) SHALL default to `--dry-run`, and the corresponding API endpoints SHALL default `execute=false` when the field is omitted.

#### Scenario: CLI command without flag
- **WHEN** the user runs `python -m cli domains purchase --company-id <id>`
- **THEN** the command runs in dry-run mode and prints a clear notice that no real purchase has been executed.

### Requirement: Hard caps enforced in code
The system SHALL hard-code an upper bound of 2 domains per company/campaign and an upper bound of USD 4 per domain. These bounds SHALL NOT be overridable upward via environment variables in this MVP.

#### Scenario: Configuration tries to exceed the cap
- **WHEN** `DOMAIN_PURCHASE_MAX_COUNT=5` is set in the environment
- **THEN** the application clamps the effective value to 2 at startup and logs a warning.

### Requirement: Audit log on every external action
The system SHALL write an `AuditLog` row for every external read or write action with at least: `actor=agent_name`, `tool_name`, `decision` (`allowed|blocked_by_flag|idempotent_skip|unauthorized_tool|warmup_paused_bounce|...`), `flag` (when applicable), `request_summary` (secrets redacted), `response_summary`, and `created_at`.

#### Scenario: Allowed Mailgun send
- **WHEN** a Mailgun send is allowed and executed
- **THEN** an `AuditLog` row with `decision=allowed` and the Mailgun message ID is written before the response is returned to the caller.

### Requirement: Webhook signature validation
The system SHALL validate the HMAC signature of every Mailgun webhook before any processing or persistence to typed tables, using `MAILGUN_WEBHOOK_SIGNING_KEY`.

#### Scenario: Invalid signature
- **WHEN** a webhook arrives with a missing or mismatching signature
- **THEN** the system responds HTTP 401, persists no typed events, and writes an `AuditLog` entry with `decision=webhook_signature_invalid`.

### Requirement: Secrets never logged
The system SHALL redact `ANTHROPIC_API_KEY`, `PORKBUN_API_KEY`, `PORKBUN_SECRET_API_KEY`, `MAILGUN_API_KEY`, and `MAILGUN_WEBHOOK_SIGNING_KEY` from all logs, persisted request payloads, and error messages.

#### Scenario: Error includes API key
- **WHEN** a request body or header that contains an API key is logged or persisted
- **THEN** the secret value is replaced by `***REDACTED***` before write.
