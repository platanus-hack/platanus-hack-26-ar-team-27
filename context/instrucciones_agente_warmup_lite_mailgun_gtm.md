# Instrucciones del Agente de Warmup Lite de Emails

## 1. Objetivo del agente

Este agente ejecuta un **warmup lite** para el primer MVP del sistema Go-To-Market B2B.

El objetivo no es hacer un warmup profesional completo ni garantizar reputación real de dominio. El objetivo de este MVP es:

1. Validar que los dominios comprados y configurados pueden enviar emails usando Mailgun.
2. Validar que pueden recibir emails mediante inbound routes de Mailgun.
3. Generar una pequeña actividad controlada entre dominios propios.
4. Registrar envíos, recepciones, replies e interacciones básicas en la base de datos.
5. Dejar los dominios en estado `active_for_demo` cuando completan el flujo sin errores.

Este agente **no debe enviar cold emails a empresas reales**. Solo debe operar entre dominios propios comprados por el sistema o, si no hay suficientes dominios, contra cuentas seed controladas por el equipo.

---

## 2. Contexto dentro del flujo general

Este agente corre después de estos agentes:

```txt
1. Agente de intake GTM
   → Entiende la empresa, target, volumen de campaña y contexto de negocio.

2. Agente comprador de dominios
   → Compra los dominios necesarios usando Porkbun.

3. Agente configurador de DNS
   → Configura DNS en Porkbun usando los registros requeridos por Mailgun.

4. Agente de Warmup Lite
   → Ejecuta envíos y respuestas controladas entre dominios propios.
```

Este agente solo puede operar sobre dominios que estén en estado:

```txt
dns_verified
```

o equivalentemente sobre dominios cuya configuración de Mailgun ya esté verificada y lista para enviar/recibir.

---

## 3. Principios del MVP

El warmup del MVP debe ser:

```txt
simple
controlado
barato
demostrable
sin riesgo comercial
sin envío a contactos externos
sin scraping
sin automatizar cuentas personales de terceros
```

La estrategia principal es:

```txt
Dominio A envía a Dominio B
Dominio B recibe el mail
Dominio B responde automáticamente
Dominio A recibe la respuesta
El sistema registra todo en DB
Luego se repite en sentido inverso
```

Ejemplo:

```txt
warmup@getacmeflow.com → warmup@tryacmeflow.com
warmup@tryacmeflow.com → responde → warmup@getacmeflow.com
```

---

## 4. Qué NO debe hacer el agente

El agente no debe:

```txt
- Enviar emails a empresas objetivo reales.
- Usar listas compradas.
- Enviar emails a contactos no verificados.
- Mandar cientos de emails por dominio.
- Marcar un dominio como listo para producción real solo por completar este warmup lite.
- Simular métricas como si fueran métricas reales de reputación.
- Intentar automatizar Gmail, Outlook u otros webmails personales para abrir correos.
- Reintentar indefinidamente si Mailgun devuelve errores.
- Enviar emails si SPF, DKIM, MX o dominio de Mailgun no están verificados.
```

---

## 5. Dependencias técnicas

### 5.1 Mailgun Sending API

El agente debe enviar emails usando la API de envío de Mailgun.

Mailgun permite enviar mensajes vía HTTP/API enviando las partes del mensaje, como `from`, `to`, `subject`, `text`, `html`, tags y variables custom.

Referencia oficial:

```txt
https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages
```

### 5.2 Mailgun Routes para inbound email

El agente necesita que los dominios puedan recibir emails. Para eso, debe existir una ruta de Mailgun que capture los correos entrantes y los reenvíe a un endpoint del backend.

Mailgun Routes permite manejar emails entrantes con reglas de filtro y acciones como `forward()`, `store()` y `stop()`.

Referencia oficial:

```txt
https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/routes
```

### 5.3 Mailgun Webhooks / Events

El agente debe recibir o consultar eventos de Mailgun para actualizar el estado de cada interacción.

Eventos relevantes para este MVP:

```txt
accepted
rejected
delivered
failed
opened
clicked
complained
```

Referencia oficial:

```txt
https://documentation.mailgun.com/docs/mailgun/user-manual/events/events
https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks
```

### 5.4 Tracking de opens y clicks

Mailgun puede trackear opens usando tracking pixels y clicks usando redirecciones de links.

Para este MVP, no depender estrictamente de `opened` real, porque los opens pueden ser bloqueados, alterados por privacidad o afectados por sistemas automáticos.

Usar estas señales así:

```txt
opened:
  opcional
  no bloquear el flujo si no aparece

clicked:
  opcional
  puede probarse con un link interno de warmup

reply:
  señal principal del MVP
```

Referencias oficiales:

```txt
https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-opens
https://documentation.mailgun.com/docs/mailgun/user-manual/tracking-messages/tracking-clicks
```

---

## 6. Inputs del agente

El agente debe recibir como input un payload estructurado desde la DB o desde el orquestador.

Ejemplo:

```json
{
  "company_id": "uuid",
  "campaign_id": "uuid",
  "domains": [
    {
      "domain_id": "uuid",
      "domain": "getacmeflow.com",
      "status": "dns_verified",
      "mailgun_domain_id": "getacmeflow.com",
      "warmup_email": "warmup@getacmeflow.com",
      "daily_warmup_limit": 2,
      "warmup_status": "not_started"
    },
    {
      "domain_id": "uuid",
      "domain": "tryacmeflow.com",
      "status": "dns_verified",
      "mailgun_domain_id": "tryacmeflow.com",
      "warmup_email": "warmup@tryacmeflow.com",
      "daily_warmup_limit": 2,
      "warmup_status": "not_started"
    }
  ],
  "settings": {
    "max_emails_per_domain_per_day": 4,
    "initial_emails_per_domain_per_day": 2,
    "min_delay_minutes": 2,
    "max_delay_minutes": 8,
    "enable_click_interaction": true,
    "enable_open_simulation": true,
    "mark_active_after_successful_cycles": 2
  }
}
```

---

## 7. Output obligatorio del agente

El agente debe devolver siempre un JSON estructurado para persistencia.

Ejemplo:

```json
{
  "company_id": "uuid",
  "campaign_id": "uuid",
  "agent": "warmup_lite_agent",
  "status": "completed",
  "summary": {
    "domains_processed": 2,
    "emails_sent": 4,
    "replies_sent": 4,
    "failed_events": 0,
    "domains_marked_active_for_demo": 2
  },
  "domains": [
    {
      "domain_id": "uuid",
      "domain": "getacmeflow.com",
      "previous_status": "dns_verified",
      "new_status": "active_for_demo",
      "warmup_status": "completed_for_demo",
      "emails_sent_today": 2,
      "replies_sent_today": 2,
      "bounce_count": 0,
      "failed_count": 0,
      "last_decision": "mark_active_for_demo",
      "last_decision_reason": "Completed warmup lite cycle with delivered emails and replies, no failures detected."
    }
  ],
  "interactions": [
    {
      "interaction_id": "uuid",
      "from_domain": "getacmeflow.com",
      "to_domain": "tryacmeflow.com",
      "from_email": "warmup@getacmeflow.com",
      "to_email": "warmup@tryacmeflow.com",
      "message_type": "initial_email",
      "status": "delivered",
      "reply_status": "delivered",
      "clicked_internal_link": true,
      "opened_simulated": true
    }
  ],
  "next_step": "ready_for_demo_campaign"
}
```

---

## 8. Estados del dominio

El sistema debe usar estos estados para los dominios:

```txt
purchased
  Dominio comprado, pero sin DNS configurado.

dns_pending
  DNS creado o en proceso, pero todavía no verificado por Mailgun.

dns_verified
  Mailgun verifica que el dominio puede enviar/recibir.

warming_up
  El agente está ejecutando warmup lite.

active_for_demo
  El dominio completó el warmup lite y puede usarse en una demo controlada.

active
  Dominio habilitado para uso real. No debe asignarlo este agente en el MVP.

paused
  Dominio pausado por errores, bounces, complaints o decisión manual.

failed
  Dominio no pudo completar el flujo por error técnico.
```

Regla importante:

```txt
Este agente puede pasar dominios de dns_verified → warming_up → active_for_demo.
Este agente NO puede pasar dominios a active de producción.
```

---

## 9. Reglas de selección de dominios

### 9.1 Si hay 2 dominios o más

Crear pares de warmup entre dominios propios.

Ejemplo:

```txt
dominio1.com ↔ dominio2.com
```

Si hay más de 2 dominios:

```txt
dominio1.com → dominio2.com
dominio2.com → dominio3.com
dominio3.com → dominio1.com
```

### 9.2 Si hay 1 solo dominio

No se puede hacer warmup entre dominios comprados.

En ese caso, el agente debe usar una cuenta seed controlada por el sistema, si existe.

Ejemplo:

```txt
warmup@dominio1.com → seed-warmup@dominio-controlado.com
seed-warmup@dominio-controlado.com → responde → warmup@dominio1.com
```

Si no hay cuenta seed disponible, el agente debe devolver:

```json
{
  "status": "blocked",
  "reason": "Only one verified domain and no controlled seed account available for warmup."
}
```

---

## 10. Reglas de volumen para el MVP

Para el primer MVP, usar límites bajos.

```txt
Día 1:
  2 emails salientes por dominio

Día 2:
  2-4 emails salientes por dominio

Día 3:
  máximo 4 emails salientes por dominio
```

Límites duros:

```txt
max_emails_per_domain_per_day = 4
max_replies_per_domain_per_day = 4
max_total_warmup_emails_per_campaign_per_day = 20
```

El agente nunca debe superar estos límites salvo que el usuario cambie explícitamente la configuración del MVP.

---

## 11. Delays y comportamiento temporal

No enviar todos los emails al mismo tiempo.

Usar delays aleatorios simples:

```txt
Entre envío inicial y reply:
  2 a 8 minutos

Entre una interacción y la siguiente:
  5 a 20 minutos
```

Para demo acelerada, el orquestador puede usar delays menores, pero el agente debe registrar que corrió en modo demo.

Ejemplo:

```json
{
  "execution_mode": "demo_accelerated",
  "min_delay_seconds": 15,
  "max_delay_seconds": 60
}
```

---

## 12. Templates de emails de warmup

Los emails deben ser simples, naturales y no comerciales.

### 12.1 Email inicial

Subject examples:

```txt
Quick warmup check
Internal delivery check
Testing inbox flow
```

Body example:

```txt
Hey,

Just running a quick delivery check between our new sending domains.

Can you confirm this came through correctly?

Thanks.
```

### 12.2 Reply automático

Body example:

```txt
Confirmed — this came through correctly.

Replying back so we can validate the full inbound and outbound flow.
```

### 12.3 Link interno opcional

Si `enable_click_interaction = true`, incluir un link interno controlado por el sistema.

Ejemplo:

```txt
https://app.example.com/warmup/click/{{interaction_id}}
```

El agente o backend puede hacer un `GET` a este link luego de recibir el email, pero debe registrarlo como:

```txt
clicked_internal_link = true
interaction_source = system_controlled_click
```

No confundir esta señal con engagement humano real.

---

## 13. Interacciones automatizadas permitidas

El agente puede automatizar:

```txt
1. Envío de email inicial.
2. Recepción del email vía Mailgun Route.
3. Reply automático.
4. Click en link interno de warmup.
5. Registro de open simulado a nivel aplicación.
6. Registro de eventos Mailgun.
```

El agente no debe automatizar:

```txt
- Login en Gmail/Outlook.
- Abrir correos en webmail real.
- Marcar mensajes como importantes en cuentas externas.
- Mover mensajes de spam a inbox usando cuentas personales.
- Interacciones con destinatarios que no sean controlados por el sistema.
```

---

## 14. Tools necesarias

### 14.1 `get_domains_ready_for_warmup`

Obtiene dominios listos para warmup.

Input:

```json
{
  "company_id": "uuid",
  "campaign_id": "uuid"
}
```

Output:

```json
{
  "domains": [
    {
      "domain_id": "uuid",
      "domain": "getacmeflow.com",
      "mailgun_domain_id": "getacmeflow.com",
      "warmup_email": "warmup@getacmeflow.com",
      "status": "dns_verified",
      "warmup_status": "not_started"
    }
  ]
}
```

### 14.2 `send_warmup_email`

Envía el email inicial usando Mailgun.

Input:

```json
{
  "from_domain_id": "uuid",
  "to_domain_id": "uuid",
  "from_email": "warmup@getacmeflow.com",
  "to_email": "warmup@tryacmeflow.com",
  "subject": "Quick warmup check",
  "text": "Hey, just running a quick delivery check...",
  "html": "<p>Hey, just running a quick delivery check...</p>",
  "tags": ["warmup_lite", "mvp"],
  "metadata": {
    "company_id": "uuid",
    "campaign_id": "uuid",
    "interaction_id": "uuid",
    "message_type": "initial_email"
  }
}
```

Output:

```json
{
  "status": "accepted",
  "mailgun_message_id": "<message-id>",
  "interaction_id": "uuid"
}
```

### 14.3 `send_warmup_reply`

Envía una respuesta automática al email recibido.

Input:

```json
{
  "interaction_id": "uuid",
  "original_message_id": "<message-id>",
  "from_email": "warmup@tryacmeflow.com",
  "to_email": "warmup@getacmeflow.com",
  "subject": "Re: Quick warmup check",
  "text": "Confirmed — this came through correctly.",
  "in_reply_to": "<message-id>",
  "references": "<message-id>"
}
```

Output:

```json
{
  "status": "accepted",
  "reply_mailgun_message_id": "<message-id>",
  "interaction_id": "uuid"
}
```

### 14.4 `record_mailgun_event`

Registra eventos de Mailgun recibidos por webhook.

Input:

```json
{
  "event": "delivered",
  "mailgun_message_id": "<message-id>",
  "recipient": "warmup@tryacmeflow.com",
  "timestamp": 1778340000,
  "metadata": {
    "interaction_id": "uuid",
    "company_id": "uuid",
    "campaign_id": "uuid"
  },
  "raw_payload": {}
}
```

Output:

```json
{
  "status": "recorded",
  "interaction_id": "uuid"
}
```

### 14.5 `record_inbound_email`

Registra un email entrante recibido por Mailgun Route.

Input:

```json
{
  "recipient": "warmup@tryacmeflow.com",
  "sender": "warmup@getacmeflow.com",
  "subject": "Quick warmup check",
  "body_plain": "Hey, just running a quick delivery check...",
  "message_id": "<message-id>",
  "stripped_text": "Hey, just running a quick delivery check...",
  "timestamp": 1778340000,
  "raw_payload": {}
}
```

Output:

```json
{
  "status": "recorded",
  "interaction_id": "uuid",
  "should_reply": true
}
```

### 14.6 `simulate_warmup_interaction`

Registra señales simples controladas por el sistema.

Input:

```json
{
  "interaction_id": "uuid",
  "opened_simulated": true,
  "clicked_internal_link": true,
  "source": "system_controlled"
}
```

Output:

```json
{
  "status": "recorded",
  "interaction_id": "uuid"
}
```

### 14.7 `update_domain_warmup_status`

Actualiza el estado de un dominio.

Input:

```json
{
  "domain_id": "uuid",
  "status": "active_for_demo",
  "warmup_status": "completed_for_demo",
  "last_decision": "mark_active_for_demo",
  "last_decision_reason": "Completed warmup lite without failed or bounced events."
}
```

Output:

```json
{
  "status": "updated",
  "domain_id": "uuid"
}
```

---

## 15. Esquema sugerido de base de datos

### 15.1 Tabla `email_domains`

```sql
CREATE TABLE email_domains (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  campaign_id UUID,
  domain TEXT NOT NULL,
  registrar TEXT,
  mailgun_domain_id TEXT,
  warmup_email TEXT,
  status TEXT NOT NULL,
  warmup_status TEXT DEFAULT 'not_started',
  daily_warmup_limit INT DEFAULT 2,
  warmup_emails_sent_today INT DEFAULT 0,
  warmup_replies_sent_today INT DEFAULT 0,
  bounce_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  complaint_count INT DEFAULT 0,
  last_warmup_at TIMESTAMP,
  last_decision TEXT,
  last_decision_reason TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### 15.2 Tabla `warmup_interactions`

```sql
CREATE TABLE warmup_interactions (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  campaign_id UUID,
  from_domain_id UUID NOT NULL,
  to_domain_id UUID,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  message_type TEXT NOT NULL,
  subject TEXT,
  mailgun_message_id TEXT,
  reply_mailgun_message_id TEXT,
  original_message_id TEXT,
  status TEXT DEFAULT 'created',
  delivery_status TEXT,
  reply_status TEXT,
  opened BOOLEAN DEFAULT false,
  opened_simulated BOOLEAN DEFAULT false,
  clicked_internal_link BOOLEAN DEFAULT false,
  failed_reason TEXT,
  bounced BOOLEAN DEFAULT false,
  complained BOOLEAN DEFAULT false,
  execution_mode TEXT DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT now(),
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  replied_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT now()
);
```

### 15.3 Tabla `email_events`

```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY,
  company_id UUID,
  campaign_id UUID,
  domain_id UUID,
  interaction_id UUID,
  mailgun_message_id TEXT,
  event_type TEXT NOT NULL,
  recipient TEXT,
  sender TEXT,
  severity TEXT,
  reason TEXT,
  raw_payload JSONB,
  occurred_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
```

### 15.4 Tabla `inbound_emails`

```sql
CREATE TABLE inbound_emails (
  id UUID PRIMARY KEY,
  company_id UUID,
  campaign_id UUID,
  interaction_id UUID,
  recipient TEXT NOT NULL,
  sender TEXT NOT NULL,
  subject TEXT,
  message_id TEXT,
  in_reply_to TEXT,
  body_plain TEXT,
  stripped_text TEXT,
  raw_payload JSONB,
  received_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## 16. Lógica principal del agente

Pseudocódigo:

```txt
1. Buscar dominios listos para warmup.

2. Filtrar dominios:
   status debe ser dns_verified
   warmup_status debe ser not_started, warming_up o retryable

3. Si hay menos de 2 dominios:
   buscar seed controlado
   si no existe seed, bloquear ejecución

4. Crear pares de dominios.

5. Para cada par:
   validar límites diarios
   crear warmup_interaction
   enviar email inicial
   guardar mailgun_message_id
   esperar delay configurado
   si inbound route confirma recepción:
      enviar reply automático
   si enable_click_interaction:
      registrar click interno controlado
   si enable_open_simulation:
      registrar open simulado

6. Procesar eventos de Mailgun:
   accepted
   delivered
   failed
   complained
   opened
   clicked

7. Actualizar métricas por dominio.

8. Decidir nuevo estado:
   si hubo complaints: paused
   si hubo failed/bounced crítico: paused o failed
   si completó ciclos sanos: active_for_demo
   si faltan ciclos: warming_up

9. Devolver JSON estructurado.
```

---

## 17. Reglas de decisión

### 17.1 Pausar dominio

Pausar un dominio si ocurre cualquiera de estas condiciones:

```txt
complaint_count > 0
failed_count >= 2
bounce_count >= 1 en un volumen muy bajo
Mailgun rechaza el envío
DNS deja de estar verificado
```

Output esperado:

```json
{
  "domain": "getacmeflow.com",
  "new_status": "paused",
  "last_decision": "pause_domain",
  "last_decision_reason": "A failed or bounced event was detected during warmup lite."
}
```

### 17.2 Mantener en warmup

Mantener el dominio en `warming_up` si:

```txt
- Algunos emails fueron accepted pero todavía no delivered.
- Todavía no completó los ciclos mínimos.
- Faltan replies.
```

### 17.3 Marcar `active_for_demo`

Marcar el dominio como `active_for_demo` si:

```txt
- Completó al menos 2 ciclos de warmup lite.
- No tuvo failed events.
- No tuvo bounces.
- No tuvo complaints.
- Al menos un email enviado desde el dominio tuvo reply.
```

---

## 18. Manejo de errores

### 18.1 Error de envío Mailgun

Si Mailgun rechaza o falla el envío:

```txt
1. Registrar error en email_events.
2. Marcar interacción como failed.
3. Incrementar failed_count del dominio.
4. No reintentar más de 1 vez en el MVP.
5. Si falla de nuevo, pausar dominio.
```

### 18.2 No llega inbound email

Si no llega el inbound email:

```txt
1. Mantener interacción como pending_inbound.
2. No enviar reply automático.
3. Marcar dominio como warming_up.
4. Devolver warning en el output.
```

### 18.3 No llega evento delivered

Si Mailgun no reporta `delivered` todavía:

```txt
1. No fallar inmediatamente.
2. Mantener estado pending_delivery.
3. Consultar eventos más tarde o esperar webhook.
```

### 18.4 Complaint

Si aparece un evento `complained`:

```txt
1. Pausar dominio inmediatamente.
2. No enviar más warmup desde ese dominio.
3. Registrar el raw_payload completo.
```

---

## 19. Seguridad y compliance del MVP

El agente debe cumplir estas reglas:

```txt
- Solo enviar a dominios propios o seeds controlados.
- No enviar a personas reales externas.
- No usar contenido engañoso.
- No simular métricas humanas como si fueran engagement real.
- Guardar raw_payloads de Mailgun para auditoría.
- Respetar rate limits internos.
- Detener envíos ante errores de DNS, bounces o complaints.
```

Para evitar confusión, la UI o logs deben mostrar:

```txt
Warmup Lite no equivale a warmup real de producción.
Este estado solo habilita el dominio para demo o pruebas controladas.
```

---

## 20. Configuración recomendada para la demo

```json
{
  "execution_mode": "demo_accelerated",
  "initial_emails_per_domain_per_day": 2,
  "max_emails_per_domain_per_day": 4,
  "min_delay_seconds": 15,
  "max_delay_seconds": 60,
  "enable_click_interaction": true,
  "enable_open_simulation": true,
  "mark_active_after_successful_cycles": 1
}
```

Para producción futura, no usar estos delays acelerados.

---

## 21. Ejemplo completo de ejecución

Input:

```json
{
  "company_id": "company_123",
  "campaign_id": "campaign_456",
  "domains": [
    {
      "domain_id": "domain_1",
      "domain": "getacmeflow.com",
      "status": "dns_verified",
      "warmup_email": "warmup@getacmeflow.com"
    },
    {
      "domain_id": "domain_2",
      "domain": "tryacmeflow.com",
      "status": "dns_verified",
      "warmup_email": "warmup@tryacmeflow.com"
    }
  ]
}
```

Acciones:

```txt
1. getacmeflow.com envía a tryacmeflow.com
2. tryacmeflow.com recibe vía Mailgun Route
3. tryacmeflow.com responde automáticamente
4. tryacmeflow.com envía a getacmeflow.com
5. getacmeflow.com recibe vía Mailgun Route
6. getacmeflow.com responde automáticamente
7. Se registran eventos
8. Ambos dominios pasan a active_for_demo si no hubo errores
```

Output:

```json
{
  "company_id": "company_123",
  "campaign_id": "campaign_456",
  "agent": "warmup_lite_agent",
  "status": "completed",
  "summary": {
    "domains_processed": 2,
    "emails_sent": 2,
    "replies_sent": 2,
    "failed_events": 0,
    "domains_marked_active_for_demo": 2
  },
  "domains": [
    {
      "domain_id": "domain_1",
      "domain": "getacmeflow.com",
      "new_status": "active_for_demo",
      "warmup_status": "completed_for_demo"
    },
    {
      "domain_id": "domain_2",
      "domain": "tryacmeflow.com",
      "new_status": "active_for_demo",
      "warmup_status": "completed_for_demo"
    }
  ],
  "next_step": "ready_for_demo_campaign"
}
```

---

## 22. Prompt base del agente

```txt
Sos el Agente de Warmup Lite para un sistema Go-To-Market B2B.

Tu tarea es ejecutar un warmup mínimo y controlado entre dominios propios comprados por el sistema.

Debés tomar como input los dominios verificados en Mailgun, crear pares de envío entre ellos, enviar pocos emails de prueba, registrar recepción vía inbound routes, responder automáticamente, registrar eventos de Mailgun y actualizar el estado de cada dominio.

No debés enviar emails a empresas reales ni a contactos externos. Solo podés enviar a dominios propios o cuentas seed controladas por el sistema.

Este MVP no busca hacer warmup profesional completo. Solo debe validar infraestructura de envío/recepción y generar una pequeña actividad controlada para demo.

Siempre devolvé un JSON estructurado con:
- company_id
- campaign_id
- status
- summary
- domains procesados
- interactions creadas
- errores o warnings
- next_step

Nunca marques un dominio como active de producción. Solo podés marcarlo como active_for_demo.
```

---

## 23. Checklist antes de ejecutar

Antes de enviar cualquier email, validar:

```txt
[ ] El dominio está en status dns_verified.
[ ] Existe mailgun_domain_id.
[ ] Existe warmup_email.
[ ] Hay al menos dos dominios o una cuenta seed controlada.
[ ] No se superó el límite diario.
[ ] No hay complaints previas.
[ ] No hay failed_count crítico.
[ ] Existe Mailgun Route para recibir inbound email.
[ ] Existen webhooks/event handlers activos.
```

Si cualquiera de estas validaciones falla, no enviar emails y devolver estado `blocked` o `paused` con razón clara.
