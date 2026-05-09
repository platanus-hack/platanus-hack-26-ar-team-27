## ADDED Requirements

### Requirement: Contrato de eventos compartido
El sistema SHALL definir un tipo `AgentEvent` discriminado por `kind` con las variantes: `agent.started, agent.thinking, tool.called, tool.result, artifact.created, agent.completed, agent.failed`.

#### Scenario: Cada evento incluye agente y run
- **WHEN** se emite cualquier `AgentEvent`
- **THEN** el evento incluye `agent` (nombre canónico: `strategy | creative | influencer | launch`) y `runId` (UUID por ejecución), además de los campos específicos del `kind`.

### Requirement: Persistencia de eventos en Postgres
El sistema SHALL persistir cada evento emitido en la tabla `agent_events` con `id, project_id, run_id, agent, kind, payload, created_at`.

#### Scenario: Evento publicado
- **WHEN** un agente emite un evento
- **THEN** se inserta una fila en `agent_events` antes de notificar al canal SSE.

### Requirement: Fan-out via Postgres LISTEN/NOTIFY
El sistema SHALL usar `pg_notify` para que múltiples conexiones SSE reciban los mismos eventos sin polling.

#### Scenario: Dos clientes mirando el mismo proyecto
- **WHEN** un agente emite un evento para `project_id = X`
- **THEN** ambos clientes conectados a `/api/stream/X` reciben el mismo evento en tiempo real.

### Requirement: Endpoint SSE por proyecto
El sistema SHALL exponer `GET /api/stream/:projectId` que devuelve un stream `text/event-stream` con todos los eventos del proyecto.

#### Scenario: Cliente se conecta a mitad de un run
- **WHEN** un cliente abre la conexión cuando ya hay eventos previos de un `runId` activo
- **THEN** el endpoint envía primero un replay de los eventos previos del run desde `agent_events` ordenados por `created_at`, y luego enchufa al canal LIVE.

#### Scenario: Conexión se cae
- **WHEN** la conexión SSE se interrumpe
- **THEN** el cliente puede reconectar y obtener replay de los eventos perdidos por `runId` y `last_event_id`.

### Requirement: Idempotencia en frontend
El frontend SHALL ignorar eventos duplicados (mismo `id` o mismo `runId+kind+timestamp`) para tolerar replay tras reconexión.

#### Scenario: Replay tras reconexión
- **WHEN** el cliente recibe eventos que ya procesó previamente
- **THEN** el estado de la UI no cambia (no duplica artifacts, no re-renderiza tokens).

### Requirement: Streaming de tokens del LLM
Los agentes que usan LLMs con respuesta larga (Strategy, DM Generator) SHALL emitir `agent.thinking` con `tokens` delta a medida que reciben del modelo, no en batch al final.

#### Scenario: Strategy razonando
- **WHEN** Claude empieza a generar la priorización de hero SKUs
- **THEN** cada chunk de tokens recibido se publica como `agent.thinking` y el frontend lo renderiza incrementalmente.
