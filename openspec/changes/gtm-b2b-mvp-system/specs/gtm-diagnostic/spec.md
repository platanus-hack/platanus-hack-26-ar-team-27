## ADDED Requirements

### Requirement: Analyze company input and produce structured diagnostic
The system SHALL accept a B2B company description (text and optional files) and produce a structured GTM diagnostic that captures company name, business context summary, ICP description, target company count, internal organization size range, and suggested domain candidates.

#### Scenario: Diagnostic from text-only input
- **WHEN** a user POSTs a company description via `POST /companies/analyze`
- **THEN** the system invokes the GTM Diagnostic Agent and returns a JSON payload validated by the `GtmDiagnostic` Pydantic schema containing `company_name`, `business_context_summary`, `icp_description`, `campaign_target_company_count` (int ≥ 0), `internal_company_size_range` (one of `solo|2-10|11-50|51-200|201+|unknown`), and `suggested_domain_names` (list of kebab-case strings).

#### Scenario: Diagnostic from text plus uploaded files
- **WHEN** the request includes file attachments (PDFs, markdown, plain text)
- **THEN** the agent ingests the files as additional context and lists each file under `source_files_metadata` in the persisted `Company` row.

### Requirement: Persist every diagnostic run
The system SHALL persist the result of each diagnostic invocation in the `Company` table with `confirmation_status=pending_user_confirmation`, the raw input, the agent's structured output, and a reference to the `AgentRun` record that produced it.

#### Scenario: Successful run is queryable
- **WHEN** a diagnostic completes successfully
- **THEN** `GET /companies/{company_id}` returns the saved diagnostic with all fields and an `agent_run_id` linking to the corresponding `AgentRun` row.

#### Scenario: Failed agent run is also persisted
- **WHEN** the agent fails to produce a valid Pydantic-validated output after one repair attempt
- **THEN** the `AgentRun` row is saved with `status=failed` and `error_message` populated, and the API responds with HTTP 422 and a controlled error body.

### Requirement: Confirmation gate before downstream actions
The system SHALL refuse domain planning, purchase, DNS, warmup, research, or send operations for any company whose `confirmation_status` is not `confirmed`.

#### Scenario: User confirms diagnostic
- **WHEN** the user POSTs to `/companies/{company_id}/confirm` with optional field overrides
- **THEN** the system updates the company's fields, sets `confirmation_status=confirmed`, and unlocks downstream endpoints.

#### Scenario: Downstream call before confirmation
- **WHEN** a client calls any downstream endpoint while `confirmation_status` is not `confirmed`
- **THEN** the API responds with HTTP 409 and an error code `company_not_confirmed`.

### Requirement: Never invent unverified data
The agent SHALL mark any field it cannot ground in the input as `unknown` or annotate it as `inferred=true`, and SHALL NOT fabricate company-specific facts.

#### Scenario: Missing internal team size
- **WHEN** the input does not mention team size
- **THEN** `internal_company_size_range` is set to `unknown` and a note is added to `business_context_summary` explaining the gap.
