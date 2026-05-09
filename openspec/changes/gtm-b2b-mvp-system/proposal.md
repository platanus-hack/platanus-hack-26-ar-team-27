## Why

Necesitamos un MVP demostrable de un sistema GTM B2B multi-agente que tome el contexto de una empresa con MVP, planifique una campaña outbound, compre dominios, configure DNS+Mailgun, haga warmup, investigue prospects y envíe emails personalizados — todo trazable en DB y seguro por defecto (dry-run, flags). El proyecto se presenta en un hackathon, por lo que debe ser ejecutable end-to-end sin API keys reales, pero diseñado para evolucionar a producción detrás de feature flags.

## What Changes

- Nuevo proyecto Python 3.11+ con FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, Typer CLI, pytest, ruff y Anthropic SDK.
- Implementación de cinco agentes: GTM Diagnostic, Domain Purchase (Porkbun), DNS Configuration, Warmup Lite (Mailgun), Research & Send.
- Capa genérica de agent-runner con tool use, registro de tools con metadata de seguridad (`side_effect_level`, `requires_confirmation`, `supports_dry_run`).
- Clientes HTTP envueltos sobre `httpx` para Porkbun y Mailgun, y wrapper para Anthropic SDK.
- Modelo de datos persistente en SQLite (compatible PostgreSQL) con tablas para Company, AgentRun, ToolCall, PurchasedDomain, DomainDnsRecord, MailgunDomain, WarmupInteraction, Campaign, EmailDraft, EmailSend, EmailEvent, Suppression, WebhookEvent, AuditLog.
- Endpoints FastAPI para diagnóstico, compra de dominios, DNS, warmup, campañas y webhooks Mailgun.
- CLI Typer con subcomandos por flujo y un comando `demo run-end-to-end --dry-run`.
- Guardrails de seguridad codificados (no solo en prompts): `ALLOW_DOMAIN_PURCHASES`, `ALLOW_COLD_EMAILS`, `ALLOW_DEMO_EMAILS`, hard-cap 2 dominios, precio máximo USD 4, suppression check obligatorio, AuditLog en cada acción externa.
- Documentación: `README.md`, `docs/API_RESEARCH.md`, `docs/ARCHITECTURE.md`, `docs/DEMO_RUNBOOK.md`, `docs/OPERATIONS.md`.
- Tests unitarios e integración con HTTP mocks (`respx`); ningún test toca APIs reales.
- Fixtures de demo en `examples/` (`company_input.json`, `targets.csv`, `demo_seed_emails.json`).

## Capabilities

### New Capabilities
- `gtm-diagnostic`: Análisis de empresa B2B y propuesta confirmable de campaña (ICP, target count, tamaño interno, sugerencias de dominio).
- `domain-purchase`: Cálculo, validación y compra de dominios outbound vía Porkbun, con caps duros, precio máximo y modo dry-run.
- `dns-configuration`: Provisioning de dominios en Mailgun y materialización de DNS records en Porkbun, incluyendo verificación.
- `warmup-lite`: Tráfico controlado entre dominios propios usando Mailgun para calentar reputación.
- `research-and-send`: Research de target accounts (mock/CSV/proveedores), composición de drafts, aprobación humana y envío vía Mailgun con respeto a suppressions.
- `agent-runtime`: Plataforma común de agent runner, tool registry y persistencia de AgentRun/ToolCall sobre Anthropic SDK.
- `safety-guardrails`: Capa transversal de feature flags, dry-run defaults, audit logging y validaciones que bloquean acciones peligrosas.

### Modified Capabilities
<!-- No existing specs. -->

## Impact

- Crea todo el código bajo `app/`, `cli.py`, `alembic/`, `tests/`, `docs/`, `examples/` y archivos raíz (`pyproject.toml`, `alembic.ini`, `.env.example`, `README.md`).
- Introduce dependencias externas: Anthropic, Porkbun, Mailgun. Todas accionables en dry-run, opt-in vía flags para producción.
- Define superficie de webhooks pública (`/webhooks/mailgun/events`, `/webhooks/mailgun/inbound`) con validación de firma.
- Persistencia en SQLite por defecto (`gtm_mvp.db`); migraciones Alembic preparadas para PostgreSQL.
- Sin cambios a infraestructura compartida; el sistema es autónomo y se ejecuta localmente.
