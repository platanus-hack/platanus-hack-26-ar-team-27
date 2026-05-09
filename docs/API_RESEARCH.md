# API Research

This document captures findings about the third-party APIs we integrate.
Verified against vendor documentation accessible at the time of writing
(2026-05). Endpoints and pricing change — re-validate before going live.

## 1. Anthropic Python SDK

- Package: `anthropic` (Python ≥ 3.11). Install: `pip install anthropic`.
- Auth: `ANTHROPIC_API_KEY` env var or `anthropic.Anthropic(api_key=...)`.
- Primary call: `client.messages.create(model=..., max_tokens=..., system=..., tools=[...], messages=[...])`.
- Tool use:
  - Pass `tools=[{ "name": "...", "description": "...", "input_schema": {...} }]`.
  - The model returns content blocks; when a `type=tool_use` block appears,
    we execute the named tool locally and send back a follow-up
    `messages.create` whose final user message contains
    `[{"type": "tool_result", "tool_use_id": "...", "content": "..."}]`.
  - Loop continues until the model returns no more `tool_use` blocks
    (and `stop_reason ∈ {"end_turn", "stop_sequence"}`).
- Structured outputs: there is no JSON-mode flag; we ask for JSON in the
  system prompt and validate with Pydantic. On invalid JSON we send the
  validation error back as a user message and retry once.
- Retries / timeouts: SDK supports `max_retries` and `timeout` per call.
  We default to `max_retries=2`, `timeout=60` for non-tool-loop messages
  and rely on our runner to enforce a total per-run timeout.
- Default model for the MVP: `claude-sonnet-4-5`. Override per agent via
  `Agent.model`.
- Error classes worth catching: `anthropic.APIError`, `RateLimitError`,
  `APITimeoutError`, `APIStatusError`.
- Token counting: not strictly needed for MVP; rely on `max_tokens` and
  log the response `usage` field for observability.

## 2. Porkbun

- REST base URL: `https://api.porkbun.com/api/json/v3` (configurable via
  `PORKBUN_BASE_URL`).
- Auth: every request POSTs JSON containing `apikey` and `secretapikey`
  alongside the call-specific payload. There is no header auth.
- Endpoints we use:
  - `POST /ping` — sanity check; returns `status` and your IP.
  - `POST /pricing/get` — returns a TLD → price map. We use this to
    confirm the candidate is ≤ USD 4 before registering. The endpoint
    returns USD pricing.
  - `POST /domain/checkDomain/{domain}` — availability check; returns
    `available`, `price`, `regularPrice`, `premium`. Premium domains are
    flagged here.
  - `POST /domain/register/{domain}` — registers the domain. Body
    includes `apikey`, `secretapikey`, optional `years` (default 1) and
    optional `coupon`. Returns `status`, `id`. **No native idempotency
    key** — we wrap with our own `sha256(company_id|domain|register)`
    deterministic key persisted before the call.
  - `POST /domain/listAll` — list of owned domains.
  - `POST /domain/getDomain/{domain}` — single-domain detail.
  - `POST /dns/create/{domain}` — body `{type, name, content, ttl,
    prio?}`. `type` ∈ {A, AAAA, MX, CNAME, TXT, ALIAS, NS, …}. Returns
    `id` of the created record.
  - `POST /dns/retrieve/{domain}` — list records.
  - `POST /dns/edit/{domain}/{id}` — update record.
  - `POST /dns/delete/{domain}/{id}` — delete record.
- Response convention: `{"status": "SUCCESS"|"ERROR", "message": "..."}`
  plus call-specific fields. We treat any `status != SUCCESS` as a
  client/server error.
- Premium pricing: when `premium=true` we always reject regardless of
  posted price.
- Cost / currency: USD; price is a decimal string.
- REST vs MCP: there is a community Porkbun MCP, but for auditability
  (every call recorded in our `ToolCall` table with redacted secrets) we
  use the REST API directly. Decision recorded here; revisit later if
  Porkbun ships an official MCP.

## 3. Mailgun

- REST base URL:
  - US: `https://api.mailgun.net`
  - EU: `https://api.eu.mailgun.net`
  - Configurable via `MAILGUN_BASE_URL`. We expose `MAILGUN_REGION`
    (`US`/`EU`) for convenience.
- Auth: HTTP Basic with username `api` and password `MAILGUN_API_KEY`.
- Endpoints we use (under `/v3`):
  - `POST /domains` — create a sending domain. Body includes `name`,
    `smtp_password`, `spam_action`, `web_scheme=https`, `wildcard`.
    Returns `domain` plus `sending_dns_records`, `receiving_dns_records`.
  - `GET /domains/{name}` — fetch domain status and DNS records.
  - `PUT /domains/{name}/verify` — re-runs verification.
  - `POST /{domain}/messages` — send an email. Multipart form encoded
    with `from`, `to`, `subject`, `text`, `html`, `o:tag`, `o:tracking`,
    `h:Reply-To`, `v:custom-vars`. Returns `id` (Message-Id) and
    `message`.
  - `POST /routes` — create an inbound routing rule (e.g.
    `match_recipient(".*@warmup-domain.com")` → `forward("https://...")`).
  - `GET /routes` — list routes.
  - `POST /domains/{name}/webhooks/{event}` — register a webhook URL
    per event type (`delivered`, `opened`, `clicked`, `unsubscribed`,
    `complained`, `failed`).
  - `GET /{domain}/unsubscribes`, `/bounces`, `/complaints` —
    suppression lists. We sync these into the local `Suppression` table
    on demand and via webhook events.
- Webhook signature: each Mailgun webhook payload includes a
  `signature` object `{token, timestamp, signature}`. The signature is
  `HMAC-SHA256(MAILGUN_WEBHOOK_SIGNING_KEY, timestamp + token)`. We
  validate and reject mismatches with HTTP 401 before any persistence
  beyond the raw `WebhookEvent` row.
- Inbound: a route with `forward("<our-url>")` will deliver multipart
  form data containing `recipient`, `sender`, `subject`, `body-plain`,
  `body-html`, `Message-Id`, `In-Reply-To`. We persist and respond on
  warmup.
- Tracking: `o:tracking=yes`, `o:tracking-clicks=yes`,
  `o:tracking-opens=yes`. Requires the tracking CNAME on the sending
  domain.

## 4. Compliance baseline

- Honest `From` and `Reply-To`; no header forgery.
- Mandatory unsubscribe link (`%unsubscribe_url%` token Mailgun
  expands) and physical address in the email footer.
- Suppression check before every send; respect Mailgun's automatic
  suppression on bounce/complaint.
- No sending to addresses we cannot link to a verifiable source.
- Warmup limited to owned/seed domains; never use it to mask cold
  outreach.

## 5. Decision log

- **Porkbun integration mode:** REST direct. Reasons: full control over
  retries and idempotency, every call traceable in our DB, no extra
  process to host. Revisit if/when Porkbun ships an official MCP that
  surfaces these guarantees.
- **Anthropic structured output strategy:** prompt-and-validate with one
  repair retry. JSON-mode is not required for the MVP and keeps us
  portable across model versions.
- **Mailgun region default:** US. Configurable via `MAILGUN_REGION`.
- **DMARC handling:** we add a permissive DMARC (`p=none; rua=...`)
  only when none exists; we never overwrite an existing record.
