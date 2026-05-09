# Operations

Practical runbooks for operating the GTM B2B MVP. Read before flipping any
`ALLOW_*` flag.

## Retrying DNS verification

DNS propagation can take minutes (sometimes longer). When `configure_dns`
returns `status=dns_pending`:

```bash
# CLI:
python -m cli dns configure --domain-id <id> --execute
# or just verify (no record creation):
curl -X POST http://localhost:8000/domains/<id>/dns/verify \
     -H 'content-type: application/json' -d '{"execute": true}'
```

Re-run until `purchased_domains.status=dns_verified` (visible in
`MailgunDomain.status=active`). The retry is idempotent.

## Processing webhooks manually

Mailgun webhooks land at `POST /webhooks/mailgun/events` and
`/webhooks/mailgun/inbound`. They are validated against
`MAILGUN_WEBHOOK_SIGNING_KEY` before any typed persistence.

If Mailgun retried a webhook while we were down, the same event will
arrive again. We persist a row in `webhook_events` per delivery and
fan out into typed tables, so duplicates inflate counters slightly but
do not corrupt state. Add a unique index on
`webhook_events.raw_payload->>'event-data.id'` if dedup becomes critical.

To inspect raw payloads:

```bash
sqlite3 gtm_mvp.db "SELECT id, kind, valid_signature, processing_status FROM webhook_events ORDER BY created_at DESC LIMIT 20;"
```

## Pausing a domain

```bash
sqlite3 gtm_mvp.db "UPDATE purchased_domains SET status='paused', error_message='manual pause' WHERE id='<id>';"
```

Or via the warmup tool from a Python REPL:

```python
from app.db.session import get_session_factory
from app.tools.warmup.tools import _mark_paused

with get_session_factory()() as session:
    _mark_paused(domain_id="<id>", reason="manual", session=session)
    session.commit()
```

Send loops automatically skip any draft whose source domain is in
`paused/failed/burned`.

## Reviewing audit logs

```bash
sqlite3 gtm_mvp.db "
SELECT created_at, actor, tool_name, decision, flag
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;
"
```

Decisions you'll see:

| Decision                    | Meaning                                                |
|-----------------------------|--------------------------------------------------------|
| `allowed`                   | Real call ran                                          |
| `dry_run`                   | Simulated; no external API touched                     |
| `blocked_by_flag`           | A required `ALLOW_*` flag was off                      |
| `idempotent_skip`           | Same idempotency key already produced a result         |
| `unauthorized_tool`         | Agent tried to call a tool not in its allow-list       |
| `webhook_signature_invalid` | Mailgun webhook had a missing/wrong signature          |
| `warmup_paused_bounce`      | Domain paused after a bounce/complaint                 |
| `warmup_cap_reached`        | Daily warmup cap hit; sender skipped                   |

## Enabling real purchases

1. Confirm Porkbun account has API access enabled and credit ≥ USD 8
   (margin over our 2-domain × USD 4 budget).
2. In `.env`:
   ```
   ALLOW_DOMAIN_PURCHASES=true
   PORKBUN_API_KEY=<...>
   PORKBUN_SECRET_API_KEY=<...>
   ```
3. Restart the API process so settings reload.
4. Issue:
   ```bash
   curl -X POST http://localhost:8000/companies/<id>/domains/purchase \
        -H 'content-type: application/json' \
        -d '{"execute": true}'
   ```
5. Verify `purchased_domains.status=purchased` and the `audit_logs` row
   shows `decision=allowed`.

If something looks off, **do not retry blindly** — the idempotency key
will refuse re-registration. Inspect the audit log and Porkbun's
domain dashboard.

## Enabling real cold sends

1. Domains must be `dns_verified` AND warmed (`active_for_demo` or
   `active`).
2. Set `.env`:
   ```
   ALLOW_COLD_EMAILS=true
   MAILGUN_API_KEY=<...>
   MAILGUN_REGION=US|EU
   MAILGUN_WEBHOOK_SIGNING_KEY=<...>
   ```
3. Wire the Mailgun webhooks (one per event type) to your public URL:
   ```bash
   curl -X POST -F url=https://<your-host>/webhooks/mailgun/events \
        --user "api:$MAILGUN_API_KEY" \
        https://api.mailgun.net/v3/domains/<domain>/webhooks/delivered
   ```
   Repeat for `opened`, `clicked`, `unsubscribed`, `complained`,
   `failed`.
4. Set up an inbound route:
   ```bash
   curl --user "api:$MAILGUN_API_KEY" \
        -F priority=10 \
        -F expression="match_recipient(\".*@<domain>\")" \
        -F action="forward(\"https://<your-host>/webhooks/mailgun/inbound\")" \
        -F action="stop()" \
        https://api.mailgun.net/v3/routes
   ```
5. Send a campaign with `execute=true` and watch the `audit_logs`,
   `email_sends` and `email_events` tables.

## Emergency stop

```bash
# Disable all real actions immediately
echo "ALLOW_DOMAIN_PURCHASES=false" >> .env
echo "ALLOW_COLD_EMAILS=false" >> .env
echo "ALLOW_DEMO_EMAILS=false" >> .env
# Restart the API
```

In-flight tool calls finish; nothing new starts.
