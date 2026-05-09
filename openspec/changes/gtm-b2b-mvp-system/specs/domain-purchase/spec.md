## ADDED Requirements

### Requirement: Compute required domains using the 1-per-25 rule with a hard cap of 2
The system SHALL compute `required_domains = ceil(target_company_count / 25)` and SHALL apply a hard cap of `min(required_domains, DOMAIN_PURCHASE_MAX_COUNT)` where `DOMAIN_PURCHASE_MAX_COUNT` defaults to 2 and SHALL NOT be configurable above 2 in the MVP.

#### Scenario: 60 target companies cap at 2 domains
- **WHEN** a confirmed company has `target_company_count=60`
- **THEN** `POST /companies/{id}/domains/plan` returns `required_domains=3` and `capped_domains=2`.

#### Scenario: 12 target companies require 1 domain
- **WHEN** a confirmed company has `target_company_count=12`
- **THEN** the plan returns `required_domains=1` and `capped_domains=1`.

### Requirement: Generate and price-check domain candidates via Porkbun
The system SHALL generate domain candidates derived from the company name and the diagnostic's `suggested_domain_names`, query Porkbun for availability and pricing, and select only candidates with `available=true` and `price_usd <= DOMAIN_PURCHASE_MAX_PRICE_USD` (default 4.00).

#### Scenario: Candidate above price ceiling is rejected
- **WHEN** Porkbun returns a candidate priced at USD 12.00
- **THEN** the candidate is excluded from the selection regardless of availability and a `DomainCandidate` row is saved with `selection_status=rejected_price`.

#### Scenario: Premium domains are skipped
- **WHEN** Porkbun marks a candidate as premium
- **THEN** the system excludes it and records `selection_status=rejected_premium`.

### Requirement: Block real domain registration unless both flags align
The system SHALL NOT call Porkbun's register endpoint unless the environment flag `ALLOW_DOMAIN_PURCHASES=true` AND the request payload contains `execute=true`. Otherwise it SHALL run in dry-run mode and persist a `PurchasedDomain` row with `status=dry_run_planned`.

#### Scenario: Dry-run by default
- **WHEN** `POST /companies/{id}/domains/purchase` is called without `execute=true`
- **THEN** no Porkbun register call is issued and the response describes the simulated purchase plan.

#### Scenario: Flag set but execute missing
- **WHEN** `ALLOW_DOMAIN_PURCHASES=true` but the payload omits `execute=true`
- **THEN** the system stays in dry-run mode and writes an `AuditLog` entry with `decision=dry_run_required_execute`.

#### Scenario: Both gates open
- **WHEN** `ALLOW_DOMAIN_PURCHASES=true` and `execute=true`
- **THEN** the system registers up to `capped_domains` domains via Porkbun, persists each as `status=purchased`, and writes one `AuditLog` entry per registration with the request and response payloads (secrets redacted).

### Requirement: Use deterministic idempotency for register calls
The system SHALL compute an idempotency key as `sha256("{company_id}:{domain_candidate}:register")` and SHALL refuse to re-issue a register call if a `PurchasedDomain` with the same key already exists in `status ∈ {purchase_pending, purchased}`.

#### Scenario: Retry after success is a no-op
- **WHEN** a register call has already produced `status=purchased`
- **THEN** a retry returns the existing `PurchasedDomain` row unchanged and writes an `AuditLog` entry with `decision=idempotent_skip`.

### Requirement: Persist Porkbun interactions in full
The system SHALL persist every Porkbun call (availability, pricing, register, list) with endpoint, request body (secrets redacted), response body, status code, and latency in a `ToolCall` row linked to the active `AgentRun` and `Company`.

#### Scenario: Logging on failure
- **WHEN** Porkbun returns a 5xx error during register
- **THEN** the `ToolCall` row records the response, the `PurchasedDomain` row is set to `status=failed` with `error_message`, and the system does not retry automatically.
