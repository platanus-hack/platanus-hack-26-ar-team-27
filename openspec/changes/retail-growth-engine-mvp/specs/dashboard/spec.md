## ADDED Requirements

### Requirement: Vista consolidada del proyecto
El sistema SHALL ofrecer una pantalla `/dashboard/:projectId` que muestre, en una sola vista: estado actual de los agentes, hero SKUs detectados, galería de creatives, lista de influencer matches con DMs, y estado de campañas mock.

#### Scenario: Proyecto recién creado
- **WHEN** el usuario entra al dashboard de un proyecto sin ejecuciones aún
- **THEN** la vista muestra los slots vacíos con CTAs claros: "Generar estrategia", etc.

#### Scenario: Proyecto con ejecuciones completas
- **WHEN** el dashboard carga un proyecto con strategy + creatives + matches generados
- **THEN** muestra los hero SKUs como tags, una galería de las imágenes generadas con sus copys, y cards de creators con su DM expandible.

### Requirement: Stream en vivo de agentes en el dashboard
El dashboard SHALL conectarse al endpoint SSE `/api/stream/:projectId` y mostrar el progreso de cualquier agente activo.

#### Scenario: Agent corriendo
- **WHEN** un agente está activo
- **THEN** el dashboard muestra una zona "live" con el agente actual, los tokens de razonamiento, y un timeline de tools llamadas.

#### Scenario: Multi-agente
- **WHEN** dos agentes corren en secuencia (Strategy → Creative)
- **THEN** la UI muestra ambos en el timeline y el activo se destaca.

### Requirement: Galería de ads
El sistema SHALL mostrar los creatives generados como una galería con imagen + copy debajo, agrupados por hero SKU.

#### Scenario: 9 ads por SKU
- **WHEN** un SKU tiene los 9 ads completos
- **THEN** la galería muestra los 9 con `variant_label` visible (lifestyle/contexto/comparativa × PAS/AIDA/curiosity).

#### Scenario: Generación incremental
- **WHEN** el Creative Engine está corriendo
- **THEN** los ads aparecen en la galería a medida que se generan, sin recargar la página.

### Requirement: Cards de influencers con DMs (initial + follow-up) expandibles
El sistema SHALL mostrar cada `influencer_match` como una card con `avatar_url, display_name, handle, followers_count, engagement_rate, match_score`, y un botón "Ver DMs" que expande un panel con dos tabs: **Initial** y **Follow-up**.

#### Scenario: Card colapsada
- **WHEN** el dashboard carga matches por primera vez
- **THEN** las cards aparecen colapsadas mostrando solo info del creador y el match.

#### Scenario: Tab Initial por default
- **WHEN** el usuario hace click en "Ver DMs"
- **THEN** el panel se expande mostrando primero el `draft_messages.initial` con un botón "Copiar", y un tab para alternar al follow-up.

#### Scenario: Cambio a tab Follow-up
- **WHEN** el usuario hace click en el tab "Follow-up"
- **THEN** se muestra el `draft_messages.follow_up` con un botón "Copiar" y una nota tipo "Enviar 3-5 días después del inicial si no hay respuesta".

### Requirement: Onboarding flow integrado
El dashboard SHALL ofrecer una sección de onboarding guiada para proyectos nuevos: paso 1 catálogo, paso 2 brand brief, paso 3 confirmar y disparar Strategy.

#### Scenario: Primer entrada
- **WHEN** el usuario crea un proyecto nuevo
- **THEN** el onboarding aparece como overlay/wizard hasta completar los 3 pasos; después se cierra y se muestra el dashboard normal.
