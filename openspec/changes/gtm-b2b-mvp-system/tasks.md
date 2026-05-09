## 1. Project bootstrap

- [x] 1.1 Create `pyproject.toml` with deps (fastapi, uvicorn, sqlalchemy>=2, alembic, pydantic>=2, pydantic-settings, anthropic, httpx, typer, python-dotenv, respx, pytest, pytest-asyncio, ruff)
- [x] 1.2 Add `ruff` config (line-length, target-version py311) and `pytest` config in `pyproject.toml`
- [x] 1.3 Create directory skeleton `app/{api,agents,clients,core,db,prompts,schemas,services,tools,workers}`, `cli.py`, `tests/{unit,integration,fixtures}`, `docs/`, `examples/`, `alembic/`
- [x] 1.4 Write `.env.example` with all variables listed in the prompt
- [x] 1.5 Initialize `alembic.ini` and `alembic/env.py` wired to `app/db/base.py`
- [x] 1.6 Document install/run/test/demo commands in `README.md`

## 2. API research notes

- [x] 2.1 Investigate Anthropic Python SDK (Messages API, tool use, structured outputs, retries) and note in `docs/API_RESEARCH.md`
- [x] 2.2 Investigate Porkbun REST endpoints (auth, ping, pricing, availability, register, DNS create/list/update/delete, premium pricing, base URL `https://api.porkbun.com/api/json/v3`)
- [x] 2.3 Investigate Mailgun (create domain, get DNS records, verify, send, routes, webhooks events/inbound, suppressions, US/EU base URLs, signature scheme)
- [x] 2.4 Note compliance requirements (opt-out, headers, suppressions, address footer)
- [x] 2.5 Decide REST vs MCP for Porkbun and document the decision

## 3. Settings, config and DB foundation

- [x] 3.1 Implement `app/core/settings.py` using `pydantic-settings` with all env vars
- [x] 3.2 Implement `app/core/safety.py` (flag checks, hard caps, decision returns, audit hook)
- [x] 3.3 Implement `app/db/base.py`, `app/db/session.py` (engine, session factory)
- [x] 3.4 Implement SQLAlchemy models: `Company`, `AgentRun`, `ToolCall`, `CampaignPlan`, `DomainCandidate`, `PurchasedDomain`, `DomainDnsRecord`, `MailgunDomain`, `WarmupInteraction`, `TargetCompany`, `Contact`, `Campaign`, `EmailDraft`, `EmailSend`, `EmailEvent`, `Suppression`, `WebhookEvent`, `AuditLog`
- [x] 3.5 Generate the initial Alembic migration creating all tables
- [x] 3.6 Implement Pydantic v2 schemas in `app/schemas/` mirroring agent inputs/outputs and API request/response bodies

## 4. External clients

- [x] 4.1 Implement `app/clients/anthropic_client.py` (sync wrapper around `anthropic.Anthropic`, retries on transient errors, mockable)
- [x] 4.2 Implement `app/clients/porkbun.py` with httpx, timeouts, redacted logging, methods: `ping`, `get_pricing`, `check_domain_availability`, `register_domain`, `list_domains`, `get_domain`, `create_dns_record`, `list_dns_records`, `update_dns_record`, `delete_dns_record`
- [x] 4.3 Implement `app/clients/mailgun.py` with US/EU base URL, methods: `create_domain`, `get_domain`, `verify_domain`, `get_domain_dns_records`, `send_message`, `create_route`, `list_routes`, `create_domain_webhook`, `list_domain_webhooks`, `get_suppressions`, `add_unsubscribe`, `validate_webhook_signature`
- [x] 4.4 Add unit tests for each client with `respx` mocks (success, 4xx, 5xx, timeout, signature validation)

## 5. Tool registry and agent runner

- [x] 5.1 Implement `app/tools/registry.py` defining the `Tool` dataclass with `name`, `description`, `input_schema`, `implementation`, `side_effect_level`, `requires_confirmation`, `supports_dry_run`
- [x] 5.2 Implement `app/agents/base.py` with `Agent` base class (system prompt, allowed tools, output schema, model override)
- [x] 5.3 Implement `app/agents/runner.py` (Anthropic call → tool_use loop → safety gate → tool execute → tool_result → final JSON validation → 1 repair retry → AgentRun + ToolCall persistence → MAX_TOOL_ITERATIONS + total timeout)
- [x] 5.4 Unit tests for the runner using a mock Anthropic client (multi-tool round-trip, repair retry, iteration cap, unauthorized tool, safety denial)

## 6. Domain analysis tools

- [x] 6.1 Implement tools `parse_company_input`, `extract_company_profile`, `estimate_campaign_target_count`, `estimate_internal_org_size`, `summarize_business_context`, `suggest_domain_candidates`, `save_gtm_diagnostic_result` in `app/tools/gtm/`
- [x] 6.2 Wire each tool to the registry with `side_effect_level=db_write` or `none` and `supports_dry_run=true`

## 7. Porkbun tools

- [x] 7.1 Implement Porkbun tools (`porkbun_ping`, `porkbun_get_pricing`, `porkbun_check_domain_availability`, `porkbun_register_domain`, `porkbun_list_domains`, `porkbun_get_domain`, `porkbun_create_dns_record`, `porkbun_list_dns_records`, `porkbun_update_dns_record`, `porkbun_delete_dns_record`)
- [x] 7.2 Tag `porkbun_register_domain` with `side_effect_level=purchase` and DNS write tools with `external_write`; reads with `external_read`
- [x] 7.3 Implement deterministic idempotency-key helper for register and a dry-run fixture map

## 8. Mailgun tools

- [x] 8.1 Implement Mailgun tools (`mailgun_create_domain`, `mailgun_get_domain`, `mailgun_verify_domain`, `mailgun_get_domain_dns_records`, `mailgun_send_message`, `mailgun_create_route`, `mailgun_list_routes`, `mailgun_create_domain_webhook`, `mailgun_list_domain_webhooks`, `mailgun_get_suppressions`, `mailgun_add_unsubscribe`, `mailgun_process_event_webhook`, `mailgun_process_inbound_webhook`, `mailgun_validate_webhook_signature`)
- [x] 8.2 Tag `mailgun_send_message` with `send_email`, create/verify domain with `external_write`, reads with `external_read`
- [x] 8.3 Provide deterministic dry-run fixtures for create-domain, get-DNS-records and verify

## 9. Warmup tools and research/send tools

- [x] 9.1 Implement warmup tools (`get_domains_ready_for_warmup`, `send_warmup_email`, `send_warmup_reply`, `record_warmup_interaction`, `simulate_warmup_open`, `simulate_warmup_click`, `update_domain_warmup_status`)
- [x] 9.2 Implement research/send tools (`research_target_companies`, `score_target_company`, `find_contacts_for_company`, `validate_contact`, `check_suppression`, `compose_campaign_email`, `save_email_draft`, `approve_email_batch`, `send_campaign_email`, `record_email_event`, `update_campaign_metrics`)
- [x] 9.3 Implement `ResearchProvider` interface in `app/services/research/` with `MockResearchProvider` and `CSVResearchProvider`; stub hooks for SerpAPI/Tavily/Apollo/PDL behind keys

## 10. Agents

- [x] 10.1 Author system prompts in `app/prompts/{gtm_diagnostic,domain_purchase,dns_configuration,warmup_lite,research_send}.md` derived from the `.md` instructions
- [x] 10.2 Implement `GtmDiagnosticAgent` (input → diagnostic JSON, persists Company)
- [x] 10.3 Implement `DomainPurchaseAgent` (planning + Porkbun calls + idempotency + caps)
- [x] 10.4 Implement `DnsConfigurationAgent` (Mailgun create + DNS materialization in Porkbun + verify)
- [x] 10.5 Implement `WarmupLiteAgent` (pair selection, sends, replies, pause logic, active_for_demo transition)
- [x] 10.6 Implement `ResearchAndSendAgent` (research, scoring, drafts, approval, send, suppression check)

## 11. Services and business flows

- [x] 11.1 Implement `services/diagnostic_service.py` orchestrating the GTM agent and confirmation gate
- [x] 11.2 Implement `services/domain_service.py` (`plan_domains`, `purchase_domains`) with hard caps and price ceiling
- [x] 11.3 Implement `services/dns_service.py` (`configure_dns`, `verify_dns`, retry on propagation)
- [x] 11.4 Implement `services/warmup_service.py` (`run_warmup`, pair selection, daily caps, pause rules)
- [x] 11.5 Implement `services/research_service.py` and `services/campaign_service.py` (research, drafts, approval, send loop, suppression, metrics)
- [x] 11.6 Implement `services/webhook_service.py` (signature check, raw persistence, dispatch to typed processors)

## 12. FastAPI surface

- [x] 12.1 Implement `app/main.py` (FastAPI app, dependency wiring, CORS off, JSON logging)
- [x] 12.2 Implement `app/api/companies.py` for `POST /companies/analyze`, `POST /companies/{id}/confirm`, `GET /companies/{id}`
- [x] 12.3 Implement `app/api/domains.py` for `POST /companies/{id}/domains/plan`, `POST /companies/{id}/domains/purchase`, `GET /companies/{id}/domains`
- [x] 12.4 Implement `app/api/dns.py` for `POST /domains/{id}/dns/configure`, `POST /domains/{id}/dns/verify`
- [x] 12.5 Implement `app/api/warmup.py` for `POST /warmup/run`, `POST /warmup/run/{domain_id}`, `GET /warmup/status/{domain_id}`
- [x] 12.6 Implement `app/api/campaigns.py` for `POST /campaigns/{company_id}/research`, `POST /campaigns/{id}/drafts`, `POST /campaigns/{id}/approve`, `POST /campaigns/{id}/send`, `GET /campaigns/{id}`
- [x] 12.7 Implement `app/api/webhooks.py` for `POST /webhooks/mailgun/events`, `POST /webhooks/mailgun/inbound`
- [x] 12.8 Implement `GET /health`

## 13. CLI

- [x] 13.1 Implement `cli.py` with Typer commands: `company analyze`, `domains plan`, `domains purchase`, `dns configure`, `warmup run`, `campaign research`, `campaign send`, `demo run-end-to-end`
- [x] 13.2 Default `--dry-run=True` on every dangerous command and require an explicit `--execute` flag for real actions
- [x] 13.3 Implement `demo run-end-to-end` printing each step (analysis → confirm → plan → simulated purchase → DNS dry-run → warmup simulated → research mock → drafts → simulated send → simulated events)

## 14. Demo fixtures

- [x] 14.1 Create `examples/company_input.json` with a realistic B2B SaaS sample
- [x] 14.2 Create `examples/targets.csv` with 25–50 plausible target rows
- [x] 14.3 Create `examples/demo_seed_emails.json` with 2–3 owned warmup addresses

## 15. Tests

- [x] 15.1 Unit tests for required-domains math, hard cap of 2, and USD 4 price ceiling
- [x] 15.2 Unit tests for `core/safety` (purchase blocked, send blocked, dry-run defaults, hard caps clamping)
- [x] 15.3 Integration tests for Porkbun client (availability, pricing, register, DNS CRUD) with `respx`
- [x] 15.4 Integration tests for Mailgun client (create, verify, send, suppressions) with `respx`
- [x] 15.5 Tests for DNS record mapping from Mailgun to Porkbun (TXT/CNAME/MX/DMARC)
- [x] 15.6 Tests for Mailgun webhook signature validation (valid + invalid)
- [x] 15.7 Tests for suppression check before send and skip on paused domain
- [x] 15.8 Tests for warmup pair selection and daily cap
- [x] 15.9 Tests for agent runner (multi-tool loop, repair retry, max iterations, unauthorized tool)
- [x] 15.10 End-to-end test running `cli demo run-end-to-end --dry-run` against fixtures and asserting DB state

## 16. Documentation

- [x] 16.1 Write `docs/ARCHITECTURE.md` with diagram of agents, data flow, main tables, domain lifecycle, campaign lifecycle
- [x] 16.2 Write `docs/DEMO_RUNBOOK.md` with the exact steps to present the hackathon demo
- [x] 16.3 Write `docs/OPERATIONS.md` (DNS retry, webhook processing, pause domain, audit logs review, enabling real purchases/sends)
- [x] 16.4 Update `README.md` with install, env vars, run API, run CLI, run tests, run demo, and how to enable real actions safely

## 17. Acceptance gate

- [x] 17.1 `pip install -e .` succeeds on a clean env
- [x] 17.2 `alembic upgrade head` creates all tables
- [x] 17.3 `pytest` runs green
- [x] 17.4 `ruff check` passes (or only style-level warnings)
- [x] 17.5 `python -m cli demo run-end-to-end --input examples/company_input.json --dry-run` completes without real external calls
- [x] 17.6 No real purchase or cold email is possible without setting both the env flag and `execute=true`
