## ADDED Requirements

### Requirement: Provision Mailgun domains for each purchased domain
The system SHALL create a Mailgun domain for each `PurchasedDomain` whose `status` reaches `purchased` (or `dry_run_planned` in dry-run), persist the Mailgun response in a `MailgunDomain` row, and store the required sending, receiving, and tracking DNS records as JSON.

#### Scenario: Real provisioning
- **WHEN** `POST /domains/{domain_id}/dns/configure` runs with `execute=true` and `ALLOW_COLD_EMAILS=true`
- **THEN** the system calls Mailgun create-domain, stores the returned DNS records in `MailgunDomain.sending_dns_records_json`, `receiving_dns_records_json`, and `tracking_dns_records_json`, and updates `PurchasedDomain.status=dns_pending`.

#### Scenario: Dry-run uses fixtures
- **WHEN** the same endpoint is called in dry-run
- **THEN** Mailgun is not called; the system stores deterministic fixture records and updates status to `dns_pending` with `source=dry_run`.

### Requirement: Materialize Mailgun DNS records in Porkbun
The system SHALL translate each Mailgun-required DNS record (SPF/TXT, DKIM/TXT or CNAME, MX for receiving when applicable, tracking CNAME, optional DMARC) into a Porkbun create-record call and SHALL persist a `DomainDnsRecord` row per record, storing the `external_record_id` returned by Porkbun.

#### Scenario: Mapping by record type
- **WHEN** Mailgun returns a `TXT` record for SPF
- **THEN** the system calls Porkbun create-record with `type=TXT`, the proper `host`, the exact `value` from Mailgun, and stores the result with `record_type=TXT`, `source=mailgun`, and `provider=porkbun`.

#### Scenario: Skip DMARC if already present
- **WHEN** Porkbun's existing records list already contains a DMARC record
- **THEN** the system does not create a duplicate and records `source=preexisting` for the existing record.

### Requirement: Verify domain in Mailgun and update status
The system SHALL call Mailgun verify-domain after creating the records and update `PurchasedDomain.status` to `dns_verified` when verification succeeds, or leave it at `dns_pending` and expose a retry endpoint when verification has not yet propagated.

#### Scenario: Verification succeeds
- **WHEN** Mailgun verify returns `state=active`
- **THEN** `PurchasedDomain.status=dns_verified`, `MailgunDomain.verified_at` is set, and the response carries the success payload.

#### Scenario: Verification not yet propagated
- **WHEN** Mailgun verify returns `state=unverified` for at least one record
- **THEN** the response is HTTP 202 with the list of pending records, status remains `dns_pending`, and `POST /domains/{domain_id}/dns/verify` can be retried.

### Requirement: Block DNS write operations without flags
The system SHALL NOT issue Porkbun create/update/delete DNS-record calls or Mailgun create/verify-domain calls unless the operation is in dry-run OR `ALLOW_COLD_EMAILS=true` is set AND the payload includes `execute=true`.

#### Scenario: Missing flag falls back to dry-run
- **WHEN** the configure endpoint is called with `execute=true` but `ALLOW_COLD_EMAILS=false`
- **THEN** no real Mailgun or Porkbun write calls are made and the system records an `AuditLog` entry with `decision=blocked_by_flag`.
