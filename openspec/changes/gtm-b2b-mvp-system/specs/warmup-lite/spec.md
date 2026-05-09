## ADDED Requirements

### Requirement: Warmup operates only on owned domains in `dns_verified` state
The system SHALL select warmup pairs only from `PurchasedDomain` rows whose `status` is `dns_verified` and whose owner is the same `Company`. The system SHALL NOT send warmup mail to any address outside owned domains or explicitly configured seed accounts.

#### Scenario: Pair selection from owned domains
- **WHEN** `POST /warmup/run` is called for a company with two `dns_verified` domains A and B
- **THEN** the system selects pairs (A→B) and (B→A) and creates a warmup email per pair.

#### Scenario: Single domain available
- **WHEN** only one `dns_verified` domain exists and no seed accounts are configured
- **THEN** the system returns HTTP 409 with code `no_warmup_pairs` and writes no interactions.

### Requirement: Daily warmup volume cap
The system SHALL cap warmup volume per domain to between 2 and 6 emails per day in normal mode. In `accelerated` demo mode the system MAY compress delays but SHALL NOT exceed the daily cap.

#### Scenario: Cap reached
- **WHEN** a domain has already sent 6 warmup emails in the rolling 24h window
- **THEN** new warmup runs for that domain skip it and record an `AuditLog` entry with `decision=warmup_cap_reached`.

### Requirement: Auto-reply and interaction logging
The system SHALL receive Mailgun inbound webhooks for warmup addresses, generate a contextual auto-reply through the Warmup Lite Agent, send the reply, and persist both directions as `WarmupInteraction` rows linked to a `mailgun_message_id`.

#### Scenario: Inbound triggers reply
- **WHEN** Mailgun delivers an inbound email from B to A's warmup address
- **THEN** the system creates a `WarmupInteraction` row for the inbound, generates a reply, sends it via Mailgun, and writes a second `WarmupInteraction` row with `interaction_type=reply` and `reply_to_message_id` referencing the inbound message.

#### Scenario: Open/click simulation in demo
- **WHEN** the demo runs in `dry_run` or `accelerated` mode
- **THEN** the system writes simulated `opened_simulated=true` and `clicked_internal_link` flags on selected interactions to make the demo visually meaningful, without simulating these in production-like runs.

### Requirement: Pause domain on negative deliverability signals
The system SHALL pause a domain (set `PurchasedDomain.status=paused`) when any of the following occur during warmup: a hard bounce, a complaint, a Mailgun failure event, or three consecutive soft bounces within 24h.

#### Scenario: Hard bounce pauses the domain
- **WHEN** a Mailgun event with `event=failed` and `severity=permanent` is received for a warmup send
- **THEN** the source domain is set to `status=paused`, an `AuditLog` entry is written with `decision=warmup_paused_bounce`, and no further warmup sends occur from that domain until manual resume.

### Requirement: Mark domain `active_for_demo` after a clean cycle
The system SHALL mark a domain as `active_for_demo` once it completes a configurable warmup cycle (default: at least 4 successful sends, 2 successful replies, 0 failures) so downstream campaign sends can use it.

#### Scenario: Successful warmup completion
- **WHEN** a domain reaches the configured thresholds without any pause condition
- **THEN** `PurchasedDomain.status` transitions to `active_for_demo` and `GET /warmup/status/{domain_id}` returns the summary metrics.
