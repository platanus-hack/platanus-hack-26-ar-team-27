## ADDED Requirements

### Requirement: Pluggable research providers with mock as default
The system SHALL expose a `ResearchProvider` interface with `find_target_companies(icp)` and `find_contacts(company)` methods, SHALL ship a `MockResearchProvider` and a `CSVResearchProvider`, and SHALL select the active provider via `RESEARCH_PROVIDER` (default `mock`).

#### Scenario: Default provider in demo
- **WHEN** the demo runs without setting `RESEARCH_PROVIDER`
- **THEN** the system uses `MockResearchProvider` and produces deterministic `TargetCompany` and `Contact` rows.

#### Scenario: CSV provider loads from file
- **WHEN** `RESEARCH_PROVIDER=csv` and `--csv-path examples/targets.csv` is provided
- **THEN** the system loads target rows from the CSV, validates them, and persists them as `TargetCompany` plus `Contact` rows.

### Requirement: Score and filter target accounts
The system SHALL score each target account against the company's ICP using the Research & Send Agent and SHALL persist the score and rationale on `TargetCompany`. Accounts with score below `MIN_TARGET_SCORE` SHALL be excluded from drafting.

#### Scenario: Low-score account is skipped
- **WHEN** a `TargetCompany` is scored below the configured threshold
- **THEN** no `EmailDraft` is created for any of its contacts and the account is marked `selection_status=below_threshold`.

### Requirement: Drafts require human approval before any send
The system SHALL persist generated emails as `EmailDraft` rows with `status=pending_approval` and SHALL refuse to send any draft whose status is not `approved`.

#### Scenario: Approval flow
- **WHEN** `POST /campaigns/{id}/approve` is called with a list of draft IDs
- **THEN** those drafts move to `status=approved` and become eligible for sending; unlisted drafts stay pending.

#### Scenario: Send before approval
- **WHEN** `POST /campaigns/{id}/send` is invoked while drafts remain in `pending_approval`
- **THEN** the system sends only the approved subset, returns the count of skipped drafts in the response, and writes an `AuditLog` entry per skip.

### Requirement: Block real sends behind feature flags and domain status
The system SHALL NOT call Mailgun send-message unless ALL of the following are true: `ALLOW_COLD_EMAILS=true`, the request includes `execute=true`, the source `PurchasedDomain.status ∈ {active, active_for_demo}`, and the destination contact passes the suppression check.

#### Scenario: Flag missing → dry-run
- **WHEN** `ALLOW_COLD_EMAILS=false` and `execute=true`
- **THEN** the system simulates the send, writes an `EmailSend` row with `status=dry_run`, and records an `AuditLog` entry with `decision=blocked_by_flag`.

#### Scenario: Domain paused → skip
- **WHEN** the source domain is `status=paused` or `status=failed` or `status=burned`
- **THEN** all drafts assigned to that domain are skipped with `EmailSend.status=skipped_domain_unavailable`.

### Requirement: Suppression check is mandatory
The system SHALL query the `Suppression` table (synced from Mailgun unsubscribe/bounce/complaint webhooks plus manual entries) before any send and SHALL skip any contact whose email or domain matches a suppression entry.

#### Scenario: Suppressed contact
- **WHEN** the contact's email exists in `Suppression`
- **THEN** the send is skipped with `EmailSend.status=skipped_suppression` and an `AuditLog` entry is written with the matching suppression reason.

### Requirement: Process Mailgun events into typed tables
The system SHALL accept Mailgun event webhooks at `POST /webhooks/mailgun/events`, validate their HMAC signature using `MAILGUN_WEBHOOK_SIGNING_KEY`, persist the raw payload in `WebhookEvent`, and update `EmailEvent`, `Suppression`, and campaign metrics accordingly.

#### Scenario: Valid event updates campaign metrics
- **WHEN** a `delivered` event arrives for a known `mailgun_message_id`
- **THEN** the corresponding `EmailEvent` row is created with `event_type=delivered` and the parent `Campaign` aggregate metrics are updated.

#### Scenario: Invalid signature is rejected
- **WHEN** the HMAC signature does not match
- **THEN** the system responds HTTP 401, writes nothing to typed tables, and only logs the rejection.

#### Scenario: Unsubscribe creates suppression
- **WHEN** an `unsubscribed` or `complained` event is received
- **THEN** the system upserts a `Suppression` row for that email with the corresponding reason and timestamp.

### Requirement: Never fabricate research data
The agent SHALL mark any field it cannot ground in evidence as `unknown` or `inferred`, and SHALL NOT invent contact emails, phone numbers, titles, or company facts.

#### Scenario: Email not verified
- **WHEN** the research provider cannot return a verified email for a contact
- **THEN** the contact is saved with `email=null` and `validation_status=unverified`, and no draft is created for that contact.
