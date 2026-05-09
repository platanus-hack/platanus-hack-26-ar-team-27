## ADDED Requirements

### Requirement: Análisis de catálogo y priorización de hero SKUs
El Strategy Agent SHALL analizar el catálogo completo del proyecto + brand brief y devolver entre 3 y 5 hero SKUs priorizados por una combinación de margen, velocidad/stock y fit con la marca.

#### Scenario: Catálogo con productos diversos
- **WHEN** el agente recibe un catálogo con productos de diferentes precios, márgenes y stocks
- **THEN** el agente devuelve un array `hero_skus` con entre 3 y 5 SKUs, cada uno con `sku_id, reason, priority_score`.

#### Scenario: Catálogo muy chico (< 3 SKUs)
- **WHEN** el catálogo tiene 1 o 2 productos
- **THEN** el agente devuelve todos los SKUs disponibles como hero, sin fallar por falta de candidatos.

#### Scenario: Catálogo sin datos de margen ni stock
- **WHEN** los productos no tienen `cost` ni `stock`
- **THEN** el agente prioriza por categoría, fit con brand brief, y precio; explica explícitamente la limitación en `reasoning`.

### Requirement: Generación de ICP estructurado
El Strategy Agent SHALL devolver un ICP (Ideal Customer Profile) en JSON estructurado con `age_range, gender, interests, behaviors, pain_points`.

#### Scenario: Brief con target claro
- **WHEN** el brand brief tiene `target_description` definido
- **THEN** el ICP refleja y expande ese target con detalles inferidos del catálogo.

#### Scenario: Brief sin target
- **WHEN** el brand brief no especifica target
- **THEN** el agente infiere el ICP solo del catálogo y deja `confidence: low` en el output.

### Requirement: Detección de categorías para influencer matching
El Strategy Agent SHALL devolver un campo `detected_categories` (array de strings) que mapea el catálogo a categorías canónicas usadas por el influencer matching: `['fashion', 'beauty', 'fitness', 'home', 'food']`.

#### Scenario: Catálogo de moda
- **WHEN** los productos son ropa, accesorios, calzado
- **THEN** `detected_categories` incluye `'fashion'` y posiblemente subcategorías relacionadas.

#### Scenario: Catálogo cross-category
- **WHEN** los productos cruzan varias categorías (ej. moda + beauty)
- **THEN** el agente devuelve todas las categorías relevantes ordenadas por peso en el catálogo.

#### Scenario: Categoría no soportada
- **WHEN** el catálogo es de tech, juguetes, u otra categoría fuera del set de 5
- **THEN** el agente mapea al match más cercano, registra el mismatch en `reasoning`, y la lista de creadores resultante será limitada.

### Requirement: Streaming del razonamiento
El Strategy Agent SHALL emitir eventos al agent event bus durante su ejecución (`agent.started`, `agent.thinking` con tokens delta, `tool.called`, `tool.result`, `agent.completed`).

#### Scenario: Ejecución desde UI
- **WHEN** el usuario dispara Strategy desde el dashboard
- **THEN** el frontend recibe eventos vía SSE en tiempo real y muestra los tokens del razonamiento mientras se generan.

### Requirement: Persistencia del output
El sistema SHALL persistir el output del Strategy Agent en la tabla `strategies` con `hero_skus, icp, detected_categories, reasoning, project_id, created_at`.

#### Scenario: Ejecución exitosa
- **WHEN** el agente termina exitosamente
- **THEN** se inserta una fila en `strategies` y los siguientes agentes (Creative, Influencer Matching) leen de ahí.
