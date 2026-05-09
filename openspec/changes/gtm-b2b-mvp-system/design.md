## Context

El proyecto es un MVP de hackathon con vocación de continuar después de la demo. La fuente funcional son los `.md` de instrucciones (`context/instrucciones_agente_*`). El sistema orquesta cinco agentes que comparten DB, runtime de tool use sobre Anthropic Messages API y guardrails de seguridad. Las integraciones externas (Anthropic, Porkbun, Mailgun) deben funcionar en dry-run sin keys reales para que la demo no dependa de provisioning. Stack: Python 3.11+, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2, Typer, httpx, pytest, ruff. Default DB SQLite local; producción a Postgres sin reescribir modelos.

Stakeholders: equipo del hackathon (presenta), futuros operadores (activarán flags reales), futuros maintainers (extenderán agentes).

Constraints duros del producto: 1 dominio cada 25 empresas objetivo, máx 2 dominios por campaña, máx USD 4 por dominio, ningún cold email sin flag, suppressions obligatorias.

## Goals / Non-Goals

**Goals:**
- Demo end-to-end ejecutable con `python -m cli demo run-end-to-end --dry-run` sin secrets.
- Persistencia completa de cada decisión, tool call y evento externo en DB.
- Capa única de agent runtime: cualquier agente nuevo se define con system prompt + lista de tools + schema Pydantic de salida.
- Guardrails codificados a nivel servicio (no solo en el prompt).
- Tests con HTTP mocks que cubran cálculo de dominios, caps, bloqueos por flag, mapping DNS Mailgun↔Porkbun, suppression checks, validación de webhook signatures y validación structured output.
- Documentación que permita a un dev nuevo correr la demo y, por separado, activar acciones reales.

**Non-Goals:**
- No se construye UI web (solo API + CLI).
- No se implementan proveedores reales de research (solo `MockResearchProvider` y `CSVResearchProvider`; ganchos opcionales para SerpAPI/Tavily/Apollo/PDL detrás de keys).
- No se hace deliverability avanzada (ramping inteligente, ESP rotation, seed lists masivas).
- No se implementa orquestador async distribuido; los flujos largos se ejecutan in-process o como tareas Typer/FastAPI BackgroundTasks.
- No se hace billing, multi-tenant, ni autenticación de usuarios (single-tenant local).
- No se generan PDFs ni reportes; las métricas se exponen vía endpoints/CLI.

## Decisions

### D1. Anthropic SDK con tool use manual (no Managed Agents)
Implementar un runner propio en `app/agents/runner.py` que llame a `messages.create`, detecte bloques `tool_use`, ejecute la tool localmente y reinyecte `tool_result` hasta obtener respuesta final. Validar la respuesta final contra un schema Pydantic; un retry con feedback al modelo si falla validación.

**Alternativas:** Managed Agents/Computer Use SDK (más mágico, menos auditable, complica logging por tool); LangChain/LangGraph (peso/curva no justificada para 5 agentes).

**Por qué:** auditoría granular (cada `ToolCall` se persiste con request/response), control sobre seguridad (bloqueamos antes de ejecutar tools peligrosas), portabilidad si cambian modelos.

### D2. Tool registry con metadata de seguridad
Cada tool declara `name`, `description`, `input_schema`, `implementation`, `side_effect_level` (`none|db_write|external_read|external_write|purchase|send_email`), `requires_confirmation`, `supports_dry_run`. El runner consulta `core/safety.py` antes de ejecutar: si `side_effect_level ∈ {purchase, send_email, external_write}` y los flags no están activos, devuelve un `tool_result` simulado y graba `AuditLog` con `decision=blocked_by_flag`.

**Alternativas:** Decoradores ad-hoc por tool. **Por qué registry**: el modelo no decide la política, el runtime sí; los prompts no pueden saltearse el bloqueo.

### D3. Guardrails como servicio, no como prompt
`app/core/safety.py` es la fuente de verdad de los flags y caps. Los prompts mencionan las reglas pero no las imponen. Esto significa que un agente jailbreaqueado no compra dominios.

### D4. Persistencia: SQLAlchemy 2.x ORM + Alembic
SQLite por defecto (`sqlite:///./gtm_mvp.db`), URL configurable. Modelos diseñados con tipos compatibles Postgres (JSON column, UUID opcional, timestamps tz-aware). Alembic con una migración inicial que crea todas las tablas.

**Alternativas:** Plain SQL/Drizzle/Tortoise. **Por qué SQLAlchemy:** ecosistema, alembic maduro, modelos tipados con Pydantic v2 sobre el mismo schema.

### D5. Clientes HTTP con `httpx` y retries explícitas
`app/clients/{anthropic_client,porkbun,mailgun}.py`. Timeouts explícitos por endpoint, retries solo en reads (no en `register_domain` ni `messages.send` salvo idempotency key). Logs estructurados con `endpoint`, `status_code`, `request_id`, `latency_ms`; secrets nunca se loguean.

### D6. Idempotency interna para Porkbun register
Porkbun no expone idempotency key oficial. Se construye una clave determinista `idem_key = sha256(company_id + domain_candidate + "register")` y se persiste antes de la llamada; si existe un registro con `status ∈ {purchase_pending, purchased}` se aborta el reintento.

### D7. Mailgun webhooks con HMAC verification
Cada request a `/webhooks/mailgun/*` valida `signature` con `MAILGUN_WEBHOOK_SIGNING_KEY` antes de cualquier escritura. Eventos van a `WebhookEvent` (raw) y luego se procesan a tablas tipadas (`EmailEvent`, `Suppression`, `WarmupInteraction`).

### D8. Research provider strategy pattern
`ResearchProvider` interface: `find_target_companies(icp) -> list[TargetAccount]`, `find_contacts(company) -> list[Contact]`. Implementaciones: `MockResearchProvider` (datos fijos para demo), `CSVResearchProvider` (lee `examples/targets.csv`), placeholder methods para SerpAPI/Tavily/Apollo/PDL detrás de keys.

### D9. Dry-run como contrato explícito
Los endpoints peligrosos exigen `execute=true` además del flag de entorno; el CLI default `--dry-run`. En dry-run las tools externas devuelven respuestas simuladas determinísticas (fixtures por endpoint), permitiendo demo reproducible.

### D10. Modelo Anthropic configurable
`ANTHROPIC_MODEL=claude-sonnet-4-5` por defecto. Cliente acepta override por agente para futuros experimentos (ej. Opus para diagnóstico, Haiku para tools cortas). Mock client en tests para no consumir tokens.

### D11. Demo runbook end-to-end como comando único
`cli demo run-end-to-end` ejecuta diagnóstico → confirmación simulada → plan de dominios → compra simulada → DNS simulado → warmup simulado → research mock → drafts → envío simulado → eventos simulados, imprimiendo el progreso paso a paso. Esto se vuelve tanto demo como test de humo.

## Risks / Trade-offs

- **Riesgo:** El runner de tool use puede entrar en loops si el modelo nunca devuelve respuesta final. → **Mitigación:** límite duro de iteraciones (`MAX_TOOL_ITERATIONS=8`) y timeout total por agent run.
- **Riesgo:** Porkbun puede cambiar pricing/endpoints durante el hackathon. → **Mitigación:** `PORKBUN_BASE_URL` configurable, `docs/API_RESEARCH.md` registra fecha de verificación, fixtures de pricing en tests.
- **Riesgo:** Mailgun verification DNS depende de propagación; la demo puede fallar. → **Mitigación:** estado intermedio `dns_pending`, retry endpoint `/dns/verify`, dry-run path que salta verificación real.
- **Riesgo:** Compras reales accidentales por flag mal seteado. → **Mitigación:** doble check (`ALLOW_DOMAIN_PURCHASES=true` en env + `execute=true` en payload), `AuditLog` antes de cada llamada, hard cap a 2 dominios.
- **Riesgo:** Cold emails reales accidentales. → **Mitigación:** análogo a dominios + suppression check + check de `domain.status ∈ {active, active_for_demo}` antes de send.
- **Trade-off:** Sin orquestador async, flujos largos bloquean el request. → **Aceptado:** demo es síncrona; producción puede mover a Celery/RQ después.
- **Trade-off:** SQLite no soporta concurrencia alta. → **Aceptado:** demo single-user; migración a Postgres es cambio de URL.
- **Riesgo:** Los `.md` de instrucciones podrían contradecirse con el código. → **Mitigación:** prompts viven en `app/prompts/` y referencian las reglas; las reglas críticas se duplican como código en `core/safety.py`. Revisión cruzada en PR.

## Migration Plan

No hay sistema previo: este change crea el repositorio. Pasos de bootstrap:
1. `pip install -e .` (o `uv sync`).
2. `cp .env.example .env` y completar keys opcionales.
3. `alembic upgrade head`.
4. `python -m cli demo run-end-to-end --input examples/company_input.json --dry-run`.
5. Para activar acciones reales: setear `ALLOW_DOMAIN_PURCHASES=true` y/o `ALLOW_COLD_EMAILS=true`, pasar `execute=true` en payloads.

Rollback: borrar `gtm_mvp.db` y revertir flags. Sin estado externo persistido en dry-run.

## Open Questions

- ¿Conviene usar el MCP oficial de Porkbun en lugar de REST directo? → Decisión inicial: REST directo por control y testabilidad; reevaluar si el MCP simplifica auth/idempotency. Documentar hallazgo en `docs/API_RESEARCH.md`.
- ¿Qué modelo Anthropic exacto usar por agente? → Default `claude-sonnet-4-5`; abrir override per-agent en config si la demo evidencia diferencias de calidad.
- ¿Mailgun US o EU base URL? → Configurable; default US para hackathon.
- ¿Cómo modelar `internal_company_size_range` (free-text vs enum)? → Enum acotado (`solo|2-10|11-50|51-200|201+`) con fallback a `unknown`.
