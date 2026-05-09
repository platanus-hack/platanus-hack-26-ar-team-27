## ADDED Requirements

### Requirement: Base seed de creadores reales pre-poblada
El sistema SHALL contener una tabla `influencers` pre-poblada con ~100 creadores reales (5 categorías × 20: fashion, beauty, fitness, home, food) con `handle, platform, display_name, avatar_url, followers_count, engagement_rate, bio, recent_post_summary, categories, audience_demo, embedding`.

#### Scenario: Seed completo
- **WHEN** se inicializa el proyecto Supabase
- **THEN** la tabla `influencers` ya contiene los ~100 registros con todos los campos y embeddings calculados.

#### Scenario: Campo `recent_post_summary` siempre presente
- **WHEN** un registro de influencer es persistido en seed
- **THEN** `recent_post_summary` contiene un resumen textual del contenido reciente del creador, generado a partir de scraping real (NO un placeholder).

### Requirement: Matching contra ICP
El Influencer Matching Agent SHALL rankear creadores contra el ICP del proyecto usando: similaridad semántica (embedding ICP vs embedding influencer), filtro por `detected_categories`, y heurísticas de audiencia (`audience_demo` vs `icp.age_range, gender`).

#### Scenario: ICP de mujer 25-35 interesada en moda sustentable
- **WHEN** el agente recibe ese ICP
- **THEN** devuelve top 5 creadores de categoría `fashion` con audiencia femenina 25-34 ordenados por match_score.

#### Scenario: Pocas categorías matcheadas
- **WHEN** `detected_categories` no se solapa con ninguna del seed
- **THEN** el agente devuelve los 5 mejores matches semánticos sin filtro de categoría, marca `match_score` bajo, y agrega un warning en `match_reasoning`.

### Requirement: Generación de DM inicial personalizado por creador
El sistema SHALL generar un DM inicial personalizado por creador matcheado, anclado únicamente a campos reales del influencer (`bio`, `recent_post_summary`, `categories`).

#### Scenario: DM con referencia válida al creador
- **WHEN** se genera un DM para un creador con `recent_post_summary` que menciona "minimalismo y slow living"
- **THEN** el DM puede referenciar esos temas explícitamente y proponer un SKU del catálogo que conecte con esos valores.

#### Scenario: Influencer con bio escasa
- **WHEN** un creador tiene `bio` o `recent_post_summary` vacíos o muy cortos
- **THEN** el DM generado es genérico y breve, sin inventar referencias.

#### Scenario: Anti-alucinación
- **WHEN** se genera un DM
- **THEN** el DM NO menciona títulos de videos, posts específicos, o eventos que no estén textualmente presentes en `bio` o `recent_post_summary` del registro.

### Requirement: Generación de follow-up DM
El sistema SHALL generar un segundo mensaje (`follow_up`) por cada match, pensado para enviar 3-5 días después del inicial si no hay respuesta. El initial y el follow-up se persisten juntos en el campo `draft_messages` (jsonb con keys `initial` y `follow_up`).

#### Scenario: Follow-up referenciando el inicial implícitamente
- **WHEN** se genera el follow-up
- **THEN** el mensaje abre reconociendo el contacto previo (ej. "te escribí hace unos días sobre...") sin pegar el contenido del initial.

#### Scenario: Follow-up con valor agregado
- **WHEN** se genera el follow-up
- **THEN** el mensaje agrega un nuevo ángulo o pregunta concreta (ej. propone otro SKU, pregunta por preferencias de fechas, ofrece sample) — NO repite el primero.

#### Scenario: Follow-up bajo las mismas reglas anti-alucinación
- **WHEN** se genera el follow-up
- **THEN** las mismas reglas que el initial aplican: solo data real del influencer, sin inventar referencias.

#### Scenario: Persistencia conjunta
- **WHEN** ambos mensajes están listos
- **THEN** se persisten en `influencer_matches.draft_messages` como `{ "initial": "...", "follow_up": "..." }`.

### Requirement: SKU recomendado por match
El sistema SHALL incluir en cada match un campo `recommended_skus` (array de `sku_id`) sugiriendo qué productos del catálogo ofrecerle a ese creador.

#### Scenario: Creador de fitness y catálogo con mix
- **WHEN** el creador tiene `categories: ['fitness', 'wellness']` y el catálogo tiene activewear y otros
- **THEN** `recommended_skus` prioriza activewear sobre productos no relacionados.

### Requirement: Persistencia de matches
El sistema SHALL persistir cada match en `influencer_matches` con `project_id, influencer_id, match_score, match_reasoning, draft_message, recommended_skus, status, created_at`.

#### Scenario: Top 5 matches generados
- **WHEN** el agente termina
- **THEN** existen exactamente 5 filas en `influencer_matches` para el `project_id`, ordenables por `match_score` desc.

### Requirement: Streaming de outputs
El Influencer Matching Agent SHALL emitir un evento `artifact.created` al bus por cada match generado.

#### Scenario: UI conectada
- **WHEN** el agente está corriendo
- **THEN** el frontend recibe los matches uno por uno y los renderiza como cards apareciendo.
