# Demo Runbook

5-minute hackathon demo. No real money, no real emails.

## 0. Pre-demo (do this once before the day)

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env             # leave ALLOW_* flags = false
alembic upgrade head
pytest -q                        # confirm green
```

## 1. One-shot demo (30 seconds)

```bash
python -m cli demo run-end-to-end --input examples/company_input.json
```

What you'll see, in order:

1. **Company analyzed** — heuristic diagnostic (no Anthropic key needed).
2. **Diagnostic saved** — Company row with target count and ICP.
3. **User-simulated confirmation** — flips `confirmation_status=confirmed`.
4. **Domains planned** — `required_domains` and `capped_domains` (≤ 2).
5. **Compra simulada** — `PurchasedDomain` rows with `status=dry_run_planned`,
   USD 4 ceiling enforced, premium domains rejected.
6. **DNS configured** — Mailgun create-domain + Porkbun records (dry-run
   fixtures), `status=dns_verified`.
7. **Warmup lite** — pairwise sends + replies, domains promoted to
   `active_for_demo`.
8. **Research mock** — 5 target companies with score + rationale, contacts
   from CSV.
9. **Drafts generated** — one per scored contact, `pending_approval`.
10. **Approval simulated** — drafts → `approved`.
11. **Send simulated** — `EmailSend` rows with `status=dry_run` and
    simulated delivery events.

## 2. Dive into one step (60 seconds)

If asked, show:

- `sqlite3 gtm_mvp.db "SELECT decision, count(*) FROM audit_logs GROUP BY decision;"`
- `sqlite3 gtm_mvp.db "SELECT domain, status FROM purchased_domains;"`
- `sqlite3 gtm_mvp.db "SELECT subject FROM email_drafts LIMIT 3;"`

## 3. API surface (60 seconds)

```bash
uvicorn app.main:app --reload --port 8000
# in another terminal
curl http://localhost:8000/health
curl -X POST http://localhost:8000/companies/analyze \
     -H 'content-type: application/json' \
     -d @examples/company_input.json
```

## 4. Safety story (90 seconds)

Walk through `app/core/safety.py` and `app/agents/runner.py`:

- Tools declare `side_effect_level`. The runner consults
  `core.safety.evaluate(...)` BEFORE running anything tagged `purchase`,
  `send_email`, or `external_write`.
- `ALLOW_DOMAIN_PURCHASES=false` → real Porkbun register is impossible.
- `ALLOW_COLD_EMAILS=false` → real Mailgun send is impossible.
- Hard cap of 2 domains is clamped in `Settings._clamp_hard_caps`.
- Every external action writes an `AuditLog` row. Stale or invalid
  webhooks are rejected before persistence.

## 5. Talking points

- ~80 SHALL/MUST requirements modelled in OpenSpec
  (`openspec/changes/gtm-b2b-mvp-system/specs/`).
- Five agents, one runtime: a single tool registry, a single safety
  service, a single audit trail.
- Demo runs without any API key. To go live: set the relevant ALLOW_*
  flag and pass `execute=true`. Hard caps still apply.
- Easy to extend with real research providers (SerpAPI/Tavily/Apollo)
  via the `ResearchProvider` interface.

## Recovery if something goes wrong on stage

```bash
rm gtm_mvp.db
alembic upgrade head
python -m cli demo run-end-to-end --input examples/company_input.json
```
