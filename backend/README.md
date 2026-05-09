# GTM B2B MVP — backend

Multi-agent Go-To-Market system for B2B startups: diagnoses the business,
configures DNS + Mailgun on already-owned domains, warms them up, researches
prospects and sends personalized emails — all traceable in Supabase Postgres
and **safe by default** (dry-run, hard caps, feature flags, X-Api-Key auth).

A FastAPI surface and a Typer CLI orchestrate five agents (`GTM Diagnostic`,
`Domain Purchase`, `DNS Configuration`, `Warmup Lite`, `Research & Send`)
on top of a generic Anthropic-SDK runner with structured tool use. External
side effects (Spaceship DNS, Mailgun create/send) flow through a single
safety service that enforces feature flags, caps and audit logging before
any tool runs.

See:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for diagrams.
- [`docs/FRONTEND_API.md`](docs/FRONTEND_API.md) for the HTTP contract the
  frontend consumes (auth, SSE, schemas).
- [`docs/DEMO_RUNBOOK.md`](docs/DEMO_RUNBOOK.md) for the hackathon demo
  script.
- [`docs/OPERATIONS.md`](docs/OPERATIONS.md) for runbooks (DNS retry,
  webhook wiring, enabling real purchases / sends).

## Install

```bash
# from repo root
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env       # fill in keys
alembic upgrade head        # applies migrations to Supabase
```

## Run the API

```bash
uvicorn app.main:app --reload --port 8000
curl http://localhost:8000/health
```

## Run the CLI

Every dangerous command defaults to `--dry-run`. Pass `--execute` to opt
in (and only after enabling the relevant `ALLOW_*` env flag).

```bash
python -m cli company analyze --input examples/company_input.json
python -m cli domains pool add --domain investaigent.com --domain strapsite.com
python -m cli domains plan --company-id <id>
python -m cli domains purchase --company-id <id>            # dry-run / idempotent if pool seeded
python -m cli dns configure --company-id <id>               # dry-run
python -m cli warmup run --company-id <id>                  # dry-run
python -m cli campaign research --company-id <id>           # dry-run
python -m cli campaign send --campaign-id <id>              # dry-run
```

### One-shot demo (auto-pulls from owned_domain_pool if populated)

```bash
python -m cli demo run-end-to-end --input examples/company_input.json
# Real test:
python -m cli demo run-end-to-end --execute --recipient you@example.com
```

## Tests

```bash
pytest
ruff check .
```

Tests use an in-memory SQLite fixture and `respx` mocks; nothing hits real
APIs.

## Deploy (Render — Web Service manual)

**URL de producción:** https://platanus-hack-26-ar-team-27.onrender.com

`render.yaml` lives at the repo root with `rootDir: backend`. For the Free
tier (no Blueprints), create a manual Web Service in the Render panel:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Python 3 |
| Build Command | `pip install --upgrade pip && pip install -e ".[dev]"` |
| Start Command | `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1` |
| Health Check Path | `/health` |
| Plan | Free or Starter |

Then paste the env vars from your local `.env` (skip `BACKEND_API_KEY` —
generate a fresh one for production).

### Mantener vivo el servicio (Free tier)

Render Free duerme el servicio tras 15 min de inactividad. Para mantenerlo
despierto, configurá un monitor externo que pegue a `/health` cada 5 min:

- [UptimeRobot](https://uptimerobot.com) (recomendado, free, 5 min interval)
- [Cron-job.org](https://cron-job.org) (free, intervalo configurable hasta 1 min)

URL a monitorear:
```
https://platanus-hack-26-ar-team-27.onrender.com/health
```

## Enabling real actions

1. Set the relevant flag in `.env` / Render env:
   - `ALLOW_DOMAIN_PURCHASES=true` for Porkbun registrations (the deployed
     backend keeps this off and uses `owned_domain_pool` instead).
   - `ALLOW_COLD_EMAILS=true` for Mailgun sends to non-seed contacts.
   - `ALLOW_DEMO_EMAILS=true` for seed-list sends.
2. Pass `execute=true` (API) or `--execute` (CLI) on the request.
3. Hard caps still apply: max 2 domains per campaign, max USD 4 per
   domain, suppression check mandatory, paused/burned domains cannot send.

## Repo layout (inside `backend/`)

```
app/
  api/         FastAPI routers (companies, domains, dns, warmup, campaigns, webhooks, security)
  agents/      Agent base + 5 concrete agents + runner
  clients/     anthropic / porkbun / mailgun / spaceship
  core/        settings, safety, logging
  db/          SQLAlchemy models + session
  prompts/     System prompts per agent
  schemas/     Pydantic request/response/agent schemas
  services/    Business orchestration
  tools/       Tool registry + tool implementations
  workers/     Background helpers (sync for MVP)
alembic/       Migrations
tests/         unit + integration + fixtures
docs/          ARCHITECTURE / API_RESEARCH / DEMO_RUNBOOK / OPERATIONS / FRONTEND_API
examples/      Demo fixtures
cli.py         Typer CLI entrypoint
```
