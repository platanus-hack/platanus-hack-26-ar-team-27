# team-27 Platanus Hack 26: Buenos Aires Project — GTM B2B MVP

<img src="./project-logo.png" alt="Project Logo" width="200" />

Track: 🗼 Vertical AI

team-27

- Santiago Bassi ([@santiagoBassi](https://github.com/santiagoBassi))
- Filipo Ardenghi ([@fardenghi](https://github.com/fardenghi))
- Ignacio Maruottolo ([@riboplant](https://github.com/riboplant))
- Conrado Hillar ([@conradohillar](https://github.com/conradohillar))
- Ezequiel Testoni ([@EzequielTestoni](https://github.com/EzequielTestoni))

---

## Repo layout

```
backend/        Python FastAPI service (app, alembic, tests, docs, examples, cli)
frontend/       (TBD) UI consuming the backend over HTTPS + SSE
openspec/       Spec-driven change history for the project
context/        Briefs and instructions used to generate this MVP
render.yaml     Blueprint mapping the backend service onto Render (rootDir: backend)
```

## Backend

Multi-agent Go-To-Market system for B2B startups: diagnoses the business,
plans outbound domains (uses a `owned_domain_pool` table to skip purchase),
configures DNS + Mailgun, warms domains up, researches prospects and sends
personalized emails — all traceable in Supabase Postgres and **safe by
default** (dry-run, hard caps, feature flags, X-Api-Key auth).

See **[`backend/README.md`](backend/README.md)** for install / run / test
and **[`backend/docs/FRONTEND_API.md`](backend/docs/FRONTEND_API.md)** for the
HTTP contract.

### Quickstart

```bash
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env       # then fill in keys
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### Deploy

Backend deploys to Render as a Python web service. See
`backend/docs/FRONTEND_API.md` for the API contract and the `render.yaml`
at repo root for the service definition.

## Frontend

Pendiente. Va a vivir en `frontend/`. El contrato HTTP (auth, SSE de
diagnóstico, confirmación humana, endpoints post-confirmación) está
documentado en `backend/docs/FRONTEND_API.md`.
