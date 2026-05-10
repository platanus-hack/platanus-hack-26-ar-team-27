# GTM B2B MVP - team-27 / Platanus Hack 26 Buenos Aires

<img src="./project-logo.png" alt="Project Logo" width="200" />

**Track:** Vertical AI

**Equipo:**

- Santiago Bassi ([@santiagoBassi](https://github.com/santiagoBassi))
- Filipo Ardenghi ([@fardenghi](https://github.com/fardenghi))
- Ignacio Maruottolo ([@riboplant](https://github.com/riboplant))
- Conrado Hillar ([@conradohillar](https://github.com/conradohillar))
- Ezequiel Testoni ([@EzequielTestoni](https://github.com/EzequielTestoni))

---

## Resumen

**GTM B2B MVP es un sistema multi-agente que convierte un pitch crudo de una startup B2B en una operación outbound lista para ejecutar.**

El flujo cubre diagnóstico comercial, definición de ICP, planificación de dominios, configuración DNS, Mailgun, warmup, research de cuentas, redacción de emails personalizados, aprobación humana, tracking por webhooks y publicación de un blog editorial en Vercel bajo `blog.<dominio>`.

Lo importante no es solo que automatiza una demo vistosa. El repo implementa una arquitectura de producto seria: runtime agentivo propio, tool-use estructurado, auditoría persistente, guardrails codificados fuera del prompt, migraciones versionadas, API/CLI compartiendo la misma capa de servicios, frontend con progreso en vivo y tests que mockean proveedores externos.

En términos prácticos: lo que normalmente requiere una combinación de SDR, growth engineer, deliverability specialist, copywriter y ops engineer queda modelado como un pipeline verificable, extensible y safe-by-default.

---

## Problema

Lanzar outbound B2B desde cero suele tomar semanas:

- Entender la empresa, su ICP y su propuesta de valor.
- Comprar o asignar dominios dedicados a outbound.
- Configurar DNS, SPF, DKIM, DMARC, MX y tracking.
- Conectar Mailgun y validar la infraestructura de envío.
- Calentar dominios antes de usarlos en campañas.
- Investigar cuentas objetivo y contactos relevantes.
- Redactar mensajes personalizados y aprobarlos.
- Monitorear entregas, rebotes, quejas y respuestas.

Las startups early-stage no suelen tener el tiempo ni el conocimiento operativo para ejecutar todo esto bien. Las herramientas existentes resuelven fragmentos aislados del problema. Este proyecto cierra el loop completo.

---

## Qué Hace

De punta a punta, el sistema ejecuta este lifecycle:

```text
pitch / archivos
  -> diagnostico GTM
  -> confirmacion humana
  -> plan de dominios
  -> compra o asignacion segura
  -> DNS + Mailgun
  -> warmup lite
  -> research web de prospects
  -> drafts personalizados
  -> aprobacion
  -> envio dry-run o real
  -> webhooks + metricas
  -> blog editorial en Vercel
```

El resultado es un GTM launchpad completo: infraestructura, contenido, prospects, mensajes y trazabilidad.

---

## Por Qué Destaca

Este repo tiene varias decisiones que lo hacen técnicamente más interesante que un MVP lineal:

- **Runtime multi-agente propio:** no delega la orquestación a un framework opaco. `AgentRunner` maneja Anthropic Messages API, tool calls, reintentos de structured output, persistencia de transcript y límites de iteración.
- **Tools con metadata de seguridad:** cada tool declara su `side_effect_level`, y el runtime decide si ejecuta, bloquea o simula. El modelo nunca tiene la última palabra sobre acciones peligrosas.
- **Safety fuera del prompt:** compras, envíos y writes externos pasan por `app/core/safety.py`, con flags explícitos, hard caps, dry-run y audit log.
- **Persistencia diseñada para inspección:** `agent_runs`, `tool_calls`, `audit_logs`, `email_events`, `webhook_events` y estados de dominio/campaña permiten reconstruir qué decidió cada agente y por qué.
- **API y CLI comparten servicios:** FastAPI y Typer no duplican lógica. Ambos entran por `services/`, lo que hace que la demo CLI y la experiencia web ejerciten el mismo sistema.
- **Frontend con progreso agentivo:** la UI no es un formulario estático. Renderiza fases, consola, artefactos y visualizadores por agente mientras se ejecuta el pipeline.
- **Integraciones reales encapsuladas:** Anthropic, Porkbun, Spaceship, Mailgun y Vercel están aislados en `clients/` y cubiertos con mocks HTTP o stubs locales.
- **Documentación operativa real:** además del README, hay arquitectura, runbook de demo, operaciones, contrato frontend/backend y specs OpenSpec.

---

## Arquitectura

```text
                +--------------------------------+
                | Next.js Frontend               |
                | landing / onboarding / stage   |
                | dashboard / email preview      |
                +----------------+---------------+
                                 |
                                 | HTTP + SSE
                                 v
                +--------------------------------+
                | FastAPI API + Typer CLI         |
                | auth X-Api-Key / stream tokens |
                +----------------+---------------+
                                 |
                                 v
                +--------------------------------+
                | services/                      |
                | diagnostic / domain / dns      |
                | warmup / campaign / blog       |
                | webhook / attachment           |
                +----------+-------------+-------+
                           |             |
                           v             v
                +----------------+   +----------------+
                | AgentRunner    |   | SafetyService  |
                | ToolRegistry   |   | flags / caps   |
                | Pydantic I/O   |   | audit log      |
                +--------+-------+   +----------------+
                         |
       +-----------------+-----------------+------------------+
       v                 v                 v                  v
+-------------+   +-------------+   +-------------+    +-------------+
| Anthropic   |   | Porkbun /   |   | Mailgun     |    | Vercel      |
| tool use    |   | Spaceship   |   | domains +   |    | deployments |
| web tools   |   | DNS / reg   |   | webhooks    |    | custom host |
+-------------+   +-------------+   +-------------+    +-------------+
                         |
                         v
                +----------------+
                | SQLAlchemy DB  |
                | SQLite local   |
                | Postgres prod  |
                +----------------+
```

---

## Agentes y Subsistemas

| Componente | Responsabilidad | Evidencia en código |
|---|---|---|
| **GTM Diagnostic** | Analiza input de la empresa, extrae ICP, países objetivo, propuesta de valor y dominios sugeridos. | `backend/app/agents/gtm_diagnostic.py`, `backend/app/services/diagnostic_service.py` |
| **Domain Purchase** | Calcula cantidad necesaria, evalúa candidatos, aplica caps y compra/asigna dominios. | `backend/app/agents/domain_purchase.py`, `backend/app/services/domain_service.py` |
| **DNS Configuration** | Crea dominio en Mailgun, mapea registros DNS y verifica estado. | `backend/app/agents/dns_configuration.py`, `backend/app/services/dns_service.py` |
| **Warmup Lite** | Simula o ejecuta interacciones de warmup entre dominios, con caps y estados. | `backend/app/agents/warmup_lite.py`, `backend/app/services/warmup_service.py` |
| **Research & Send** | Investiga empresas, puntúa fit, genera drafts, aprueba y envía campañas. | `backend/app/agents/research_send.py`, `backend/app/services/campaign_service.py` |
| **Blog Publisher** | Genera research editorial, HTML custom, deploy a Vercel y CNAME en `blog.<dominio>`. | `backend/app/services/blog_service.py`, `backend/app/services/blog_research_service.py` |
| **Webhook Processor** | Valida HMAC de Mailgun, persiste eventos, actualiza métricas y suppressions. | `backend/app/api/webhooks.py`, `backend/app/services/webhook_service.py` |

---

## Profundidad Técnica

### Agent Runtime

El corazón del backend está en `backend/app/agents/runner.py`:

- Ejecuta loops de Anthropic `messages.create` con tool-use manual.
- Inyecta `tool_result` de vuelta al modelo hasta obtener output final.
- Valida la respuesta final contra schemas Pydantic.
- Hace un repair attempt si el modelo devuelve JSON inválido.
- Persiste transcript, tool calls, latencia, payloads redacted y estado final.
- Aplica `MAX_TOOL_ITERATIONS` y timeout total para evitar loops.

Esto permite que agregar un agente nuevo sea una operación acotada: prompt, schema de salida y lista de tools permitidas.

### Safety y Auditoría

El sistema asume que un agente puede equivocarse. Por eso las reglas críticas viven en código:

- `execute=true` es obligatorio para acciones reales.
- `ALLOW_DOMAIN_PURCHASES`, `ALLOW_COLD_EMAILS`, `ALLOW_DEMO_EMAILS` y `ALLOW_BLOG_PUBLISH` separan capacidades peligrosas.
- Máximo 2 dominios por campaña.
- Máximo USD 4 por dominio.
- Envíos saltan dominios `paused`, `failed` o `burned`.
- Suppression checks obligatorios antes de enviar.
- Webhooks de Mailgun se validan con HMAC-SHA256 antes de persistir eventos.
- Todo efecto externo queda registrado en `audit_logs` y `tool_calls`.

### Modelo de Datos

El backend define 20 modelos SQLAlchemy en `backend/app/db/models.py`, cubriendo:

- Empresas, diagnósticos y confirmación humana.
- Agent runs, transcripts y tool calls.
- Planes de campaña, candidatos y dominios comprados/asignados.
- DNS records, dominios Mailgun y warmup interactions.
- Target companies, contacts, campaigns, drafts y sends.
- Eventos, suppressions, webhooks y auditoría.
- Publicaciones de blog y pool de dominios propios.

La persistencia local usa SQLite para demo rápida, pero el diseño es compatible con Postgres/Supabase mediante `DATABASE_URL` y Alembic.

### Streaming y UX

El frontend resuelve un detalle importante de browser security: `EventSource` no permite headers custom, por lo que la API emite un token efímero de stream:

- `POST /companies/analyze/stream-token`
- `GET /companies/analyze/stream?token=...`

La UI consume SSE, muestra progreso del análisis, y luego visualiza el pipeline completo con componentes dedicados por fase: `DiagnosticVis`, `DomainVis`, `DNSVis`, `WarmupVis`, `ResearchVis`, `Console` y `PhaseRibbon`.

### Research y Contenido

El proyecto no se limita a cold email. También genera un activo de contenido para la empresa:

- Brief editorial desde el diagnóstico.
- Enriquecimiento opcional con Anthropic `web_search` y `web_fetch`.
- HTML single-page con diseño custom.
- Deploy vía Vercel REST API.
- CNAME en Spaceship hacia `cname.vercel-dns.com`.
- Persistencia del estado y URLs en `blog_publications`.

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Framer Motion, Lucide |
| UI runtime | SSE con tokens efímeros, dashboard por fases, consola y artefactos |
| Backend API | FastAPI, Pydantic v2, `X-Api-Key`, multipart uploads |
| CLI | Typer + Rich, compartiendo servicios con FastAPI |
| Agentes | Anthropic SDK, tool use estructurado, web search/web fetch |
| Persistencia | SQLAlchemy 2.x, Alembic, SQLite local, Postgres/Supabase configurable |
| DNS / dominios | Porkbun REST, Spaceship REST, pool de dominios propios |
| Email | Mailgun domains, sends, inbound/events webhooks, HMAC verification |
| Blog deploy | Vercel REST API, custom domain `blog.<dominio>` |
| Testing | pytest, pytest-asyncio, respx, SQLite in-memory, mocks de APIs externas |
| Calidad | Ruff, typed Pydantic schemas, specs OpenSpec, docs operativas |
| Deploy | Render backend blueprint, frontend Next.js deployable en Vercel, blog vía Vercel REST |

---

## Flujo de Estados

### Dominio

```text
dry_run_planned -> purchase_pending -> purchased
                                      -> dns_pending
                                      -> dns_verified
                                      -> active_for_demo / active
                                      -> paused -> burned
                                      -> failed
```

### Campaña

```text
researching -> ready_to_draft -> drafts_pending -> approved -> dry_run_sent / sent
```

### Blog

```text
draft -> dry_run / deployed / failed
```

---

## Evidencia Para Evaluación Técnica

Si alguien quiere auditar rápidamente la complejidad real del proyecto, los mejores puntos de entrada son:

- `backend/app/agents/runner.py`: runtime agentivo, tool-use, structured output, persistence.
- `backend/app/tools/registry.py`: definición centralizada de tools con metadata de seguridad.
- `backend/app/core/safety.py`: guardrails reales, caps y decisiones dry-run/allowed/blocked.
- `backend/app/db/models.py`: modelo de datos completo y trazabilidad de operaciones.
- `backend/app/api/companies.py`: multipart input, stream tokens y SSE.
- `backend/app/services/campaign_service.py`: research, drafts, approvals, sends y suppressions.
- `backend/app/services/blog_service.py`: generación HTML, Vercel deploy y DNS custom.
- `backend/app/services/webhook_service.py`: procesamiento de eventos Mailgun.
- `frontend/src/components/screens/StageScreen.tsx`: orquestación visual del pipeline completo.
- `backend/tests/`: 15 módulos de tests unitarios/integración con mocks HTTP y DB in-memory.
- `openspec/changes/gtm-b2b-mvp-system/`: specs y diseño que guiaron la implementación.

---

## Tests y Confiabilidad

El repo está preparado para probar el sistema sin tocar APIs reales:

- `respx` y stubs locales mockean Anthropic, Porkbun, Spaceship, Mailgun y Vercel.
- SQLite in-memory permite tests aislados.
- Hay tests para runner, safety, DNS mapping, webhooks, attachments, blog, research y demo end-to-end.
- Los flows peligrosos pueden correrse en dry-run de forma determinística.

```bash
cd backend
pytest
ruff check .
```

---

## Quickstart

```bash
# Backend
cd backend
python3.11 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# Frontend, en otra terminal
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:3000`.

Para una demo CLI reproducible:

```bash
cd backend
python -m cli demo run-end-to-end --input examples/company_input.json
```

---

## Seguridad Operativa

Por defecto, el sistema está diseñado para demo segura:

- No compra dominios reales salvo `ALLOW_DOMAIN_PURCHASES=true` y `execute=true`.
- No envía cold emails reales salvo `ALLOW_COLD_EMAILS=true` o `ALLOW_DEMO_EMAILS=true` y `execute=true`.
- No publica blogs reales salvo `ALLOW_BLOG_PUBLISH=true` y `execute=true`.
- Mantiene hard caps aun si el entorno se configura mal.
- Registra decisiones en auditoría antes de ejecutar acciones sensibles.

Ver `backend/docs/OPERATIONS.md` para runbooks de DNS, webhooks, flags reales y emergency stop.

---

## Repo Layout

```text
backend/
  app/
    agents/       agentes concretos + AgentRunner
    api/          routers FastAPI
    clients/      Anthropic, Porkbun, Spaceship, Mailgun, Vercel
    core/         settings, safety, logging
    db/           SQLAlchemy models + sessions
    schemas/      contratos Pydantic
    services/     orquestacion de negocio
    tools/        ToolRegistry + implementaciones
  alembic/        9 migrations versionadas
  docs/           architecture, operations, API, demo runbook
  tests/          unit + integration + fixtures
  cli.py          Typer CLI

frontend/
  src/pages/      Next.js pages router
  src/components/ landing, onboarding, stage, dashboard, previews
  src/lib/        API client + types

openspec/         specs, proposal, design y tasks del sistema
context/          briefs originales de agentes y producto
render.yaml       blueprint de deploy backend en Render
```

---

## Documentación Adicional

- [`backend/README.md`](backend/README.md): instalación backend, CLI, deploy y flags.
- [`backend/docs/ARCHITECTURE.md`](backend/docs/ARCHITECTURE.md): arquitectura, agentes, tablas y data flow.
- [`backend/docs/FRONTEND_API.md`](backend/docs/FRONTEND_API.md): contrato HTTP consumido por el frontend.
- [`backend/docs/DEMO_RUNBOOK.md`](backend/docs/DEMO_RUNBOOK.md): guion de demo hackathon.
- [`backend/docs/OPERATIONS.md`](backend/docs/OPERATIONS.md): operaciones reales, webhooks, auditoría y emergency stop.
- [`openspec/changes/gtm-b2b-mvp-system/design.md`](openspec/changes/gtm-b2b-mvp-system/design.md): decisiones técnicas y trade-offs.

---

## Impacto

GTM B2B MVP apunta a un dolor real: startups que necesitan validar mercado y generar pipeline, pero no tienen SDRs, growth ops ni infraestructura de deliverability.

El producto reduce un proceso de semanas a minutos, sin ocultar las decisiones críticas. Cada paso queda modelado, auditable y repetible. Esa combinación de autonomía agentiva, control operativo y trazabilidad es lo que vuelve al proyecto más que una demo: es una base técnica clara para evolucionar hacia un producto GTM real.
