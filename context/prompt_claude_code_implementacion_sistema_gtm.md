# Prompt para Claude Code: Implementación completa del sistema GTM B2B en Python con Anthropic SDK

## Rol

Actuá como **staff/principal engineer** y como implementador principal del MVP. Tu objetivo no es solo crear scaffolding: tenés que implementar un sistema funcional en Python que orqueste agentes de Go-To-Market B2B usando el **Anthropic Python SDK**, herramientas internas, Porkbun, Mailgun y una base de datos persistente.

Este proyecto es para una demo/hackathon, pero debe quedar diseñado de forma seria para poder evolucionar después.

---

## Archivos de instrucciones que vas a recibir

Antes de escribir código, leé estos archivos `.md` y tratá su contenido como **source of truth funcional**:

```txt
instrucciones_agente_gtm_b2b_mvp.md
instrucciones_agente_comprador_dominios_porkbun_gtm.md
instrucciones_agente_warmup_lite_mailgun_gtm.md
instrucciones_agente_research_envio_gtm.md
```

También puede existir una versión antigua llamada:

```txt
instrucciones_agente_comprador_dominios_gtm.md
```

Si existe, usala solo como referencia secundaria. La fuente principal para compra de dominios debe ser la versión de Porkbun.

---

## Objetivo del sistema

Implementar un sistema multi-agente que permita:

1. Recibir el contexto de una empresa B2B con MVP.
2. Analizar el negocio y devolver una estructura confirmable por el usuario.
3. Calcular cuántos dominios se necesitan para campañas outbound.
4. Comprar dominios usando Porkbun respetando límites duros.
5. Configurar dominios en Mailgun y crear los DNS records necesarios en Porkbun.
6. Ejecutar un warmup lite entre dominios propios usando Mailgun.
7. Investigar empresas objetivo.
8. Generar emails personalizados.
9. Enviar emails controlados mediante Mailgun.
10. Guardar todo en base de datos para trazabilidad y continuidad entre agentes.

---

## Restricciones críticas del MVP

Estas restricciones son obligatorias:

```txt
- 1 dominio cada 25 empresas objetivo.
- Límite duro actual: máximo 2 dominios comprados por empresa/campaña.
- Precio máximo por dominio: USD 4.
- No comprar dominios reales salvo que ALLOW_DOMAIN_PURCHASES=true.
- No enviar cold emails reales salvo que ALLOW_COLD_EMAILS=true.
- En modo demo/dry-run, simular compras y envíos sin tocar dinero ni contactos reales.
- El warmup lite solo puede operar entre dominios propios o cuentas seed controladas.
- Nunca enviar a un contacto si está en suppression/unsubscribe/bounce/complaint.
- Nunca inventar datos de research. Si un dato no está verificado, marcarlo como unknown o inferred.
- Todos los outputs de agentes deben persistirse en DB.
- Toda tool que haga una acción externa debe loguear request, response, status, error e idempotency key si aplica.
```

---

## Stack requerido

Implementá con este stack, salvo que encuentres una razón técnica clara y la documentes:

```txt
- Python 3.11+
- anthropic Python SDK
- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic v2
- httpx
- Typer para CLI
- pytest
- respx o responses para tests HTTP
- ruff para linting
- python-dotenv para variables locales
```

Base de datos:

```txt
- Default para demo: SQLite local.
- Diseño compatible con PostgreSQL.
- Usar SQLAlchemy ORM + Alembic migrations.
```

---

## Investigación obligatoria antes de codear

Antes de implementar, investigá documentación oficial actualizada y dejá un resumen en:

```txt
docs/API_RESEARCH.md
```

Investigá, como mínimo:

```txt
1. Anthropic Python SDK:
   - instalación
   - Messages API
   - tool use
   - structured outputs si aplica
   - manejo de retries/timeouts

2. Porkbun API:
   - check availability
   - get pricing
   - register domain
   - idempotency key si está disponible o estrategia propia si no lo está
   - DNS create/list/update/delete records
   - auth con API key y secret key
   - hostname actual de API
   - límites o detalles de costo/moneda
   - si conviene usar REST directo o MCP oficial

3. Mailgun API:
   - create domain
   - get domain DNS records
   - verify domain
   - send message
   - routes para inbound email
   - webhooks de eventos
   - suppressions/unsubscribes/bounces/complaints
   - tracking open/click si aplica
   - validación de webhook signatures
   - US/EU base URLs

4. Compliance mínimo:
   - opt-out
   - headers no engañosos
   - unsubscribe/suppressions
   - address/footer si aplica
```

No hardcodees endpoints si la documentación actual dice algo distinto. Usá la documentación oficial actual como fuente de verdad.

---

## Entregables esperados

Al terminar, el repo debe contener:

```txt
README.md
.env.example
pyproject.toml
alembic.ini
alembic/
app/
  main.py
  api/
  agents/
  clients/
  core/
  db/
  prompts/
  schemas/
  services/
  tools/
  workers/
cli.py
docs/
  API_RESEARCH.md
  ARCHITECTURE.md
  DEMO_RUNBOOK.md
  OPERATIONS.md
tests/
  unit/
  integration/
  fixtures/
```

También debe haber comandos claros para:

```txt
- instalar dependencias
- correr migraciones
- ejecutar la API
- correr el CLI
- correr tests
- ejecutar demo end-to-end en dry-run
```

---

## Arquitectura esperada

### 1. API FastAPI

Crear endpoints mínimos:

```txt
POST /companies/analyze
POST /companies/{company_id}/confirm
GET  /companies/{company_id}

POST /companies/{company_id}/domains/plan
POST /companies/{company_id}/domains/purchase
GET  /companies/{company_id}/domains

POST /domains/{domain_id}/dns/configure
POST /domains/{domain_id}/dns/verify

POST /warmup/run
POST /warmup/run/{domain_id}
GET  /warmup/status/{domain_id}

POST /campaigns/{company_id}/research
POST /campaigns/{campaign_id}/drafts
POST /campaigns/{campaign_id}/approve
POST /campaigns/{campaign_id}/send
GET  /campaigns/{campaign_id}

POST /webhooks/mailgun/events
POST /webhooks/mailgun/inbound

GET /health
```

Los endpoints que puedan comprar dominios o enviar emails reales deben respetar flags de seguridad.

---

### 2. CLI Typer

Crear un CLI para demo:

```txt
python -m cli demo run-end-to-end --input examples/company_input.json --dry-run
python -m cli company analyze --input examples/company_input.json
python -m cli domains plan --company-id <id>
python -m cli domains purchase --company-id <id> --dry-run
python -m cli dns configure --company-id <id> --dry-run
python -m cli warmup run --company-id <id> --dry-run
python -m cli campaign research --company-id <id> --dry-run
python -m cli campaign send --campaign-id <id> --dry-run
```

El comando `demo run-end-to-end` debe mostrar una demo completa sin compras reales ni emails reales por defecto.

---

## Agentes a implementar

Implementá los agentes como clases o servicios independientes, todos usando Anthropic SDK cuando necesiten razonamiento/generación de lenguaje.

### A. GTM Diagnostic Agent

Fuente: `instrucciones_agente_gtm_b2b_mvp.md`.

Responsabilidad:

```txt
- Leer input de empresa.
- Extraer nombre de empresa.
- Entender negocio.
- Identificar ICP/tipos de clientes objetivo.
- Estimar cantidad de empresas a alcanzar.
- Estimar tamaño interno de organización en rango.
- Sugerir dominios posibles para outbound.
- Devolver estructura confirmable.
```

Debe guardar en DB:

```txt
company_name
campaign_target_company_count
internal_company_size_range
business_context_summary
suggested_domain_names
confirmation_status
raw_input
source_files_metadata
agent_run_id
```

Debe devolver JSON validado por Pydantic.

---

### B. Domain Purchase Agent

Fuente: `instrucciones_agente_comprador_dominios_porkbun_gtm.md`.

Responsabilidad:

```txt
- Tomar una empresa confirmada.
- Calcular dominios necesarios: ceil(target_company_count / 25).
- Aplicar hard cap: max 2 dominios.
- Generar candidatos de dominio relacionados al nombre de la empresa.
- Consultar disponibilidad/precio en Porkbun.
- Comprar dominios disponibles <= USD 4.
- Guardar toda la info necesaria en DB.
```

Reglas:

```txt
- Si ALLOW_DOMAIN_PURCHASES=false, nunca registrar dominios reales.
- En dry-run, simular el dominio elegido y guardar status=dry_run_planned.
- Si ALLOW_DOMAIN_PURCHASES=true, requerir parámetro execute=true y registrar auditoría.
- Usar idempotency key interna por company_id + domain_candidate + operation.
- No intentar comprar más de 2 dominios.
- No comprar dominios premium o > USD 4.
```

---

### C. DNS Configuration Agent

Aunque no haya un `.md` separado para este agente, implementalo porque es necesario para el flujo completo.

Responsabilidad:

```txt
- Crear/verificar dominio en Mailgun.
- Obtener DNS records requeridos por Mailgun.
- Crear esos records en Porkbun.
- Guardar records en DB.
- Verificar el dominio en Mailgun.
- Marcar dominio como dns_verified cuando corresponda.
```

Records esperados:

```txt
- SPF/TXT
- DKIM/TXT o CNAME según Mailgun devuelva
- MX para receiving si aplica
- CNAME de tracking si aplica
- DMARC básico recomendado si no existe
```

Debe tener `dry_run` para no tocar DNS real en demo.

---

### D. Warmup Lite Agent

Fuente: `instrucciones_agente_warmup_lite_mailgun_gtm.md`.

Responsabilidad:

```txt
- Tomar dominios con status=dns_verified.
- Crear/usar emails warmup@dominio.
- Enviar pocos emails entre dominios propios.
- Responder automáticamente inbound emails.
- Registrar eventos de Mailgun.
- Simular interacciones simples cuando sea útil para demo.
- Marcar active_for_demo si el flujo termina sin bounces/failures.
```

Reglas MVP:

```txt
- Solo dominios propios o seed accounts controladas.
- No cold email real.
- Daily warmup limit bajo: 2 a 6 emails por dominio.
- Delays randomizables, pero para demo permitir modo accelerated.
- Si hay bounce/complaint/failure, pausar dominio.
```

---

### E. Research & Send Agent

Fuente: `instrucciones_agente_research_envio_gtm.md`.

Responsabilidad:

```txt
- Investigar empresas objetivo que matcheen con ICP.
- Scorear target accounts.
- Identificar contactos B2B si es posible y permitido.
- Generar emails personalizados.
- Guardar drafts.
- Requerir aprobación antes del primer envío real.
- Enviar emails por Mailgun solo desde dominios activos.
- Procesar eventos de Mailgun.
- Respetar suppressions, unsubscribes, bounces y complaints.
```

Research providers:

```txt
- Implementar una interfaz ResearchProvider.
- Implementar al menos MockResearchProvider para demo.
- Implementar CSVResearchProvider para cargar leads desde archivo.
- Dejar preparada integración opcional con proveedores como SerpAPI/Tavily/Apollo/PeopleDataLabs si existen API keys.
- No scrapear sitios que lo prohíban ni usar credenciales personales.
```

---

## Anthropic SDK y tool use

Implementá una capa genérica de agentes con tool use.

Debe existir algo como:

```txt
app/agents/base.py
app/agents/runner.py
app/tools/registry.py
```

El runner debe:

```txt
- Cargar system prompt del agente.
- Recibir input estructurado.
- Exponer tools permitidas para ese agente.
- Llamar a Anthropic Messages API.
- Detectar tool calls.
- Ejecutar tool implementations locales.
- Devolver tool results al modelo.
- Repetir hasta respuesta final.
- Validar respuesta final contra Pydantic schema.
- Guardar AgentRun y ToolCall en DB.
```

Cada tool debe tener:

```txt
name
description
input_schema JSON Schema
implementation Python
side_effect_level: none | db_write | external_read | external_write | purchase | send_email
requires_confirmation: bool
supports_dry_run: bool
```

Las tools peligrosas (`purchase`, `send_email`, `external_write`) deben bloquearse salvo flags explícitos.

---

## Tools mínimas a implementar

### Tools de análisis GTM

```txt
parse_company_input
extract_company_profile
estimate_campaign_target_count
estimate_internal_org_size
summarize_business_context
suggest_domain_candidates
save_gtm_diagnostic_result
```

### Tools Porkbun

```txt
porkbun_ping
porkbun_get_pricing
porkbun_check_domain_availability
porkbun_register_domain
porkbun_list_domains
porkbun_get_domain
porkbun_create_dns_record
porkbun_list_dns_records
porkbun_update_dns_record
porkbun_delete_dns_record
```

### Tools Mailgun

```txt
mailgun_create_domain
mailgun_get_domain
mailgun_verify_domain
mailgun_get_domain_dns_records
mailgun_send_message
mailgun_create_route
mailgun_list_routes
mailgun_create_domain_webhook
mailgun_list_domain_webhooks
mailgun_get_suppressions
mailgun_add_unsubscribe
mailgun_process_event_webhook
mailgun_process_inbound_webhook
mailgun_validate_webhook_signature
```

### Tools warmup

```txt
get_domains_ready_for_warmup
send_warmup_email
send_warmup_reply
record_warmup_interaction
simulate_warmup_open
simulate_warmup_click
update_domain_warmup_status
```

### Tools research/envío

```txt
research_target_companies
score_target_company
find_contacts_for_company
validate_contact
check_suppression
compose_campaign_email
save_email_draft
approve_email_batch
send_campaign_email
record_email_event
update_campaign_metrics
```

---

## Clientes externos

### Porkbun client

Crear `app/clients/porkbun.py`.

Requisitos:

```txt
- Usar httpx.
- Leer PORKBUN_API_KEY y PORKBUN_SECRET_API_KEY desde settings.
- Base URL configurable: PORKBUN_BASE_URL.
- Timeouts explícitos.
- Retries seguros para reads.
- No retry automático en register_domain salvo idempotencia controlada.
- Loguear status_code, request_id si existe, endpoint y error.
- Nunca loguear secrets.
```

### Mailgun client

Crear `app/clients/mailgun.py`.

Requisitos:

```txt
- Usar httpx.
- Leer MAILGUN_API_KEY, MAILGUN_BASE_URL, MAILGUN_REGION.
- Soportar US/EU base URL.
- Basic Auth según docs.
- Enviar mensajes por /v3/{domain}/messages o endpoint vigente.
- Crear/verificar dominios usando endpoint vigente.
- Crear/listar routes y webhooks.
- Validar webhook signatures.
- Procesar event/inbound payloads.
- Nunca loguear API keys ni contenido sensible innecesario.
```

### Anthropic client

Crear `app/clients/anthropic_client.py`.

Requisitos:

```txt
- Usar anthropic Python SDK.
- Leer ANTHROPIC_API_KEY y ANTHROPIC_MODEL desde settings.
- Soportar max_tokens, temperature y timeout configurables.
- Centralizar retries de errores transitorios.
- Permitir mock client para tests.
```

---

## Variables de entorno

Crear `.env.example` con:

```env
APP_ENV=local
DATABASE_URL=sqlite:///./gtm_mvp.db

ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.2

PORKBUN_API_KEY=
PORKBUN_SECRET_API_KEY=
PORKBUN_BASE_URL=https://api.porkbun.com/api/json/v3
ALLOW_DOMAIN_PURCHASES=false
DOMAIN_PURCHASE_MAX_COUNT=2
DOMAIN_PURCHASE_MAX_PRICE_USD=4.00
DOMAIN_PURCHASE_DOMAINS_PER_25_COMPANIES=1

MAILGUN_API_KEY=
MAILGUN_BASE_URL=https://api.mailgun.net
MAILGUN_REGION=US
MAILGUN_WEBHOOK_SIGNING_KEY=
ALLOW_COLD_EMAILS=false
ALLOW_DEMO_EMAILS=false
DEFAULT_FROM_LOCAL_PART=warmup

RESEARCH_PROVIDER=mock
SERPAPI_API_KEY=
TAVILY_API_KEY=
APOLLO_API_KEY=
PEOPLEDATALABS_API_KEY=

DEMO_MODE=true
LOG_LEVEL=INFO
```

Si el modelo exacto disponible cambia, elegí uno soportado por la API actual y documentalo.

---

## Modelo de datos mínimo

Implementá modelos SQLAlchemy y Pydantic schemas para, como mínimo:

```txt
Company
AgentRun
ToolCall
CampaignPlan
DomainCandidate
PurchasedDomain
DomainDnsRecord
MailgunDomain
WarmupInteraction
TargetCompany
Contact
Campaign
EmailDraft
EmailSend
EmailEvent
Suppression
WebhookEvent
AuditLog
```

Campos importantes por entidad:

### Company

```txt
id
name
raw_input
business_context_summary
internal_org_size_range
target_company_count
confirmation_status
created_at
updated_at
```

### PurchasedDomain

```txt
id
company_id
domain
status
provider=porkbun
price_usd
cost_cents
currency
porkbun_order_id
porkbun_response_json
idempotency_key
api_access_enabled
auto_renew
security_lock
warmup_email
created_at
updated_at
```

Estados sugeridos:

```txt
dry_run_planned
purchase_pending
purchased
dns_pending
dns_configured
dns_verified
warming_up
active_for_demo
active
paused
failed
burned
```

### DomainDnsRecord

```txt
id
domain_id
provider
record_type
host
name
value
priority
ttl
status
source
external_record_id
created_at
updated_at
```

### MailgunDomain

```txt
id
domain_id
mailgun_domain_name
region
status
sending_dns_records_json
receiving_dns_records_json
tracking_dns_records_json
raw_response_json
verified_at
created_at
updated_at
```

### WarmupInteraction

```txt
id
from_domain_id
to_domain_id
from_email
to_email
subject
mailgun_message_id
reply_to_message_id
interaction_type
status
opened_simulated
clicked_internal_link
raw_event_json
created_at
updated_at
```

### Campaign / EmailSend / EmailEvent

Incluir campos suficientes para:

```txt
- campaña
- target account
- contacto
- dominio emisor
- draft aprobado
- mailgun message id
- status
- delivered/opened/clicked/replied/failed/complained/unsubscribed
- timestamps
- raw payload
```

---

## Flujos de negocio

### Flujo 1: diagnóstico GTM

```txt
Input usuario + archivos opcionales
→ GTM Diagnostic Agent
→ JSON estructurado
→ guardar en DB
→ status = pending_user_confirmation
```

No avanzar a compra de dominios sin confirmación.

---

### Flujo 2: compra de dominios

```txt
Empresa confirmada
→ calcular required_domains = ceil(target_company_count / 25)
→ capped_domains = min(required_domains, 2)
→ generar candidatos
→ check disponibilidad/precio Porkbun
→ elegir dominios <= 4 USD
→ dry-run por defecto
→ compra real solo con ALLOW_DOMAIN_PURCHASES=true y execute=true
→ guardar resultados
```

---

### Flujo 3: DNS + Mailgun

```txt
Dominio comprado
→ crear dominio en Mailgun
→ obtener DNS records requeridos
→ crear records en Porkbun
→ guardar records
→ verificar en Mailgun
→ status dns_verified si pasa
```

Si la verificación tarda por propagación DNS, guardar estado intermedio y permitir retry.

---

### Flujo 4: Warmup Lite

```txt
Dominios dns_verified
→ elegir pares de dominios
→ enviar email warmup A → B
→ recibir inbound o evento
→ responder B → A
→ registrar interactions
→ simular open/click si aplica para demo
→ si no hay failures, marcar active_for_demo
```

---

### Flujo 5: Research + envío

```txt
Empresa confirmada + dominios active_for_demo/active
→ investigar empresas objetivo
→ scorear targets
→ identificar contactos
→ crear drafts personalizados
→ requerir aprobación
→ enviar con límites por dominio
→ procesar webhooks/eventos
→ actualizar métricas y suppressions
```

Por defecto, en demo usar `MockResearchProvider` y `dry_run`.

---

## Guardrails de seguridad

Implementá estos guardrails a nivel código, no solo en prompts:

```txt
- `ALLOW_DOMAIN_PURCHASES=false` bloquea cualquier registro real de dominio.
- `ALLOW_COLD_EMAILS=false` bloquea emails a contactos externos no seed.
- `ALLOW_DEMO_EMAILS=false` bloquea incluso emails seed reales.
- `dry_run=true` debe ser default en CLI y endpoints peligrosos.
- `execute=true` debe ser requerido para acciones irreversibles.
- Máximo 2 dominios por company/campaign.
- Máximo USD 4 por dominio.
- Suppression check obligatorio antes de enviar.
- No enviar a emails inválidos o sin fuente.
- No enviar si dominio no está active_for_demo o active.
- No enviar si dominio tiene status paused/failed/burned.
- No enviar si bounce_rate o complaint_rate exceden umbrales configurados.
- Registrar AuditLog en cada acción externa.
```

---

## Prompts internos de agentes

Guardá prompts en:

```txt
app/prompts/
```

Cada agente debe tener su propio prompt, derivado de los `.md` de instrucciones. No dupliques lógica crítica solo en texto: las reglas críticas también deben estar en servicios Python.

Los agentes deben devolver JSON final con schemas Pydantic. Si el JSON falla validación:

```txt
- pedir corrección al modelo una vez
- si vuelve a fallar, guardar error y devolver respuesta controlada
```

---

## Testing requerido

Crear tests para:

```txt
- cálculo de dominios requeridos
- hard cap de 2 dominios
- límite de precio de USD 4
- bloqueo de compra real sin flag
- Porkbun client con mock HTTP
- Mailgun client con mock HTTP
- DNS record mapping desde Mailgun a Porkbun
- bloqueo de envío sin ALLOW_COLD_EMAILS
- suppression check
- warmup pair selection
- webhook processing
- structured output validation de agentes
- demo end-to-end dry-run
```

Los tests no deben pegarle a APIs reales.

---

## Demo esperada

Crear archivos en `examples/`:

```txt
examples/company_input.json
examples/targets.csv
examples/demo_seed_emails.json
```

El demo end-to-end debe poder correr así:

```bash
python -m cli demo run-end-to-end --input examples/company_input.json --dry-run
```

Y debe mostrar algo como:

```txt
1. Empresa analizada
2. Diagnóstico guardado
3. Usuario simulado confirma diagnóstico
4. Dominios planificados
5. Compra simulada
6. DNS configurado en dry-run
7. Warmup lite simulado
8. Research mock generado
9. Emails draft generados
10. Envío simulado
11. Métricas/eventos simulados guardados
```

---

## Documentación requerida

### README.md

Debe explicar:

```txt
- qué hace el sistema
- arquitectura
- instalación
- variables de entorno
- cómo correr API
- cómo correr CLI
- cómo correr demo
- cómo correr tests
- cómo habilitar acciones reales de forma segura
```

### docs/API_RESEARCH.md

Debe documentar los hallazgos de APIs oficiales y links usados.

### docs/ARCHITECTURE.md

Debe incluir:

```txt
- diagrama textual de agentes
- flujo de datos
- tablas principales
- lifecycle de dominio
- lifecycle de campaña
```

### docs/DEMO_RUNBOOK.md

Debe incluir pasos exactos para presentar la demo de hackathon.

### docs/OPERATIONS.md

Debe incluir:

```txt
- cómo reintentar DNS verification
- cómo procesar webhooks
- cómo pausar dominios
- cómo revisar audit logs
- cómo habilitar compras/envíos reales
```

---

## Criterios de aceptación

Considerá terminado el trabajo solo si:

```txt
- El proyecto instala correctamente.
- `pytest` corre y pasa.
- `ruff` no reporta errores críticos.
- Alembic puede crear las tablas.
- El CLI demo end-to-end dry-run funciona.
- Los agentes pueden ejecutarse con Anthropic SDK o mock client.
- Las tools externas tienen tests con HTTP mocks.
- Las acciones peligrosas están bloqueadas por defecto.
- El sistema persiste todo en DB.
- La documentación explica cómo continuar el proyecto.
```

---

## Modo de trabajo recomendado

Trabajá en este orden:

```txt
1. Leer todos los `.md` de instrucciones.
2. Investigar APIs oficiales y escribir docs/API_RESEARCH.md.
3. Crear arquitectura y modelos de DB.
4. Crear settings/config.
5. Implementar clientes Anthropic, Porkbun y Mailgun.
6. Implementar registry de tools.
7. Implementar base agent runner con tool use.
8. Implementar agentes uno por uno.
9. Implementar FastAPI endpoints.
10. Implementar CLI demo.
11. Implementar tests.
12. Escribir README y docs.
13. Correr demo dry-run y corregir bugs.
```

No te detengas a preguntar salvo que haya un bloqueo imposible de resolver. Si falta una API key, implementá con mock/dry-run y dejá documentado cómo activar la integración real.

---

## Importante

Priorizá que el MVP sea demostrable y seguro:

```txt
- Primero dry-run end-to-end funcionando.
- Después integraciones reales detrás de flags.
- Después mejoras de research.
- Después optimización de prompts.
```

La demo debe mostrar valor aunque no haya API keys reales.

