# Architecture

## High-level diagram

```
                          ┌──────────────────────────┐
                          │ FastAPI / Typer surface  │
                          │ (api/, cli.py)           │
                          └─────────────┬────────────┘
                                        │
                       ┌────────────────▼──────────────────┐
                       │         services/                 │
                       │ diagnostic_service · domain_service│
                       │ dns_service · warmup_service       │
                       │ campaign_service · webhook_service │
                       └─────────┬──────────────┬──────────┘
                                 │              │
                                 ▼              ▼
                       ┌──────────────┐   ┌──────────────┐
                       │ AgentRunner  │   │ Safety service│
                       │ + ToolRegistry│  │  (core/safety)│
                       └──────┬───────┘   └──────────────┘
                              │
        ┌─────────────────────┼─────────────────────────────┐
        ▼                     ▼                             ▼
┌──────────────┐      ┌──────────────┐              ┌──────────────┐
│ Anthropic    │      │ Porkbun REST │              │ Mailgun REST │
│ Messages API │      │              │              │              │
└──────────────┘      └──────────────┘              └──────────────┘

                            persistence
                       ┌──────────────────┐
                       │ SQLite (default) │
                       │  / Postgres      │
                       └──────────────────┘
```

## Agents

| Agent              | Output schema                | Allowed tools (subset)                              |
|--------------------|------------------------------|-----------------------------------------------------|
| GTM Diagnostic     | `GtmDiagnostic`              | `summarize_business_context`, `suggest_domain_candidates` |
| Domain Purchase    | `DomainPurchaseSummary`      | `porkbun_check_availability`, `porkbun_register_domain` |
| DNS Configuration  | `DnsSummary`                 | `mailgun_create_domain`, `mailgun_verify_domain`, `porkbun_create_record` |
| Warmup Lite        | `WarmupSummary`              | `get_warmup_pairs`, `send_warmup_email`, `record_reply`, `mark_domain_paused`, `mark_domain_active` |
| Research & Send    | `ResearchSendSummary`        | `find_target_companies`, `find_contacts`, `score_target_company`, `compose_campaign_email`, `save_email_draft`, `approve_email_batch`, `check_suppression`, `send_campaign_email` |

## Data flow

1. `POST /companies/analyze` → `diagnostic_service.analyze_company` →
   `Company` row with `confirmation_status=pending_user_confirmation`.
2. `POST /companies/{id}/confirm` → status flips to `confirmed`.
3. `POST /companies/{id}/domains/plan` returns `{required_domains,
   capped_domains, suggested_candidates}` based on the 1-per-25 rule
   capped at 2.
4. `POST /companies/{id}/domains/purchase` enters dry-run by default. With
   both `ALLOW_DOMAIN_PURCHASES=true` AND `execute=true` it actually
   registers via Porkbun; idempotency key is
   `sha256(company_id|domain|register)`.
5. For each `PurchasedDomain` we call Mailgun create-domain, copy the
   returned DNS records into Porkbun, then call Mailgun verify. State
   transitions: `dry_run_planned|purchased → dns_pending → dns_verified`.
6. Warmup Lite pairs verified domains and sends 2 simulated emails per
   pair, with replies. Domains complete a clean cycle → `active_for_demo`.
7. Research & Send: `MockResearchProvider`/`CSVResearchProvider`
   produce target accounts and contacts; we score, draft (status
   `pending_approval`), require approval, then send (dry-run or real
   per flags). Sends update `Campaign` aggregate metrics.
8. Mailgun event/inbound webhooks land at `/webhooks/mailgun/*`, are
   HMAC-validated, persisted as `WebhookEvent`, then dispatched to
   `EmailEvent`/`Suppression` and campaign aggregates.

## Main tables

| Table                | Purpose                                                       |
|----------------------|---------------------------------------------------------------|
| `companies`          | Diagnostic + confirmation state                               |
| `agent_runs`         | One row per agent invocation (model, status, transcript)      |
| `tool_calls`         | Per-tool execution log (request, response, decision, latency) |
| `audit_logs`         | Decision log for every external action                        |
| `campaign_plans`     | required vs capped domain count                               |
| `domain_candidates`  | Each candidate evaluated, with reason if rejected             |
| `purchased_domains`  | Lifecycle (`dry_run_planned → purchased → dns_pending → dns_verified → active_for_demo → active`) |
| `domain_dns_records` | DNS records mirrored from Mailgun into Porkbun                |
| `mailgun_domains`    | Mailgun domain state + raw DNS bundles                        |
| `warmup_interactions`| Pairwise warmup messages and replies                          |
| `target_companies` / `contacts` | Research output                                    |
| `campaigns`          | Aggregate metrics                                             |
| `email_drafts`       | Personalized drafts (`pending_approval → approved → sent/dry_run/skipped`) |
| `email_sends`        | One row per attempt                                           |
| `email_events`       | Mailgun events fanned out from webhooks                       |
| `suppressions`       | Per-email suppression list                                    |
| `webhook_events`     | Raw Mailgun webhook payloads                                  |

## Domain lifecycle

```
dry_run_planned ──► purchase_pending ──► purchased
                                          │
                                          ▼
                                      dns_pending
                                          │
                                          ▼
                                     dns_verified
                                          │
                                          ▼
                                  active_for_demo / active
                                          │
                                          ▼
                                       paused (on bounce/complaint)
                                          │
                                          ▼
                                       burned
                                       failed
```

## Campaign lifecycle

```
researching → ready_to_draft → drafts_pending → approved → dry_run_sent / sent
```
