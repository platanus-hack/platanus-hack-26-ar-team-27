# Instrucciones del Agente de Research y Envío de Campañas B2B

## 1. Rol del agente

Este agente toma como input el contexto aprobado de una empresa B2B con MVP, los dominios comprados/configurados/warmupeados, y la cantidad de empresas objetivo a alcanzar. Su responsabilidad es:

1. Investigar empresas objetivo que encajen con el ICP definido.
2. Priorizar esas empresas según fit comercial.
3. Identificar contactos B2B apropiados cuando sea posible y permitido.
4. Generar emails outbound personalizados usando el contexto de negocio aprobado.
5. Enviar emails mediante Mailgun usando dominios activos.
6. Registrar en base de datos toda la trazabilidad de research, contacto, envío y eventos.
7. Respetar límites de volumen, suppressions, opt-outs y estado de salud de los dominios.

Este agente **no define nuevamente el negocio**. Consume el output estructurado de los agentes anteriores.

---

## 2. Inputs esperados

El agente debe recibir o poder leer de DB:

```json
{
  "company_id": "uuid",
  "company_name": "Acme AI",
  "business_context": "Acme AI ayuda a equipos de ventas B2B a...",
  "target_customer_types": [
    {
      "segment_name": "SaaS B2B early-stage",
      "industry": ["SaaS", "Software", "B2B Services"],
      "company_size_range": "11-200",
      "geography": ["United States", "LATAM"],
      "buyer_personas": ["Head of Sales", "Founder", "VP Growth"],
      "pain_points": ["low reply rates", "manual prospecting", "slow outbound setup"],
      "negative_filters": ["B2C", "enterprise-only", "agencies without sales team"]
    }
  ],
  "target_accounts_total": 50,
  "organization_size_range": "1-10",
  "campaign_goal": "validate demand and book discovery calls",
  "approved_sending_domains": [
    {
      "domain_id": "uuid",
      "domain": "getacmeflow.com",
      "status": "active_for_demo",
      "mailgun_domain": "mg.getacmeflow.com",
      "from_email": "lucia@getacmeflow.com",
      "daily_campaign_limit": 5,
      "sent_today": 0
    }
  ]
}
```

Si faltan dominios activos, el agente **no debe enviar** y debe dejar el estado de campaña en `blocked_waiting_for_domains`.

---

## 3. Output obligatorio del agente

El agente siempre debe devolver y guardar un objeto estructurado:

```json
{
  "company_id": "uuid",
  "campaign_id": "uuid",
  "status": "ready_for_review | sending | partially_sent | completed | blocked | paused",
  "target_accounts_requested": 50,
  "target_accounts_found": 50,
  "target_accounts_approved_for_send": 30,
  "emails_queued": 30,
  "emails_sent": 10,
  "emails_blocked": 0,
  "domains_used": ["getacmeflow.com", "tryacmeflow.com"],
  "summary": "Se encontraron 50 empresas con fit, se priorizaron 30 y se enviaron 10 emails dentro del límite diario.",
  "next_action": "continue_sending_next_cycle"
}
```

---

## 4. Principios operativos

### 4.1 No inventar datos

El agente no puede inventar:

- Empresas.
- Sitios web.
- Personas.
- Cargos.
- Emails.
- Clientes actuales.
- Métricas.
- Funding.
- Tecnologías usadas.
- Noticias o triggers.

Todo dato de research debe tener `source_url`, `source_type` y `confidence_score`.

### 4.2 No enviar a contactos inválidos o suprimidos

Antes de enviar, el agente debe chequear:

- Email válido o suficientemente confiable.
- Que el contacto no esté en suppression list interna.
- Que Mailgun no lo tenga como bounce, complaint o unsubscribe.
- Que la empresa no esté marcada como `do_not_contact`.
- Que el dominio remitente esté activo y con límite disponible.

### 4.3 Human-in-the-loop para el MVP

Para el primer MVP, el agente debe operar así:

```txt
Research -> Generar lista -> Generar emails -> Pedir aprobación del usuario -> Enviar primera tanda
```

Una vez que el usuario aprueba la primera tanda, el agente puede continuar con los próximos ciclos respetando límites.

### 4.4 Compliance mínima obligatoria

Todo email comercial debe:

- Tener remitente real y consistente con la empresa.
- No usar subject engañoso.
- No hacerse pasar por otra persona o empresa.
- Incluir opt-out simple.
- Respetar opt-outs y suppressions.
- Incluir dirección postal o placeholder configurable de dirección comercial si aplica al mercado objetivo.
- No enviar a personas en categorías sensibles ni usar datos sensibles para personalización.

El agente debe bloquear el envío si no existe una forma de opt-out funcional.

---

## 5. Flujo principal del agente

### Paso 1: Cargar contexto aprobado

El agente debe leer:

- Empresa que vende.
- Contexto de negocio aprobado.
- ICP / tipos de clientes objetivo.
- Cantidad de empresas a alcanzar.
- Dominios disponibles.
- Límites de envío por dominio.
- Estado de warmup.

Si el contexto de negocio está vacío o no aprobado, debe devolver:

```json
{
  "status": "blocked",
  "reason": "business_context_not_approved"
}
```

### Paso 2: Cargar dominios aptos para campaña

Solo se pueden usar dominios con estado:

```txt
active_for_demo
active
```

No se pueden usar dominios con estado:

```txt
purchased
dns_pending
dns_verified
warming_up
paused
failed
burned
```

Si no hay dominios aptos:

```json
{
  "status": "blocked",
  "reason": "no_active_sending_domains"
}
```

### Paso 3: Calcular capacidad de envío

El agente debe calcular:

```txt
capacidad_diaria_total = suma(daily_campaign_limit - sent_today) de dominios activos
```

Ejemplo:

```txt
Dominio A: límite 5, enviados hoy 2 -> capacidad 3
Dominio B: límite 5, enviados hoy 0 -> capacidad 5
Capacidad total hoy = 8 emails
```

El agente nunca debe superar:

- Límite diario por dominio.
- Límite diario total de campaña.
- Límite de contactos por empresa.
- Límite de follow-ups por contacto.

### Paso 4: Research de empresas objetivo

El agente debe buscar empresas que coincidan con el ICP. Para cada empresa encontrada debe guardar:

```json
{
  "account_id": "uuid",
  "company_id": "uuid",
  "name": "Example SaaS Inc.",
  "website": "https://example.com",
  "linkedin_url": "https://linkedin.com/company/example",
  "industry": "SaaS",
  "estimated_employee_range": "11-50",
  "geography": "United States",
  "description": "Software de gestión para equipos comerciales.",
  "fit_score": 0.86,
  "fit_reasons": [
    "B2B SaaS",
    "equipo comercial visible",
    "tamaño dentro del ICP"
  ],
  "disqualifying_flags": [],
  "research_sources": [
    {
      "source_url": "https://example.com/about",
      "source_type": "company_website",
      "observed_fact": "La empresa vende software B2B para ventas.",
      "confidence_score": 0.9
    }
  ],
  "status": "researched"
}
```

### Paso 5: Scoring de empresas

El agente debe asignar `fit_score` de 0 a 1.

Criterios sugeridos:

```txt
+0.25 industria coincide
+0.20 tamaño coincide
+0.15 geografía coincide
+0.15 buyer persona probable existe
+0.15 dolor observable coincide
+0.10 trigger o señal reciente relevante
-0.30 filtro negativo detectado
-0.50 empresa claramente fuera del ICP
```

Clasificación:

```txt
0.80 - 1.00: high_fit
0.60 - 0.79: medium_fit
0.40 - 0.59: low_fit
<0.40: reject
```

Para el MVP, enviar solo a `high_fit` y opcionalmente `medium_fit` si faltan cuentas.

### Paso 6: Research de contactos

Para cada cuenta priorizada, el agente debe buscar contactos de acuerdo con las buyer personas aprobadas.

Ejemplo:

```json
{
  "contact_id": "uuid",
  "account_id": "uuid",
  "full_name": "Jane Doe",
  "role_title": "VP of Sales",
  "seniority": "executive",
  "department": "sales",
  "email": "jane@example.com",
  "email_confidence": 0.78,
  "email_source": "public_company_page | approved_data_provider | manual_upload",
  "linkedin_url": "https://linkedin.com/in/janedoe",
  "status": "ready_for_validation"
}
```

Reglas:

- Preferir emails profesionales corporativos.
- No usar emails personales si no hay base legal o aprobación explícita.
- No usar datos sensibles para personalizar.
- No enviar a más de 1 contacto por empresa en el MVP, salvo aprobación explícita.
- Si no hay contacto confiable, guardar la empresa como `no_contact_found` y no enviar.

### Paso 7: Validación de email

Antes de enviar, el agente debe validar cada email con una tool de validación disponible.

Estados sugeridos:

```txt
valid
risky
invalid
unknown
```

Reglas:

```txt
valid -> puede enviar
risky -> no enviar en MVP, salvo aprobación explícita
invalid -> no enviar
unknown -> no enviar en MVP
```

Si se usa Mailgun Validate u otro proveedor, guardar respuesta cruda resumida en DB.

### Paso 8: Generación de email

El agente debe generar un email breve y personalizado, basado en:

- Contexto del negocio que vende.
- Segmento del ICP.
- Research real de la empresa objetivo.
- Dolor probable.
- CTA de baja fricción.

Formato recomendado:

```txt
Subject: corto, específico, no engañoso
Body:
  - Primera línea personalizada basada en dato verificado.
  - Hipótesis de dolor.
  - Propuesta de valor en 1-2 frases.
  - CTA simple.
  - Opt-out.
```

Ejemplo:

```txt
Subject: idea rápida para {{company_name}}

Hola {{first_name}},

Vi que {{target_company}} trabaja con {{verified_context}}.

Estamos ayudando a equipos B2B a {{business_value}} sin tener que {{pain_or_current_alternative}}.

¿Tiene sentido que te mande 2 líneas con una idea concreta para {{target_company}}?

Si no sos la persona correcta o preferís que no te escriba, decime y no te contacto más.

{{sender_name}}
{{sender_company}}
{{postal_address_or_company_footer}}
```

Restricciones:

- No prometer resultados no comprobados.
- No decir “vi que están buscando X” salvo que haya fuente real.
- No fingir relación previa.
- No usar urgencia falsa.
- No usar asuntos tipo “Re:” o “Fwd:” si no hubo conversación previa.

### Paso 9: Aprobación previa del usuario

Para el MVP, antes del primer envío, el agente debe mostrar:

```json
{
  "campaign_preview": {
    "accounts_selected": 10,
    "emails_to_send_now": 5,
    "domains_to_use": ["getacmeflow.com"],
    "sample_emails": [
      {
        "target_company": "Example SaaS Inc.",
        "contact": "Jane Doe",
        "subject": "idea rápida para Example SaaS",
        "body": "..."
      }
    ],
    "risks_or_warnings": []
  },
  "confirmation_question": "¿Confirmás que enviemos esta primera tanda? Podés corregir cuentas, tono o CTA antes de enviar."
}
```

Si el usuario aprueba, el agente puede enviar.

### Paso 10: Envío por Mailgun

Para cada email aprobado:

- Seleccionar dominio con capacidad disponible.
- Seleccionar `from_email` del dominio.
- Enviar por Mailgun.
- Agregar tags y metadata.
- Guardar `mailgun_message_id`.

Parámetros mínimos recomendados:

```json
{
  "from": "Lucía from Acme <lucia@getacmeflow.com>",
  "to": "jane@example.com",
  "subject": "idea rápida para Example SaaS",
  "text": "...",
  "html": "...",
  "o:tracking": true,
  "o:tracking-clicks": true,
  "o:tracking-opens": true,
  "o:tag": ["outbound", "mvp", "campaign_uuid"],
  "v:company_id": "uuid",
  "v:campaign_id": "uuid",
  "v:account_id": "uuid",
  "v:contact_id": "uuid"
}
```

El agente debe registrar cada envío con estado inicial `queued` o `sent` según respuesta de Mailgun.

### Paso 11: Procesar eventos de Mailgun

El agente debe consumir eventos/webhooks y actualizar estado:

```txt
accepted -> accepted
delivered -> delivered
opened -> opened
clicked -> clicked
failed permanent -> bounced / failed_permanent
failed temporary -> failed_temporary / retrying
complained -> complained + suppress
unsubscribed -> unsubscribed + suppress
replied -> replied, si se detecta por inbound route o mailbox parser
```

Ante `complained`, `unsubscribed` o hard bounce:

- Agregar contacto a suppression interna.
- No volver a enviar a ese contacto.
- Reducir salud del dominio si aplica.

---

## 6. Tools necesarias

### 6.1 Contexto y DB

```txt
get_campaign_context(company_id)
get_approved_business_context(company_id)
list_active_sending_domains(company_id)
get_domain_daily_usage(domain_id)
create_campaign(company_id, config)
update_campaign_status(campaign_id, status)
```

### 6.2 Research

```txt
search_target_accounts(icp_filters, limit)
fetch_company_profile(company_url_or_name)
fetch_company_public_pages(company_url)
find_company_linkedin(company_name)
extract_research_facts(raw_content)
score_target_account(account, icp)
save_target_account(account_payload)
```

### 6.3 Contact discovery

```txt
find_contacts_for_account(account_id, buyer_personas)
validate_contact_email(email)
check_internal_suppression(email)
check_mailgun_suppression(domain, email)
save_contact(contact_payload)
```

### 6.4 Email generation

```txt
generate_personalized_email(company_context, account_research, contact, campaign_goal)
validate_email_copy(email_payload)
save_email_draft(email_draft_payload)
```

### 6.5 Envío

```txt
select_sending_domain(company_id, campaign_id)
send_email_via_mailgun(domain, message_payload)
record_email_send(send_payload)
update_domain_send_usage(domain_id)
```

### 6.6 Eventos

```txt
record_mailgun_event(event_payload)
update_email_send_status(message_id, status)
add_to_suppression_list(email, reason)
update_domain_health(domain_id, metrics)
```

---

## 7. Modelo de datos sugerido

### 7.1 `outreach_campaigns`

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "name": "MVP outbound campaign - May 2026",
  "status": "draft | ready_for_review | sending | paused | completed | blocked",
  "target_accounts_requested": 50,
  "target_accounts_found": 0,
  "emails_planned": 0,
  "emails_sent": 0,
  "reply_count": 0,
  "bounce_count": 0,
  "complaint_count": 0,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 7.2 `target_accounts`

```json
{
  "id": "uuid",
  "campaign_id": "uuid",
  "company_id": "uuid",
  "name": "Example SaaS Inc.",
  "website": "https://example.com",
  "linkedin_url": "https://linkedin.com/company/example",
  "industry": "SaaS",
  "estimated_employee_range": "11-50",
  "geography": "United States",
  "description": "...",
  "fit_score": 0.86,
  "fit_tier": "high_fit",
  "fit_reasons": ["..."],
  "disqualifying_flags": [],
  "status": "researched | approved | rejected | contacted | replied | do_not_contact",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 7.3 `research_artifacts`

```json
{
  "id": "uuid",
  "account_id": "uuid",
  "source_url": "https://example.com/about",
  "source_type": "company_website | linkedin | news | directory | manual_upload",
  "raw_excerpt": "...",
  "observed_fact": "La empresa vende software B2B para ventas.",
  "confidence_score": 0.9,
  "created_at": "timestamp"
}
```

### 7.4 `contacts`

```json
{
  "id": "uuid",
  "account_id": "uuid",
  "full_name": "Jane Doe",
  "first_name": "Jane",
  "last_name": "Doe",
  "role_title": "VP of Sales",
  "department": "sales",
  "seniority": "executive",
  "email": "jane@example.com",
  "email_validation_status": "valid",
  "email_confidence": 0.82,
  "email_source": "approved_data_provider",
  "linkedin_url": "https://linkedin.com/in/janedoe",
  "status": "ready | contacted | replied | bounced | unsubscribed | suppressed",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 7.5 `email_drafts`

```json
{
  "id": "uuid",
  "campaign_id": "uuid",
  "account_id": "uuid",
  "contact_id": "uuid",
  "subject": "idea rápida para Example SaaS",
  "body_text": "...",
  "body_html": "...",
  "personalization_facts_used": [
    {
      "fact": "La empresa vende software B2B para ventas.",
      "source_url": "https://example.com/about"
    }
  ],
  "status": "draft | approved | rejected | sent",
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 7.6 `email_sends`

```json
{
  "id": "uuid",
  "campaign_id": "uuid",
  "account_id": "uuid",
  "contact_id": "uuid",
  "email_draft_id": "uuid",
  "sending_domain_id": "uuid",
  "from_email": "lucia@getacmeflow.com",
  "to_email": "jane@example.com",
  "mailgun_message_id": "...",
  "subject": "idea rápida para Example SaaS",
  "status": "queued | accepted | delivered | opened | clicked | replied | bounced | failed | complained | unsubscribed",
  "sent_at": "timestamp",
  "delivered_at": "timestamp",
  "opened_at": "timestamp",
  "clicked_at": "timestamp",
  "replied_at": "timestamp",
  "failed_at": "timestamp",
  "failure_reason": null,
  "created_at": "timestamp",
  "updated_at": "timestamp"
}
```

### 7.7 `suppression_list`

```json
{
  "id": "uuid",
  "company_id": "uuid",
  "email": "jane@example.com",
  "domain": "example.com",
  "reason": "unsubscribe | complaint | hard_bounce | manual | do_not_contact",
  "source": "mailgun | user | system",
  "created_at": "timestamp"
}
```

### 7.8 `mailgun_events`

```json
{
  "id": "uuid",
  "email_send_id": "uuid",
  "mailgun_message_id": "...",
  "event_type": "delivered",
  "event_payload": {},
  "event_timestamp": "timestamp",
  "created_at": "timestamp"
}
```

---

## 8. Reglas de límites para MVP

Para evitar quemar dominios y mantener simple el sistema:

```txt
max_contacts_per_account = 1
max_first_emails_per_domain_per_day = daily_campaign_limit del dominio
max_followups_per_contact = 1
min_delay_between_sends_minutes = 5
max_total_sends_per_run = capacidad diaria disponible
```

Para demo:

```txt
Si el dominio viene de Warmup Lite:
  daily_campaign_limit recomendado = 3 a 5 emails/día
```

---

## 9. Secuencia de emails para MVP

### Email 1: apertura

Objetivo: validar interés, no vender agresivamente.

```txt
Subject: idea rápida para {{target_company}}

Hola {{first_name}},

Vi que {{target_company}} {{verified_company_context}}.

Estamos ayudando a {{segment}} a {{value_proposition}} sin {{pain_or_friction}}.

¿Tiene sentido que te mande una idea concreta para ver si aplica a {{target_company}}?

Si preferís que no te contacte más, respondeme “no” y lo marco.

{{sender_name}}
{{sender_company}}
{{sender_footer}}
```

### Follow-up 1: solo si no respondió

Enviar después de 3 a 5 días, si está permitido.

```txt
Subject: Re: idea rápida para {{target_company}}

Hola {{first_name}},

Te escribo una sola vez más.

La hipótesis era que {{target_company}} podría beneficiarse de {{short_value_prop}}, especialmente si hoy {{pain_hypothesis}}.

¿Vale la pena que te pase 2 bullets o no es prioridad?

{{sender_name}}
```

No enviar más follow-ups en el MVP.

---

## 10. Criterios de bloqueo

El agente debe bloquear el envío si ocurre cualquiera de estos casos:

```txt
- No hay contexto de negocio aprobado.
- No hay dominios activos.
- Dominio no tiene DNS/Mailgun verificado.
- Dominio no pasó warmup mínimo.
- No existe opt-out funcional.
- Contacto está en suppression.
- Email inválido o riesgoso.
- Cuenta marcada como do_not_contact.
- Se alcanzó el límite diario del dominio.
- Bounce rate del dominio supera umbral configurado.
- Complaint rate mayor a 0 en MVP.
- El usuario no aprobó la primera tanda.
```

---

## 11. Métricas que debe reportar

Después de cada ciclo, el agente debe reportar:

```json
{
  "campaign_id": "uuid",
  "accounts_researched": 50,
  "accounts_high_fit": 22,
  "contacts_found": 18,
  "contacts_valid": 15,
  "emails_generated": 15,
  "emails_sent": 5,
  "delivery_rate": 1.0,
  "open_rate": 0.4,
  "click_rate": 0.0,
  "reply_rate": 0.0,
  "bounce_rate": 0.0,
  "complaint_rate": 0.0,
  "unsubscribes": 0,
  "next_recommended_action": "send_next_batch_tomorrow"
}
```

---

## 12. Prompt base interno del agente

```txt
Sos el Agente de Research y Envío de Campañas B2B.

Tu tarea es encontrar empresas objetivo que coincidan con el ICP aprobado, investigar datos públicos o provistos por herramientas aprobadas, priorizar cuentas, identificar un contacto profesional por empresa, generar emails outbound personalizados y enviarlos por Mailgun usando dominios activos.

No redefinas el negocio. Usá el contexto de negocio aprobado.
No inventes datos. Cada afirmación personalizada debe venir de una fuente guardada.
No envíes a contactos inválidos, suprimidos o sin opt-out funcional.
No superes los límites diarios de los dominios.
Para el primer MVP, pedí aprobación del usuario antes de la primera tanda de envíos.
Después de enviar, registrá cada evento de Mailgun y actualizá campaña, contacto, cuenta y dominio.

Tu output siempre debe ser JSON estructurado y persistible.
```

---

## 13. Ejemplo de ejecución end-to-end

### Input

```json
{
  "company_id": "cmp_123",
  "target_accounts_total": 25,
  "business_context": "La empresa ayuda a founders B2B a lanzar outbound en pocos días.",
  "target_customer_types": ["B2B SaaS de 1 a 50 empleados"],
  "approved_sending_domains": ["getacmeflow.com"]
}
```

### Output previo a aprobación

```json
{
  "status": "ready_for_review",
  "target_accounts_found": 25,
  "contacts_valid": 12,
  "emails_ready": 12,
  "emails_to_send_first_batch": 5,
  "sample_emails": [
    {
      "target_company": "Example SaaS",
      "contact": "Jane Doe",
      "subject": "idea rápida para Example SaaS",
      "body_preview": "Hola Jane, vi que Example SaaS..."
    }
  ],
  "confirmation_question": "¿Confirmás enviar esta primera tanda de 5 emails?"
}
```

### Output posterior al envío

```json
{
  "status": "partially_sent",
  "emails_sent": 5,
  "domain_usage": [
    {
      "domain": "getacmeflow.com",
      "sent_today": 5,
      "daily_campaign_limit": 5
    }
  ],
  "next_action": "continue_next_cycle_when_domain_capacity_resets"
}
```

---

## 14. Definición de éxito del agente

El agente funciona correctamente si:

1. Encuentra empresas que matchean el ICP.
2. Guarda evidencia del research.
3. Identifica contactos válidos sin inventar datos.
4. Genera emails personalizados pero seguros.
5. Pide aprobación antes de la primera tanda.
6. Envía usando dominios activos y límites disponibles.
7. Registra todos los eventos de Mailgun.
8. Respeta suppressions y opt-outs.
9. Produce output estructurado y persistible.

